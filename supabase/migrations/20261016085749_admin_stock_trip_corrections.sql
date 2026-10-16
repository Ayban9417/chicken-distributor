-- Phase 2: corrections are accepted only through the password-verified Edge Function.
-- Existing nonempty references must be unique before this migration can be applied.
create unique index stock_trips_org_reference_ci_key on public.stock_trips
  (organization_id, lower(btrim(reference_number)))
  where reference_number is not null and btrim(reference_number) <> '' and status <> 'cancelled';

create function private.inspect_stock_trip_correction(
  p_organization_id uuid, p_stock_trip_id uuid, p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.stock_trips%rowtype;
  v_date date;
  v_reference text;
  v_notes text;
  v_input jsonb;
  v_line record;
  v_line_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_bags integer;
  v_heads integer;
  v_line_changed boolean;
  v_change_count integer := 0;
  v_warehouse numeric;
  v_stock_in_count integer;
  v_downstream text;
  v_receipts integer;
  v_transfers integer;
  v_sales integer;
  v_first_later_date date;
  v_movement_signature jsonb;
  v_token_lines jsonb := '[]'::jsonb;
  v_original_lines jsonb := '[]'::jsonb;
  v_proposed_lines jsonb := '[]'::jsonb;
  v_affected jsonb := '[]'::jsonb;
  v_inventory jsonb := '[]'::jsonb;
  v_financial jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_original jsonb;
  v_proposed jsonb;
begin
  select * into v_trip from public.stock_trips
  where id = p_stock_trip_id and organization_id = p_organization_id and status = 'received';
  if not found then
    raise exception 'Received Stock-In Trip not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_changes) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_changes) as k(key)
                where k.key not in ('tripDate', 'reference', 'notes', 'lines'))
     or (p_changes ? 'reference' and jsonb_typeof(p_changes->'reference') not in ('string', 'null'))
     or (p_changes ? 'notes' and jsonb_typeof(p_changes->'notes') not in ('string', 'null'))
     or jsonb_typeof(p_changes->'lines') is distinct from 'array' then
    raise exception 'Invalid Stock-In correction fields' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes->'lines') = 0 or (select count(*) from jsonb_array_elements(p_changes->'lines')) <>
     (select count(distinct value->>'id') from jsonb_array_elements(p_changes->'lines')) then
    raise exception 'Duplicate Trip line IDs are not allowed' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_changes->'lines')) <>
     (select count(*) from public.stock_trip_lines where stock_trip_id = v_trip.id) then
    raise exception 'Every original Trip line must be retained' using errcode = '22023';
  end if;

  if p_changes ? 'tripDate' then
    if coalesce(p_changes->>'tripDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Enter a valid Trip date' using errcode = '22023';
    end if;
    v_date := (p_changes->>'tripDate')::date;
  else
    v_date := v_trip.trip_date;
  end if;
  if v_date < date '2000-01-01' or v_date > (now() at time zone 'Asia/Manila')::date then
    v_blockers := v_blockers || jsonb_build_array('Trip date must not be in the future or before 2000.');
  end if;
  v_reference := case when p_changes ? 'reference' then nullif(btrim(p_changes->>'reference'), '') else v_trip.reference_number end;
  v_notes := case when p_changes ? 'notes' then nullif(btrim(p_changes->>'notes'), '') else v_trip.notes end;
  if length(coalesce(v_reference, '')) > 160 or length(coalesce(v_notes, '')) > 2000 then
    raise exception 'Reference or notes exceed the permitted length' using errcode = '22023';
  end if;
  if v_reference is not null and exists (
    select 1 from public.stock_trips st
    where st.organization_id = p_organization_id and st.id <> v_trip.id and st.status <> 'cancelled'
      and lower(btrim(st.reference_number)) = lower(v_reference)
  ) then
    v_blockers := v_blockers || jsonb_build_array('Reference number is already used by another Trip.');
  end if;
  if v_date is distinct from v_trip.trip_date or v_reference is distinct from v_trip.reference_number
     or v_notes is distinct from v_trip.notes then
    v_change_count := 1;
  end if;
  v_affected := jsonb_build_array(jsonb_build_object('type', 'stock_trip', 'id', v_trip.id));

  for v_input in select value from jsonb_array_elements(p_changes->'lines') order by value->>'id'
  loop
    if jsonb_typeof(v_input) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_input) as k(key)
                  where k.key not in ('id', 'quantityKg', 'costPerKg', 'bags', 'headCount')) then
      raise exception 'Invalid Trip line correction fields' using errcode = '22023';
    end if;
    v_line_id := (v_input->>'id')::uuid;
    select stl.*, il.id as lot_id, il.original_quantity_kg as lot_quantity,
      il.cost_per_kg as lot_cost, pp.uses_bags, pp.uses_head_count, pr.name as product_name
    into v_line
    from public.stock_trip_lines stl
    left join public.inventory_lots il on il.stock_trip_line_id = stl.id
    join public.plant_products pp on pp.id = stl.plant_product_id
    join public.products pr on pr.id = pp.product_id
    where stl.id = v_line_id and stl.stock_trip_id = v_trip.id;
    if not found or v_line.lot_id is null then
      raise exception 'Trip line or inventory lot is missing' using errcode = '55000';
    end if;
    if jsonb_typeof(v_input->'quantityKg') is distinct from 'number'
       or jsonb_typeof(v_input->'costPerKg') is distinct from 'number'
       or (v_input ? 'bags' and jsonb_typeof(v_input->'bags') not in ('number', 'null'))
       or (v_input ? 'headCount' and jsonb_typeof(v_input->'headCount') not in ('number', 'null')) then
      raise exception 'Trip quantities and costs must be numeric' using errcode = '22023';
    end if;
    v_qty := (v_input->>'quantityKg')::numeric;
    v_cost := (v_input->>'costPerKg')::numeric;
    v_bags := (v_input->>'bags')::integer;
    v_heads := (v_input->>'headCount')::integer;
    if v_qty <= 0 or v_qty <> round(v_qty, 3) or v_qty >= 100000000000
       or v_cost < 0 or v_cost <> round(v_cost, 2) or v_cost >= 1000000000000
       or (v_bags is not null and v_bags < 0) or (v_heads is not null and v_heads < 0)
       or (v_line.acquisition_type = 'purchased' and v_cost = 0)
       or (v_line.acquisition_type = 'free_from_plant' and v_cost <> 0) then
      raise exception 'Invalid quantity, cost, bags, heads, or acquisition valuation' using errcode = '22023';
    end if;
    if (not v_line.uses_bags and v_bags is distinct from v_line.bags)
       or (not v_line.uses_head_count and v_heads is distinct from v_line.head_count) then
      v_blockers := v_blockers || jsonb_build_array(v_line.product_name || ': bags or heads are not configured for editing.');
    end if;
    v_line_changed := v_qty is distinct from v_line.quantity_kg or v_cost is distinct from v_line.cost_per_kg
      or v_bags is distinct from v_line.bags or v_heads is distinct from v_line.head_count;
    if v_line_changed then v_change_count := v_change_count + 1; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', im.id, 'type', im.movement_type, 'quantityKg', im.quantity_kg,
      'effectiveDate', im.effective_date, 'referenceId', im.reference_id,
      'referenceLineId', im.reference_line_id, 'createdAt', im.created_at
    ) order by im.id), '[]'::jsonb),
    count(*) filter (where im.movement_type = 'stock_in' and im.reference_type = 'stock_trip'
      and im.reference_id = v_trip.id and im.reference_line_id = v_line.id),
    string_agg(distinct case
      when im.movement_type = 'warehouse_to_salesman' then 'Warehouse-to-Salesman transfer'
      when im.movement_type = 'salesman_to_salesman' then 'Salesman-to-Salesman transfer'
      when im.movement_type = 'sale' then 'Sale'
      when im.movement_type = 'stock_in' then null
      when im.movement_type in ('adjustment_in', 'adjustment_out')
        and im.reference_type = 'transaction_correction'
        and exists (select 1 from public.transaction_corrections c
          where c.id = im.reference_id and c.organization_id = p_organization_id
            and c.module = 'stock_in' and c.transaction_id = v_trip.id) then null
      else 'Other inventory movement' end, ', '),
    min(im.effective_date) filter (where im.movement_type <> 'stock_in')
    into v_movement_signature, v_stock_in_count, v_downstream, v_first_later_date
    from public.inventory_movements im where im.inventory_lot_id = v_line.lot_id;
    select count(*) into v_receipts from public.receiving_receipt_lines where inventory_lot_id = v_line.lot_id;
    select count(*) into v_transfers from public.transfer_receipt_lines where inventory_lot_id = v_line.lot_id;
    select count(*) into v_sales from public.sale_lines where inventory_lot_id = v_line.lot_id;
    v_warehouse := private.custody_balance(v_line.lot_id, 'warehouse', null);
    if v_line.lot_quantity <> v_line.quantity_kg or v_line.lot_cost <> v_line.cost_per_kg or v_stock_in_count <> 1 then
      v_blockers := v_blockers || jsonb_build_array(v_line.product_name || ': original lot and Stock-In movement do not reconcile.');
    end if;
    if v_date is distinct from v_trip.trip_date and v_first_later_date is not null and v_date > v_first_later_date then
      v_blockers := v_blockers || jsonb_build_array(v_line.product_name || ': Trip date would follow an existing inventory movement.');
    end if;
    if v_line_changed and (v_downstream is not null or v_receipts > 0 or v_transfers > 0 or v_sales > 0) then
      v_blockers := v_blockers || jsonb_build_array(v_line.product_name || ': stock has dependent '
        || concat_ws(', ', v_downstream, case when v_receipts > 0 then 'Receiving Receipt' end,
          case when v_transfers > 0 then 'Transfer Receipt' end, case when v_sales > 0 then 'Sale line' end) || '.');
    end if;
    if v_line_changed and v_warehouse <> v_line.quantity_kg then
      v_blockers := v_blockers || jsonb_build_array(v_line.product_name || ': Warehouse balance does not equal original Trip quantity.');
    end if;
    if v_line_changed and exists (
      select 1 from public.discrepancies d
      where d.organization_id = p_organization_id and d.related_entity_id in (v_trip.id, v_line.id, v_line.lot_id)
    ) then
      v_blockers := v_blockers || jsonb_build_array(v_line.product_name || ': a related discrepancy must be resolved separately.');
    end if;

    v_original_lines := v_original_lines || jsonb_build_array(jsonb_build_object(
      'id', v_line.id, 'lotId', v_line.lot_id, 'product', v_line.product_name,
      'codeId', v_line.code_id, 'classTypeId', v_line.class_type_id,
      'quantityKg', v_line.quantity_kg, 'costPerKg', v_line.cost_per_kg,
      'bags', v_line.bags, 'headCount', v_line.head_count, 'acquisitionType', v_line.acquisition_type
    ));
    v_proposed_lines := v_proposed_lines || jsonb_build_array(jsonb_build_object(
      'id', v_line.id, 'lotId', v_line.lot_id, 'product', v_line.product_name,
      'codeId', v_line.code_id, 'classTypeId', v_line.class_type_id,
      'quantityKg', v_qty, 'costPerKg', v_cost,
      'bags', v_bags, 'headCount', v_heads, 'acquisitionType', v_line.acquisition_type
    ));
    v_affected := v_affected || jsonb_build_array(
      jsonb_build_object('type', 'stock_trip_line', 'id', v_line.id),
      jsonb_build_object('type', 'inventory_lot', 'id', v_line.lot_id)
    );
    if v_qty <> v_line.quantity_kg then
      v_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
        'lotId', v_line.lot_id, 'product', v_line.product_name,
        'warehouseDeltaKg', v_qty - v_line.quantity_kg,
        'beforeKg', v_line.quantity_kg, 'afterKg', v_qty
      ));
    end if;
    if v_qty <> v_line.quantity_kg or v_cost <> v_line.cost_per_kg then
      v_financial := v_financial || jsonb_build_array(jsonb_build_object(
        'lotId', v_line.lot_id, 'product', v_line.product_name,
        'acquisitionValueBefore', round(v_line.quantity_kg * v_line.cost_per_kg, 2),
        'acquisitionValueAfter', round(v_qty * v_cost, 2),
        'acquisitionValueDelta', round(v_qty * v_cost, 2) - round(v_line.quantity_kg * v_line.cost_per_kg, 2)
      ));
    end if;
    v_token_lines := v_token_lines || jsonb_build_array(jsonb_build_object(
      'line', to_jsonb(v_line), 'movements', v_movement_signature,
      'receipts', v_receipts, 'transfers', v_transfers, 'sales', v_sales
    ));
  end loop;
  if v_change_count = 0 then
    v_blockers := v_blockers || jsonb_build_array('Make at least one change before confirming a correction.');
  end if;
  v_original := jsonb_build_object('tripDate', v_trip.trip_date, 'reference', v_trip.reference_number,
    'notes', v_trip.notes, 'tripNumber', v_trip.trip_number, 'lines', v_original_lines);
  v_proposed := jsonb_build_object('tripDate', v_date, 'reference', v_reference,
    'notes', v_notes, 'tripNumber', v_trip.trip_number, 'lines', v_proposed_lines);
  return jsonb_build_object(
    'originalValues', v_original, 'proposedValues', v_proposed,
    'affectedRecords', v_affected, 'expectedInventoryChanges', v_inventory,
    'expectedFinancialChanges', v_financial, 'blockedReasons', v_blockers,
    'eligible', jsonb_array_length(v_blockers) = 0,
    'versionToken', md5(jsonb_build_object('trip', to_jsonb(v_trip), 'lines', v_token_lines)::text)
  );
end;
$$;

create function public.preview_stock_trip_correction(
  p_organization_id uuid, p_stock_trip_id uuid, p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  return private.inspect_stock_trip_correction(p_organization_id, p_stock_trip_id, p_changes);
end;
$$;

create function public.apply_stock_trip_correction(
  p_organization_id uuid, p_stock_trip_id uuid, p_actor_user_id uuid,
  p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.stock_trips%rowtype;
  v_preview jsonb;
  v_correction_id uuid := gen_random_uuid();
  v_affected jsonb;
  v_movement_id uuid;
  v_line jsonb;
  v_old public.stock_trip_lines%rowtype;
  v_new_qty numeric;
  v_new_cost numeric;
  v_delta numeric;
  v_lot_id uuid;
begin
  perform 1 from public.profiles p
    join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id and p.active and m.organization_id = p_organization_id
      and m.role = 'owner_admin' and m.active
    for share of p, m;
  if not found then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  perform private.assert_correction_actor(p_organization_id, p_actor_user_id);
  -- Serialize Trip corrections and align with transfer/Sale RPCs, which lock lots.
  select * into v_trip from public.stock_trips
  where id = p_stock_trip_id and organization_id = p_organization_id and status = 'received' for update;
  if not found then raise exception 'Received Stock-In Trip not found' using errcode = 'P0002'; end if;
  perform 1 from public.stock_trip_lines where stock_trip_id = v_trip.id order by id for update;
  perform 1 from public.inventory_lots il
    join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    where stl.stock_trip_id = v_trip.id order by il.id for update of il;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 14902));
  v_preview := private.inspect_stock_trip_correction(p_organization_id, p_stock_trip_id, p_changes);
  perform private.assert_correction_request(p_organization_id, p_actor_user_id, p_reason,
    p_request_id, p_expected_version, v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception '%', (select string_agg(value, ' ') from jsonb_array_elements_text(v_preview->'blockedReasons'))
      using errcode = '55000';
  end if;

  v_affected := v_preview->'affectedRecords';
  update public.stock_trips set
    trip_date = (v_preview->'proposedValues'->>'tripDate')::date,
    reference_number = v_preview->'proposedValues'->>'reference',
    notes = v_preview->'proposedValues'->>'notes', updated_at = now()
  where id = v_trip.id;
  if v_trip.trip_date is distinct from (v_preview->'proposedValues'->>'tripDate')::date then
    update public.inventory_movements im set effective_date = (v_preview->'proposedValues'->>'tripDate')::date
    from public.inventory_lots il join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    where im.inventory_lot_id = il.id and stl.stock_trip_id = v_trip.id
      and im.movement_type = 'stock_in' and im.reference_type = 'stock_trip' and im.reference_id = v_trip.id;
  end if;

  for v_line in select value from jsonb_array_elements(v_preview->'proposedValues'->'lines') order by value->>'id'
  loop
    select * into v_old from public.stock_trip_lines where id = (v_line->>'id')::uuid;
    v_lot_id := (v_line->>'lotId')::uuid;
    v_new_qty := (v_line->>'quantityKg')::numeric;
    v_new_cost := (v_line->>'costPerKg')::numeric;
    v_delta := v_new_qty - v_old.quantity_kg;
    if v_delta <> 0 or v_new_cost <> v_old.cost_per_kg
       or (v_line->>'bags')::integer is distinct from v_old.bags
       or (v_line->>'headCount')::integer is distinct from v_old.head_count then
      update public.stock_trip_lines set quantity_kg = v_new_qty, cost_per_kg = v_new_cost,
        bags = (v_line->>'bags')::integer, head_count = (v_line->>'headCount')::integer
      where id = v_old.id;
      update public.inventory_lots set original_quantity_kg = v_new_qty, cost_per_kg = v_new_cost
      where id = v_lot_id;
      if v_delta <> 0 then
        v_movement_id := gen_random_uuid();
        insert into public.inventory_movements (
          id, organization_id, inventory_lot_id, movement_type, quantity_kg,
          from_location_type, to_location_type, reference_type, reference_id,
          reference_line_id, effective_date, notes, created_by
        ) values (
          v_movement_id, p_organization_id, v_lot_id,
          case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
          abs(v_delta),
          case when v_delta > 0 then 'adjustment' else 'warehouse' end,
          case when v_delta > 0 then 'warehouse' else 'adjustment' end,
          'transaction_correction', v_correction_id, gen_random_uuid(),
          (now() at time zone 'Asia/Manila')::date, 'Admin Stock-In correction', p_actor_user_id
        );
        v_affected := v_affected || jsonb_build_array(jsonb_build_object('type', 'inventory_movement', 'id', v_movement_id));
      end if;
      if private.custody_balance(v_lot_id, 'warehouse', null) <> v_new_qty then
        raise exception 'Corrected warehouse stock failed reconciliation' using errcode = '55000';
      end if;
    end if;
  end loop;
  insert into public.transaction_corrections (
    id, organization_id, module, transaction_id, transaction_reference, correction_action,
    admin_user_id, reason, original_values, proposed_values, applied_values,
    affected_record_ids, inventory_adjustments, financial_adjustments,
    status, version_token, request_id
  ) values (
    v_correction_id, p_organization_id, 'stock_in', v_trip.id,
    coalesce(nullif(btrim(v_trip.reference_number), ''), v_trip.trip_number), 'edit',
    p_actor_user_id, btrim(p_reason), v_preview->'originalValues', v_preview->'proposedValues',
    v_preview->'proposedValues', v_affected,
    v_preview->'expectedInventoryChanges', v_preview->'expectedFinancialChanges',
    'applied', p_expected_version, p_request_id
  );
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (p_organization_id, p_actor_user_id, 'stock_trip', v_trip.id, 'CORRECT_STOCK_TRIP',
    v_preview->'originalValues', jsonb_build_object('correction_id', v_correction_id,
      'request_id', p_request_id, 'applied', v_preview->'proposedValues'));
  return jsonb_build_object('correctionId', v_correction_id, 'tripId', v_trip.id,
    'inventoryChanges', v_preview->'expectedInventoryChanges',
    'financialChanges', v_preview->'expectedFinancialChanges');
end;
$$;

revoke all on function private.inspect_stock_trip_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_stock_trip_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_stock_trip_correction(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.preview_stock_trip_correction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_stock_trip_correction(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role;
comment on function public.apply_stock_trip_correction(uuid, uuid, uuid, text, uuid, text, jsonb) is
  'Service-only atomic Stock-In correction. Call only after per-request password verification in admin-stock-trip-correction.';
