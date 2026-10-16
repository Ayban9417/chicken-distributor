-- Current receipt dates are separate from immutable inventory movement dates.
alter table public.receiving_receipts add column effective_date date;
alter table public.transfer_receipts add column effective_date date;

update public.receiving_receipts r set effective_date = (
  select min(m.effective_date) from public.inventory_movements m
  where m.organization_id = r.organization_id and m.reference_type = 'receiving_receipt'
    and m.reference_id = r.id and m.movement_type = 'warehouse_to_salesman'
);
update public.transfer_receipts r set effective_date = (
  select min(m.effective_date) from public.inventory_movements m
  where m.organization_id = r.organization_id and m.reference_type = 'transfer_receipt'
    and m.reference_id = r.id and m.movement_type = 'salesman_to_salesman'
);

create function private.set_receipt_effective_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reference_type = 'receiving_receipt' and new.movement_type = 'warehouse_to_salesman' then
    update public.receiving_receipts set effective_date = new.effective_date
    where id = new.reference_id and organization_id = new.organization_id and effective_date is null;
  elsif new.reference_type = 'transfer_receipt' and new.movement_type = 'salesman_to_salesman' then
    update public.transfer_receipts set effective_date = new.effective_date
    where id = new.reference_id and organization_id = new.organization_id and effective_date is null;
  end if;
  return new;
end;
$$;
create trigger receipt_effective_date_from_movement after insert on public.inventory_movements
for each row execute function private.set_receipt_effective_date();
revoke all on function private.set_receipt_effective_date() from public, anon, authenticated, service_role;

create function private.inspect_transfer_correction(
  p_organization_id uuid, p_receipt_id uuid, p_module text, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rr public.receiving_receipts%rowtype;
  v_tf public.transfer_receipts%rowtype;
  v_line_id uuid;
  v_old_lot uuid;
  v_old_qty numeric;
  v_old_movement public.inventory_movements%rowtype;
  v_receipt_number text;
  v_old_date date;
  v_old_notes text;
  v_old_from uuid;
  v_old_to uuid;
  v_new_date date;
  v_new_notes text;
  v_new_from uuid;
  v_new_to uuid;
  v_new_lot uuid;
  v_new_qty numeric;
  v_stock_changed boolean;
  v_blockers jsonb := '[]'::jsonb;
  v_original jsonb;
  v_proposed jsonb;
  v_old_source text;
  v_new_source text;
  v_old_destination numeric;
  v_new_source_available numeric;
  v_new_lot_trip_date date;
  v_signature jsonb;
  v_prior_custody_correction boolean;
begin
  if p_module not in ('warehouse_transfer', 'salesman_transfer') then
    raise exception 'Unknown transfer correction module' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_changes) k(key)
                where k.key not in ('effectiveDate', 'fromSalesmanId', 'toSalesmanId', 'lotId', 'quantityKg', 'notes'))
     or jsonb_typeof(p_changes->'effectiveDate') is distinct from 'string'
     or jsonb_typeof(p_changes->'toSalesmanId') is distinct from 'string'
     or jsonb_typeof(p_changes->'lotId') is distinct from 'string'
     or jsonb_typeof(p_changes->'quantityKg') is distinct from 'number'
     or (p_changes ? 'notes' and jsonb_typeof(p_changes->'notes') not in ('string', 'null')) then
    raise exception 'Invalid transfer correction fields' using errcode = '22023';
  end if;
  if p_module = 'salesman_transfer' and jsonb_typeof(p_changes->'fromSalesmanId') is distinct from 'string' then
    raise exception 'Sending Salesman is required' using errcode = '22023';
  end if;
  if p_changes->>'effectiveDate' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter a valid receipt date' using errcode = '22023';
  end if;
  v_new_date := (p_changes->>'effectiveDate')::date;
  v_new_to := (p_changes->>'toSalesmanId')::uuid;
  v_new_from := case when p_module = 'salesman_transfer' then (p_changes->>'fromSalesmanId')::uuid else null end;
  v_new_lot := (p_changes->>'lotId')::uuid;
  v_new_qty := (p_changes->>'quantityKg')::numeric;
  v_new_notes := nullif(btrim(p_changes->>'notes'), '');
  if v_new_qty <= 0 or v_new_qty <> round(v_new_qty, 3) or v_new_qty >= 100000000000
     or length(coalesce(v_new_notes, '')) > 2000 then
    raise exception 'Invalid transfer quantity or notes' using errcode = '22023';
  end if;

  if p_module = 'warehouse_transfer' then
    select * into v_rr from public.receiving_receipts
    where id = p_receipt_id and organization_id = p_organization_id;
    if not found then raise exception 'Receiving Receipt not found' using errcode = 'P0002'; end if;
    v_receipt_number := v_rr.receipt_number;
    v_old_to := v_rr.salesman_user_id;
    v_old_date := v_rr.effective_date;
    v_old_notes := v_rr.notes;
    select l.id, l.inventory_lot_id, l.quantity_kg into v_line_id, v_old_lot, v_old_qty
    from public.receiving_receipt_lines l where l.receipt_id = p_receipt_id;
    if (select count(*) from public.receiving_receipt_lines where receipt_id = p_receipt_id) <> 1 then
      v_blockers := v_blockers || jsonb_build_array('Multi-line Receiving Receipts require a separate correction workflow.');
    end if;
    v_old_source := 'warehouse'; v_new_source := 'warehouse';
  else
    select * into v_tf from public.transfer_receipts
    where id = p_receipt_id and organization_id = p_organization_id;
    if not found then raise exception 'Transfer Receipt not found' using errcode = 'P0002'; end if;
    v_receipt_number := v_tf.receipt_number;
    v_old_from := v_tf.from_salesman_user_id;
    v_old_to := v_tf.to_salesman_user_id;
    v_old_date := v_tf.effective_date;
    v_old_notes := v_tf.notes;
    select l.id, l.inventory_lot_id, l.quantity_kg into v_line_id, v_old_lot, v_old_qty
    from public.transfer_receipt_lines l where l.receipt_id = p_receipt_id;
    if (select count(*) from public.transfer_receipt_lines where receipt_id = p_receipt_id) <> 1 then
      v_blockers := v_blockers || jsonb_build_array('Multi-line Transfer Receipts require a separate correction workflow.');
    end if;
    v_old_source := 'salesman'; v_new_source := 'salesman';
  end if;
  if v_line_id is null or v_old_date is null then
    v_blockers := v_blockers || jsonb_build_array('Receipt line or original effective date is missing.');
  end if;
  select * into v_old_movement from public.inventory_movements m
  where m.organization_id = p_organization_id and m.reference_id = p_receipt_id
    and m.reference_line_id = v_line_id
    and m.reference_type = case when p_module = 'warehouse_transfer' then 'receiving_receipt' else 'transfer_receipt' end
    and m.movement_type = case when p_module = 'warehouse_transfer' then 'warehouse_to_salesman' else 'salesman_to_salesman' end;
  select exists (select 1 from public.transaction_corrections c
    where c.organization_id = p_organization_id and c.module = p_module
      and c.transaction_id = p_receipt_id and c.status = 'applied'
      and c.inventory_adjustments <> '[]'::jsonb
      and c.applied_values->>'lotId' = v_old_lot::text
      and (c.applied_values->>'quantityKg')::numeric = v_old_qty
      and c.applied_values->>'fromSalesmanId' is not distinct from v_old_from::text
      and c.applied_values->>'toSalesmanId' = v_old_to::text
  ) into v_prior_custody_correction;
  if v_old_movement.id is null or v_old_movement.inventory_lot_id is distinct from v_old_lot
     or v_old_movement.quantity_kg is distinct from v_old_qty
     or v_old_movement.to_salesman_user_id is distinct from v_old_to
     or v_old_movement.from_salesman_user_id is distinct from v_old_from then
    if v_old_movement.id is null or not v_prior_custody_correction then
      v_blockers := v_blockers || jsonb_build_array('Original receipt movement does not reconcile with its line or latest custody correction.');
    end if;
  end if;
  if v_new_date < date '2000-01-01' or v_new_date > (now() at time zone 'Asia/Manila')::date then
    v_blockers := v_blockers || jsonb_build_array('Receipt date must not be future-dated or before 2000.');
  end if;
  if not private.is_active_salesman(p_organization_id, v_new_to)
     or (p_module = 'salesman_transfer' and (v_new_from = v_new_to
       or not private.is_active_salesman(p_organization_id, v_new_from))) then
    v_blockers := v_blockers || jsonb_build_array('Select active, distinct Salesmen in this organization.');
  end if;
  select st.trip_date into v_new_lot_trip_date from public.inventory_lots il
    join public.stock_trip_lines sl on sl.id = il.stock_trip_line_id
    join public.stock_trips st on st.id = sl.stock_trip_id
    where il.id = v_new_lot and il.organization_id = p_organization_id
      and st.organization_id = p_organization_id and st.status = 'received';
  if not found or v_new_lot_trip_date > v_new_date then
    v_blockers := v_blockers || jsonb_build_array('Source lot must exist in this organization before the corrected receipt date.');
  end if;
  v_stock_changed := v_new_lot is distinct from v_old_lot or v_new_qty is distinct from v_old_qty
    or v_new_from is distinct from v_old_from or v_new_to is distinct from v_old_to;
  if not v_stock_changed and v_new_date = v_old_date and v_new_notes is not distinct from v_old_notes then
    v_blockers := v_blockers || jsonb_build_array('Make at least one change before confirming.');
  end if;
  if v_stock_changed or v_new_date is distinct from v_old_date then
    if exists (select 1 from public.inventory_movements m where m.inventory_lot_id = v_new_lot
      and m.movement_type = 'stock_in' and m.effective_date > v_new_date) then
      v_blockers := v_blockers || jsonb_build_array('Source lot was stocked in after the corrected receipt date.');
    end if;
    if exists (select 1 from public.discrepancies d where d.organization_id = p_organization_id
      and d.related_entity_id in (p_receipt_id, v_line_id, v_old_lot, v_new_lot)) then
      v_blockers := v_blockers || jsonb_build_array('Related discrepancy requires separate review.');
    end if;
    if exists (select 1 from public.transaction_corrections c where c.organization_id = p_organization_id
      and c.module = p_module and c.transaction_id = p_receipt_id and c.inventory_adjustments <> '[]'::jsonb) then
      v_blockers := v_blockers || jsonb_build_array('This receipt already has a custody correction; further stock or date edits need manual review.');
    end if;
    if exists (select 1 from public.inventory_movements m where m.inventory_lot_id = v_old_lot
      and m.id <> v_old_movement.id and m.created_at >= v_old_movement.created_at
      and (m.reference_id <> p_receipt_id or m.reference_type <> v_old_movement.reference_type))
      or exists (select 1 from public.sale_lines where inventory_lot_id = v_old_lot) then
      v_blockers := v_blockers || jsonb_build_array('Source stock has later movements or Sales; correct them separately.');
    end if;
    if v_new_lot <> v_old_lot and exists (
      select 1 from public.inventory_movements m where m.inventory_lot_id = v_new_lot
        and m.movement_type not in ('stock_in', 'warehouse_to_salesman')
    ) then
      v_blockers := v_blockers || jsonb_build_array('Replacement lot has dependent movements.');
    end if;
    if v_old_movement.id is not null and v_new_date < v_old_movement.effective_date
      and exists (select 1 from public.inventory_movements m where m.inventory_lot_id = v_old_lot
        and m.effective_date > v_new_date and m.created_at < v_old_movement.created_at) then
      v_blockers := v_blockers || jsonb_build_array('Corrected date would precede an earlier source movement.');
    end if;
    v_old_destination := private.custody_balance(v_old_lot, 'salesman', v_old_to);
    v_new_source_available := private.custody_balance(v_new_lot, v_new_source, v_new_from);
    if v_old_destination < v_old_qty then
      v_blockers := v_blockers || jsonb_build_array('Original recipient no longer holds the transferred stock.');
    end if;
    if v_new_lot = v_old_lot and v_new_from is not distinct from v_old_from then
      v_new_source_available := v_new_source_available + v_old_qty;
    elsif p_module = 'salesman_transfer' and v_new_lot = v_old_lot and v_new_from = v_old_to then
      v_new_source_available := v_new_source_available - v_old_qty;
    end if;
    if v_new_source_available < v_new_qty then
      v_blockers := v_blockers || jsonb_build_array('Insufficient stock in the proposed source custody.');
    end if;
    if p_module = 'salesman_transfer' and exists (
      select 1 from public.inventory_movements m where m.inventory_lot_id = v_new_lot
        and m.to_salesman_user_id = v_new_from and m.effective_date > v_new_date
    ) then
      v_blockers := v_blockers || jsonb_build_array('Proposed sender received this lot after the corrected transfer date.');
    end if;
  end if;
  v_original := jsonb_build_object('effectiveDate', v_old_date, 'fromSalesmanId', v_old_from,
    'toSalesmanId', v_old_to, 'lotId', v_old_lot, 'quantityKg', v_old_qty,
    'notes', v_old_notes, 'receiptNumber', v_receipt_number);
  v_proposed := jsonb_build_object('effectiveDate', v_new_date, 'fromSalesmanId', v_new_from,
    'toSalesmanId', v_new_to, 'lotId', v_new_lot, 'quantityKg', v_new_qty,
    'notes', v_new_notes, 'receiptNumber', v_receipt_number);
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) into v_signature
    from public.inventory_movements m where m.inventory_lot_id in (v_old_lot, v_new_lot);
  return jsonb_build_object(
    'originalValues', v_original, 'proposedValues', v_proposed,
    'affectedRecords', jsonb_build_array(jsonb_build_object('type', p_module, 'id', p_receipt_id),
      jsonb_build_object('type', 'receipt_line', 'id', v_line_id),
      jsonb_build_object('type', 'inventory_lot', 'id', v_old_lot)),
    'expectedInventoryChanges', case when v_stock_changed then jsonb_build_array(
      jsonb_build_object('lotId', v_old_lot, 'from', v_old_source, 'fromSalesmanId', v_old_from,
        'toSalesmanId', v_old_to, 'quantityKg', -v_old_qty),
      jsonb_build_object('lotId', v_new_lot, 'from', v_new_source, 'fromSalesmanId', v_new_from,
        'toSalesmanId', v_new_to, 'quantityKg', v_new_qty)) else '[]'::jsonb end,
    'expectedFinancialChanges', '[]'::jsonb, 'blockedReasons', v_blockers,
    'eligible', jsonb_array_length(v_blockers) = 0,
    'versionToken', md5(jsonb_build_object('receipt', case when p_module = 'warehouse_transfer' then to_jsonb(v_rr) else to_jsonb(v_tf) end,
      'line', jsonb_build_object('id', v_line_id, 'lotId', v_old_lot, 'quantityKg', v_old_qty),
      'originalMovement', to_jsonb(v_old_movement), 'movements', v_signature,
      'oldDestination', v_old_destination, 'newSource', v_new_source_available)::text)
  );
end;
$$;

create function public.preview_receiving_receipt_correction(p_organization_id uuid, p_receipt_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  return private.inspect_transfer_correction(p_organization_id, p_receipt_id, 'warehouse_transfer', p_changes);
end;
$$;
create function public.preview_transfer_receipt_correction(p_organization_id uuid, p_receipt_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  return private.inspect_transfer_correction(p_organization_id, p_receipt_id, 'salesman_transfer', p_changes);
end;
$$;

create function private.apply_transfer_correction(
  p_organization_id uuid, p_receipt_id uuid, p_module text, p_actor_user_id uuid,
  p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_preview jsonb;
  v_old jsonb;
  v_new jsonb;
  v_correction_id uuid := gen_random_uuid();
  v_affected jsonb;
  v_old_lot uuid;
  v_new_lot uuid;
  v_line_id uuid;
  v_reverse_id uuid;
  v_replace_id uuid;
  v_stock_changed boolean;
  v_source_type text;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id = p.id
  where p.id = p_actor_user_id and p.active and m.organization_id = p_organization_id
    and m.role = 'owner_admin' and m.active for share of p, m;
  if not found then raise exception 'Active Owner / Admin authorization is required' using errcode = '42501'; end if;
  perform private.assert_correction_actor(p_organization_id, p_actor_user_id);
  if p_module = 'warehouse_transfer' then
    perform 1 from public.receiving_receipts where id = p_receipt_id and organization_id = p_organization_id for update;
  elsif p_module = 'salesman_transfer' then
    perform 1 from public.transfer_receipts where id = p_receipt_id and organization_id = p_organization_id for update;
  else
    raise exception 'Unknown transfer correction module' using errcode = '22023';
  end if;
  if not found then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  if p_module = 'warehouse_transfer' then
    perform 1 from public.receiving_receipt_lines where receipt_id = p_receipt_id order by id for update;
  else
    perform 1 from public.transfer_receipt_lines where receipt_id = p_receipt_id order by id for update;
  end if;
  perform 1 from public.inventory_lots where organization_id = p_organization_id
    and id in ((p_changes->>'lotId')::uuid,
      case when p_module = 'warehouse_transfer' then
        (select inventory_lot_id from public.receiving_receipt_lines where receipt_id = p_receipt_id limit 1)
      else (select inventory_lot_id from public.transfer_receipt_lines where receipt_id = p_receipt_id limit 1) end)
    order by id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 14902));
  v_preview := private.inspect_transfer_correction(p_organization_id, p_receipt_id, p_module, p_changes);
  perform private.assert_correction_request(p_organization_id, p_actor_user_id, p_reason,
    p_request_id, p_expected_version, v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception '%', (select string_agg(value, ' ') from jsonb_array_elements_text(v_preview->'blockedReasons')) using errcode = '55000';
  end if;
  v_old := v_preview->'originalValues'; v_new := v_preview->'proposedValues';
  v_old_lot := (v_old->>'lotId')::uuid; v_new_lot := (v_new->>'lotId')::uuid;
  v_stock_changed := v_preview->'expectedInventoryChanges' <> '[]'::jsonb;
  v_source_type := case when p_module = 'warehouse_transfer' then 'warehouse' else 'salesman' end;
  v_affected := v_preview->'affectedRecords';
  if p_module = 'warehouse_transfer' then
    update public.receiving_receipts set effective_date = (v_new->>'effectiveDate')::date,
      salesman_user_id = (v_new->>'toSalesmanId')::uuid, notes = v_new->>'notes'
    where id = p_receipt_id;
    update public.receiving_receipt_lines set inventory_lot_id = v_new_lot,
      quantity_kg = (v_new->>'quantityKg')::numeric where receipt_id = p_receipt_id returning id into v_line_id;
  else
    update public.transfer_receipts set effective_date = (v_new->>'effectiveDate')::date,
      from_salesman_user_id = (v_new->>'fromSalesmanId')::uuid,
      to_salesman_user_id = (v_new->>'toSalesmanId')::uuid, notes = v_new->>'notes'
    where id = p_receipt_id;
    update public.transfer_receipt_lines set inventory_lot_id = v_new_lot,
      quantity_kg = (v_new->>'quantityKg')::numeric where receipt_id = p_receipt_id returning id into v_line_id;
  end if;
  if v_stock_changed then
    v_reverse_id := gen_random_uuid(); v_replace_id := gen_random_uuid();
    insert into public.inventory_movements (
      id, organization_id, inventory_lot_id, movement_type, quantity_kg,
      from_location_type, from_salesman_user_id, to_location_type, to_salesman_user_id,
      reference_type, reference_id, reference_line_id, effective_date, notes, created_by
    ) values (
      v_reverse_id, p_organization_id, v_old_lot, 'adjustment_in', (v_old->>'quantityKg')::numeric,
      'salesman', (v_old->>'toSalesmanId')::uuid, v_source_type, (v_old->>'fromSalesmanId')::uuid,
      'transaction_correction', v_correction_id, gen_random_uuid(), (now() at time zone 'Asia/Manila')::date,
      'Reverse prior receipt custody for Admin correction', p_actor_user_id
    ), (
      v_replace_id, p_organization_id, v_new_lot, 'adjustment_out', (v_new->>'quantityKg')::numeric,
      v_source_type, (v_new->>'fromSalesmanId')::uuid, 'salesman', (v_new->>'toSalesmanId')::uuid,
      'transaction_correction', v_correction_id, gen_random_uuid(), (now() at time zone 'Asia/Manila')::date,
      'Apply corrected receipt custody', p_actor_user_id
    );
    if private.custody_balance(v_old_lot, 'salesman', (v_old->>'toSalesmanId')::uuid) < 0
      or private.custody_balance(v_new_lot, v_source_type, (v_new->>'fromSalesmanId')::uuid) < 0 then
      raise exception 'Corrected custody failed reconciliation' using errcode = '55000';
    end if;
    v_affected := v_affected || jsonb_build_array(
      jsonb_build_object('type', 'inventory_movement', 'id', v_reverse_id),
      jsonb_build_object('type', 'inventory_movement', 'id', v_replace_id));
  end if;
  insert into public.transaction_corrections (
    id, organization_id, module, transaction_id, transaction_reference, correction_action,
    admin_user_id, reason, original_values, proposed_values, applied_values,
    affected_record_ids, inventory_adjustments, financial_adjustments,
    status, version_token, request_id
  ) values (v_correction_id, p_organization_id, p_module, p_receipt_id, v_old->>'receiptNumber', 'edit',
    p_actor_user_id, btrim(p_reason), v_old, v_new, v_new, v_affected,
    v_preview->'expectedInventoryChanges', '[]'::jsonb, 'applied', p_expected_version, p_request_id);
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (p_organization_id, p_actor_user_id,
    case when p_module = 'warehouse_transfer' then 'receiving_receipt' else 'transfer_receipt' end,
    p_receipt_id, 'CORRECT_TRANSFER_RECEIPT', v_old,
    jsonb_build_object('correction_id', v_correction_id, 'request_id', p_request_id, 'applied', v_new));
  return jsonb_build_object('correctionId', v_correction_id, 'receiptId', p_receipt_id,
    'inventoryChanges', v_preview->'expectedInventoryChanges');
end;
$$;

create function public.apply_receiving_receipt_correction(
  p_organization_id uuid, p_receipt_id uuid, p_actor_user_id uuid,
  p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_transfer_correction(p_organization_id, p_receipt_id, 'warehouse_transfer',
    p_actor_user_id, p_reason, p_request_id, p_expected_version, p_changes);
end;
$$;
create function public.apply_transfer_receipt_correction(
  p_organization_id uuid, p_receipt_id uuid, p_actor_user_id uuid,
  p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_transfer_correction(p_organization_id, p_receipt_id, 'salesman_transfer',
    p_actor_user_id, p_reason, p_request_id, p_expected_version, p_changes);
end;
$$;

revoke all on function private.inspect_transfer_correction(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.apply_transfer_correction(uuid, uuid, text, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_receiving_receipt_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_transfer_receipt_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_receiving_receipt_correction(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_transfer_receipt_correction(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.preview_receiving_receipt_correction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.preview_transfer_receipt_correction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_receiving_receipt_correction(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role;
grant execute on function public.apply_transfer_receipt_correction(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role;
