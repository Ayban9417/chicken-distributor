-- Phase 4: conservative corrections of unpaid Sales. No direct table write grants.
create function private.inspect_sale_correction(
  p_organization_id uuid, p_sale_id uuid, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_old_line public.sale_lines%rowtype;
  v_lot public.inventory_lots%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_input jsonb;
  v_line jsonb;
  v_original_lines jsonb;
  v_proposed_lines jsonb := '[]'::jsonb;
  v_inventory_changes jsonb := '[]'::jsonb;
  v_affected jsonb := jsonb_build_array(jsonb_build_object('type', 'sale', 'id', p_sale_id));
  v_blockers jsonb := '[]'::jsonb;
  v_payments jsonb;
  v_dcrs jsonb;
  v_signature jsonb;
  v_new_date date;
  v_new_customer uuid;
  v_new_tr text;
  v_new_notes text;
  v_deductions numeric;
  v_qty numeric;
  v_price numeric;
  v_gross numeric := 0;
  v_cogs numeric := 0;
  v_net numeric;
  v_old_balance numeric;
  v_new_balance numeric;
  v_stock_changed boolean;
  v_new_source_balance numeric;
  v_historical_balance numeric;
  v_trip_date date;
  v_original jsonb;
  v_proposed jsonb;
begin
  if jsonb_typeof(p_changes) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k(key)
      where k.key not in ('saleDate', 'customerId', 'trustReceiptNumber', 'salesDeductions', 'notes', 'lines'))
    or jsonb_typeof(p_changes->'saleDate') is distinct from 'string'
    or jsonb_typeof(p_changes->'customerId') is distinct from 'string'
    or jsonb_typeof(p_changes->'trustReceiptNumber') is distinct from 'string'
    or jsonb_typeof(p_changes->'salesDeductions') is distinct from 'number'
    or jsonb_typeof(p_changes->'lines') is distinct from 'array'
    or (p_changes ? 'notes' and jsonb_typeof(p_changes->'notes') not in ('string', 'null')) then
    raise exception 'Invalid Sale correction fields' using errcode = '22023';
  end if;
  if p_changes->>'saleDate' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter a valid Sale date' using errcode = '22023';
  end if;
  v_new_date := (p_changes->>'saleDate')::date;
  v_new_customer := (p_changes->>'customerId')::uuid;
  v_new_tr := btrim(p_changes->>'trustReceiptNumber');
  v_new_notes := nullif(btrim(p_changes->>'notes'), '');
  v_deductions := (p_changes->>'salesDeductions')::numeric;
  if length(v_new_tr) not between 1 and 160 or length(coalesce(v_new_notes, '')) > 2000
    or v_deductions < 0 or v_deductions <> round(v_deductions, 2)
    or jsonb_array_length(p_changes->'lines') not between 1 and 100 then
    raise exception 'Invalid Sale reference, deductions, notes or lines' using errcode = '22023';
  end if;
  select * into v_sale from public.sales
    where id = p_sale_id and organization_id = p_organization_id;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'lotId', l.inventory_lot_id, 'productId', l.product_id,
    'codeId', l.code_id, 'classTypeId', l.class_type_id,
    'quantityKg', l.quantity_kg, 'pricePerKg', l.selling_price_per_kg,
    'costPerKg', l.acquisition_cost_per_kg, 'lineSales', l.line_sales,
    'lineCogs', l.line_cogs) order by l.id), '[]'::jsonb)
    into v_original_lines from public.sale_lines l where l.sale_id = p_sale_id;
  if jsonb_array_length(v_original_lines) <> jsonb_array_length(p_changes->'lines') then
    v_blockers := v_blockers || jsonb_build_array('Line count changed. Adding or removing Sale lines needs a separate workflow.');
  end if;
  if exists (select 1 from jsonb_array_elements(p_changes->'lines') value
    where jsonb_typeof(value) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(value) k(key)
        where k.key not in ('id', 'lotId', 'quantityKg', 'pricePerKg'))
      or jsonb_typeof(value->'id') is distinct from 'string'
      or jsonb_typeof(value->'lotId') is distinct from 'string'
      or jsonb_typeof(value->'quantityKg') is distinct from 'number'
      or jsonb_typeof(value->'pricePerKg') is distinct from 'number') then
    raise exception 'Invalid Sale line correction fields' using errcode = '22023';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_changes->'lines') value)
      <> jsonb_array_length(p_changes->'lines')
    or (select count(distinct value->>'lotId') from jsonb_array_elements(p_changes->'lines') value)
      <> jsonb_array_length(p_changes->'lines') then
    v_blockers := v_blockers || jsonb_build_array('Duplicate Sale line or source lot.');
  end if;
  if v_sale.status <> 'unpaid' then
    v_blockers := v_blockers || jsonb_build_array('Only unpaid Sales can be corrected directly.');
  end if;
  if v_new_date < date '2000-01-01' or v_new_date > (now() at time zone 'Asia/Manila')::date then
    v_blockers := v_blockers || jsonb_build_array('Sale date must not be future-dated or before 2000.');
  end if;
  if not exists (select 1 from public.customers c where c.id = v_new_customer
    and c.organization_id = p_organization_id and c.active) then
    v_blockers := v_blockers || jsonb_build_array('Select an active Customer in this organization.');
  end if;
  if exists (select 1 from public.sales s where s.organization_id = p_organization_id
    and s.id <> p_sale_id and lower(btrim(s.trust_receipt_number)) = lower(v_new_tr)) then
    v_blockers := v_blockers || jsonb_build_array('Trust Receipt number is already used.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('allocationId', pa.id,
    'paymentId', p.id, 'amount', pa.amount, 'method', p.method,
    'verificationStatus', p.verification_status, 'voided', p.voided_at is not null)
    order by pa.id), '[]'::jsonb) into v_payments
    from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
    where pa.sale_id = p_sale_id;
  if jsonb_array_length(v_payments) > 0 then
    v_blockers := v_blockers || jsonb_build_array('Sale has Payment allocations. Direct correction is blocked, including partial or electronic collections.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'reportDate', d.report_date,
    'status', d.status) order by d.id), '[]'::jsonb) into v_dcrs
    from public.daily_cash_reports d where d.organization_id = p_organization_id
      and d.salesman_user_id = v_sale.salesman_user_id
      and d.report_date between least(v_sale.sale_date, v_new_date)
        and greatest(v_sale.sale_date, v_new_date);
  if jsonb_array_length(v_dcrs) > 0 then
    v_blockers := v_blockers || jsonb_build_array('Salesman has a submitted DCR on or after the Sale date. Reversal review is required.');
  end if;
  if exists (select 1 from public.discrepancies d where d.organization_id = p_organization_id
    and (d.related_entity_id = p_sale_id or d.related_entity_id in
      (select l.id from public.sale_lines l where l.sale_id = p_sale_id))) then
    v_blockers := v_blockers || jsonb_build_array('Related discrepancy requires separate review.');
  end if;
  for v_input in select value from jsonb_array_elements(p_changes->'lines') loop
    select * into v_old_line from public.sale_lines
      where id = (v_input->>'id')::uuid and sale_id = p_sale_id;
    if not found then
      v_blockers := v_blockers || jsonb_build_array('Proposed line does not belong to this Sale.');
      continue;
    end if;
    v_qty := (v_input->>'quantityKg')::numeric;
    v_price := (v_input->>'pricePerKg')::numeric;
    if v_qty <= 0 or v_qty <> round(v_qty, 3) or v_qty >= 100000000000
      or v_price < 0 or v_price <> round(v_price, 2) or v_price >= 1000000000000 then
      v_blockers := v_blockers || jsonb_build_array('Quantity must be positive to three decimals; price must be nonnegative to two decimals.');
      continue;
    end if;
    select l.* into v_lot from public.inventory_lots l
      join public.stock_trip_lines sl on sl.id = l.stock_trip_line_id
      join public.stock_trips st on st.id = sl.stock_trip_id
      where l.id = (v_input->>'lotId')::uuid and l.organization_id = p_organization_id
        and st.organization_id = p_organization_id and st.status = 'received';
    if not found then
      v_blockers := v_blockers || jsonb_build_array('Source lot is not a received Trip in this organization.');
      continue;
    end if;
    select st.trip_date into v_trip_date from public.stock_trip_lines sl
      join public.stock_trips st on st.id = sl.stock_trip_id
      where sl.id = v_lot.stock_trip_line_id;
    if v_trip_date > v_new_date then
      v_blockers := v_blockers || jsonb_build_array('Sale date precedes a source Trip.');
    end if;
    if v_lot.id = v_old_line.inventory_lot_id
      and v_old_line.acquisition_cost_per_kg is distinct from v_lot.cost_per_kg then
      v_blockers := v_blockers || jsonb_build_array('Recorded acquisition cost no longer matches its source lot.');
    end if;
    if (v_new_date < v_sale.sale_date or v_lot.id <> v_old_line.inventory_lot_id) and not exists (
      select 1 from public.inventory_movements m where m.inventory_lot_id = v_lot.id
        and m.to_location_type = 'salesman' and m.to_salesman_user_id = v_sale.salesman_user_id
        and m.effective_date <= v_new_date) then
      v_blockers := v_blockers || jsonb_build_array('Sale date precedes Salesman receipt of the proposed lot.');
    end if;
    select * into v_movement from public.inventory_movements m
      where m.organization_id = p_organization_id and m.reference_type = 'sale'
        and m.reference_id = p_sale_id and m.reference_line_id = v_old_line.id
        and m.movement_type = 'sale';
    if v_movement.id is null then
      v_blockers := v_blockers || jsonb_build_array('Original Sale movement is missing.');
    elsif (v_movement.inventory_lot_id is distinct from v_old_line.inventory_lot_id
      or v_movement.quantity_kg is distinct from v_old_line.quantity_kg
      or v_movement.from_salesman_user_id is distinct from v_sale.salesman_user_id)
      and not exists (select 1 from public.transaction_corrections c,
        jsonb_array_elements(c.applied_values->'lines') applied
        where c.organization_id = p_organization_id and c.module = 'sale'
          and c.transaction_id = p_sale_id and c.status = 'applied'
          and c.inventory_adjustments <> '[]'::jsonb
          and applied->>'id' = v_old_line.id::text
          and applied->>'lotId' = v_old_line.inventory_lot_id::text
          and (applied->>'quantityKg')::numeric = v_old_line.quantity_kg) then
      v_blockers := v_blockers || jsonb_build_array('Sale line does not reconcile with original or corrected movement history.');
    end if;
    v_stock_changed := v_lot.id is distinct from v_old_line.inventory_lot_id
      or v_qty is distinct from v_old_line.quantity_kg;
    if v_stock_changed then
      if exists (select 1 from public.transaction_corrections c where c.organization_id = p_organization_id
        and c.module = 'sale' and c.transaction_id = p_sale_id
        and c.inventory_adjustments <> '[]'::jsonb) then
        v_blockers := v_blockers || jsonb_build_array('Sale already has an inventory correction. Further stock edits need manual review.');
      end if;
      if exists (select 1 from public.sale_lines l where l.sale_id = p_sale_id
        and l.id <> v_old_line.id and l.inventory_lot_id = v_lot.id) then
        v_blockers := v_blockers || jsonb_build_array('Proposed lot is used by another line in this Sale.');
      end if;
      if exists (select 1 from public.inventory_movements m where m.inventory_lot_id = v_old_line.inventory_lot_id
        and m.id <> v_movement.id and m.created_at >= v_movement.created_at
        and (m.reference_type <> 'sale' or m.reference_id <> p_sale_id)) then
        v_blockers := v_blockers || jsonb_build_array('Original lot has downstream movements; stock correction is blocked.');
      end if;
      v_new_source_balance := private.custody_balance(v_lot.id, 'salesman', v_sale.salesman_user_id);
      if v_lot.id = v_old_line.inventory_lot_id then
        v_new_source_balance := v_new_source_balance + v_old_line.quantity_kg;
      end if;
      if v_new_source_balance < v_qty then
        v_blockers := v_blockers || jsonb_build_array('Insufficient Salesman stock in the proposed source lot.');
      end if;
      select coalesce(sum(
        case when m.to_location_type = 'salesman' and m.to_salesman_user_id = v_sale.salesman_user_id
          then m.quantity_kg else 0 end
        - case when m.from_location_type = 'salesman' and m.from_salesman_user_id = v_sale.salesman_user_id
          then m.quantity_kg else 0 end), 0) into v_historical_balance
        from public.inventory_movements m where m.inventory_lot_id = v_lot.id
          and m.effective_date <= v_new_date;
      if v_lot.id = v_old_line.inventory_lot_id and v_sale.sale_date <= v_new_date then
        v_historical_balance := v_historical_balance + v_old_line.quantity_kg;
      end if;
      if v_historical_balance < v_qty then
        v_blockers := v_blockers || jsonb_build_array('Insufficient Salesman stock in the proposed source lot on the Sale date.');
      end if;
      v_inventory_changes := v_inventory_changes || jsonb_build_array(
        jsonb_build_object('lineId', v_old_line.id, 'lotId', v_old_line.inventory_lot_id,
          'quantityKg', -v_old_line.quantity_kg, 'action', 'reverse_sale'),
        jsonb_build_object('lineId', v_old_line.id, 'lotId', v_lot.id,
          'quantityKg', v_qty, 'action', 'replace_sale'));
    end if;
    v_gross := v_gross + round(v_qty * v_price, 2);
    v_cogs := v_cogs + round(v_qty * v_lot.cost_per_kg, 2);
    v_proposed_lines := v_proposed_lines || jsonb_build_array(jsonb_build_object(
      'id', v_old_line.id, 'lotId', v_lot.id, 'productId', v_lot.product_id,
      'codeId', v_lot.code_id, 'classTypeId', v_lot.class_type_id,
      'quantityKg', v_qty, 'pricePerKg', v_price, 'costPerKg', v_lot.cost_per_kg,
      'lineSales', round(v_qty * v_price, 2), 'lineCogs', round(v_qty * v_lot.cost_per_kg, 2)));
    v_affected := v_affected || jsonb_build_array(jsonb_build_object('type', 'sale_line', 'id', v_old_line.id));
  end loop;
  if jsonb_array_length(v_proposed_lines) <> jsonb_array_length(v_original_lines) then
    v_blockers := v_blockers || jsonb_build_array('Every existing Sale line must be present and valid.');
  end if;
  select coalesce(jsonb_agg(value order by value->>'id'), '[]'::jsonb)
    into v_proposed_lines from jsonb_array_elements(v_proposed_lines) value;
  v_net := v_gross - v_deductions;
  if v_net < 0 then v_blockers := v_blockers || jsonb_build_array('Deductions exceed gross Sales.'); end if;
  select coalesce(outstanding_balance, 0) into v_old_balance from public.customer_balances
    where organization_id = p_organization_id and customer_id = v_sale.customer_id;
  select coalesce(outstanding_balance, 0) into v_new_balance from public.customer_balances
    where organization_id = p_organization_id and customer_id = v_new_customer;
  if v_sale.customer_id <> v_new_customer and coalesce(v_old_balance, 0) < v_sale.net_sales then
    v_blockers := v_blockers || jsonb_build_array('Changing Customer would create a negative former Customer balance.');
  elsif v_sale.customer_id = v_new_customer
    and coalesce(v_old_balance, 0) - v_sale.net_sales + v_net < 0 then
    v_blockers := v_blockers || jsonb_build_array('Corrected Sale total would create a negative Customer balance.');
  end if;
  v_original := jsonb_build_object('saleDate', v_sale.sale_date, 'customerId', v_sale.customer_id,
    'trustReceiptNumber', v_sale.trust_receipt_number, 'salesDeductions', v_sale.sales_deductions,
    'notes', v_sale.notes, 'lines', v_original_lines, 'grossSales', v_sale.gross_sales,
    'netSales', v_sale.net_sales, 'totalCogs', v_sale.total_cogs);
  v_proposed := jsonb_build_object('saleDate', v_new_date, 'customerId', v_new_customer,
    'trustReceiptNumber', v_new_tr, 'salesDeductions', v_deductions,
    'notes', v_new_notes, 'lines', v_proposed_lines, 'grossSales', v_gross,
    'netSales', v_net, 'totalCogs', v_cogs);
  if v_original = v_proposed then
    v_blockers := v_blockers || jsonb_build_array('Make at least one change before confirming.');
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) into v_signature
    from public.inventory_movements m where m.organization_id = p_organization_id
      and m.inventory_lot_id in (select (value->>'lotId')::uuid from jsonb_array_elements(v_original_lines) value
        union select (value->>'lotId')::uuid from jsonb_array_elements(v_proposed_lines) value);
  return jsonb_build_object(
    'originalValues', v_original, 'proposedValues', v_proposed,
    'affectedRecords', v_affected, 'relatedPayments', v_payments, 'lockedDcrs', v_dcrs,
    'expectedInventoryChanges', v_inventory_changes,
    'expectedFinancialChanges', jsonb_build_array(
      jsonb_build_object('type', 'revenue', 'before', v_sale.net_sales, 'after', v_net,
        'delta', v_net - v_sale.net_sales),
      jsonb_build_object('type', 'cogs', 'before', v_sale.total_cogs, 'after', v_cogs,
        'delta', v_cogs - v_sale.total_cogs),
      jsonb_build_object('type', 'customer_balance', 'customerId', v_sale.customer_id,
        'before', v_old_balance, 'after', v_old_balance - v_sale.net_sales
          + case when v_new_customer = v_sale.customer_id then v_net else 0 end))
      || case when v_new_customer = v_sale.customer_id then '[]'::jsonb else
        jsonb_build_array(jsonb_build_object('type', 'customer_balance', 'customerId', v_new_customer,
          'before', v_new_balance, 'after', v_new_balance + v_net)) end,
    'blockedReasons', v_blockers, 'eligible', jsonb_array_length(v_blockers) = 0,
    'versionToken', md5(jsonb_build_object('sale', to_jsonb(v_sale), 'lines', v_original_lines,
      'movements', v_signature, 'payments', v_payments, 'dcrs', v_dcrs,
      'oldBalance', v_old_balance, 'newBalance', v_new_balance)::text));
end;
$$;

create function public.preview_sale_correction(p_organization_id uuid, p_sale_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  return private.inspect_sale_correction(p_organization_id, p_sale_id, p_changes);
end;
$$;

create function public.apply_sale_correction(
  p_organization_id uuid, p_sale_id uuid, p_actor_user_id uuid,
  p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_preview jsonb;
  v_old jsonb;
  v_new jsonb;
  v_line jsonb;
  v_prior jsonb;
  v_lot public.inventory_lots%rowtype;
  v_correction_id uuid := gen_random_uuid();
  v_reverse_id uuid;
  v_replace_id uuid;
  v_affected jsonb;
  v_sale public.sales%rowtype;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id and p.active and m.organization_id = p_organization_id
      and m.role = 'owner_admin' and m.active for share of p, m;
  if not found then raise exception 'Active Owner / Admin authorization is required' using errcode = '42501'; end if;
  perform private.assert_correction_actor(p_organization_id, p_actor_user_id);
  select * into v_sale from public.sales
    where id = p_sale_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  perform 1 from public.sale_lines where sale_id = p_sale_id order by id for update;
  perform 1 from public.inventory_lots where organization_id = p_organization_id and id in (
    select inventory_lot_id from public.sale_lines where sale_id = p_sale_id
    union select (value->>'lotId')::uuid from jsonb_array_elements(p_changes->'lines') value)
    order by id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 14902));
  v_preview := private.inspect_sale_correction(p_organization_id, p_sale_id, p_changes);
  perform private.assert_correction_request(p_organization_id, p_actor_user_id, p_reason,
    p_request_id, p_expected_version, v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception '%', (select string_agg(value, ' ') from jsonb_array_elements_text(v_preview->'blockedReasons')) using errcode = '55000';
  end if;
  v_old := v_preview->'originalValues'; v_new := v_preview->'proposedValues';
  v_affected := v_preview->'affectedRecords';
  for v_line in select value from jsonb_array_elements(v_new->'lines') loop
    select value into v_prior from jsonb_array_elements(v_old->'lines') value
      where value->>'id' = v_line->>'id';
    if v_prior->>'lotId' is distinct from v_line->>'lotId'
      or v_prior->>'quantityKg' is distinct from v_line->>'quantityKg' then
      v_reverse_id := gen_random_uuid(); v_replace_id := gen_random_uuid();
      insert into public.inventory_movements (
        id, organization_id, inventory_lot_id, movement_type, quantity_kg,
        from_location_type, to_location_type, to_salesman_user_id,
        reference_type, reference_id, reference_line_id, effective_date, notes, created_by
      ) values (v_reverse_id, p_organization_id, (v_prior->>'lotId')::uuid, 'adjustment_in',
        (v_prior->>'quantityKg')::numeric, 'customer', 'salesman', v_sale.salesman_user_id,
        'transaction_correction', v_correction_id, gen_random_uuid(),
        (now() at time zone 'Asia/Manila')::date, 'Reverse original Sale stock for Admin correction', p_actor_user_id);
      insert into public.inventory_movements (
        id, organization_id, inventory_lot_id, movement_type, quantity_kg,
        from_location_type, from_salesman_user_id, to_location_type,
        reference_type, reference_id, reference_line_id, effective_date, notes, created_by
      ) values (v_replace_id, p_organization_id, (v_line->>'lotId')::uuid, 'adjustment_out',
        (v_line->>'quantityKg')::numeric, 'salesman', v_sale.salesman_user_id, 'customer',
        'transaction_correction', v_correction_id, gen_random_uuid(),
        (now() at time zone 'Asia/Manila')::date, 'Apply corrected Sale stock', p_actor_user_id);
      if private.custody_balance((v_line->>'lotId')::uuid, 'salesman', v_sale.salesman_user_id) < 0 then
        raise exception 'Corrected Salesman stock failed reconciliation' using errcode = '55000';
      end if;
      v_affected := v_affected || jsonb_build_array(
        jsonb_build_object('type', 'inventory_movement', 'id', v_reverse_id),
        jsonb_build_object('type', 'inventory_movement', 'id', v_replace_id));
    end if;
    select * into v_lot from public.inventory_lots where id = (v_line->>'lotId')::uuid;
    update public.sale_lines set inventory_lot_id = v_lot.id, product_id = v_lot.product_id,
      code_id = v_lot.code_id, class_type_id = v_lot.class_type_id,
      quantity_kg = (v_line->>'quantityKg')::numeric,
      selling_price_per_kg = (v_line->>'pricePerKg')::numeric,
      acquisition_cost_per_kg = v_lot.cost_per_kg,
      line_sales = (v_line->>'lineSales')::numeric,
      line_cogs = (v_line->>'lineCogs')::numeric,
      price_override = coalesce(default_price is distinct from (v_line->>'pricePerKg')::numeric, true)
      where id = (v_line->>'id')::uuid and sale_id = p_sale_id;
  end loop;
  update public.sales set sale_date = (v_new->>'saleDate')::date,
    customer_id = (v_new->>'customerId')::uuid,
    trust_receipt_number = v_new->>'trustReceiptNumber',
    notes = v_new->>'notes', sales_deductions = (v_new->>'salesDeductions')::numeric,
    subtotal = (v_new->>'grossSales')::numeric, gross_sales = (v_new->>'grossSales')::numeric,
    net_sales = (v_new->>'netSales')::numeric, total_cogs = (v_new->>'totalCogs')::numeric,
    updated_at = now() where id = p_sale_id;
  if exists (select 1 from public.customer_balances b where b.organization_id = p_organization_id
    and b.customer_id in (v_sale.customer_id, (v_new->>'customerId')::uuid)
    and b.outstanding_balance < 0) then
    raise exception 'Corrected Customer balance failed reconciliation' using errcode = '55000';
  end if;
  insert into public.transaction_corrections (
    id, organization_id, module, transaction_id, transaction_reference, correction_action,
    admin_user_id, reason, original_values, proposed_values, applied_values,
    affected_record_ids, inventory_adjustments, financial_adjustments,
    status, version_token, request_id
  ) values (v_correction_id, p_organization_id, 'sale', p_sale_id,
    v_old->>'trustReceiptNumber', 'edit', p_actor_user_id, btrim(p_reason),
    v_old, v_new, v_new, v_affected, v_preview->'expectedInventoryChanges',
    v_preview->'expectedFinancialChanges', 'applied', p_expected_version, p_request_id);
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (p_organization_id, p_actor_user_id, 'sale', p_sale_id, 'CORRECT_SALE', v_old,
    jsonb_build_object('correction_id', v_correction_id, 'request_id', p_request_id,
      'applied', v_new, 'affected', v_affected));
  return jsonb_build_object('correctionId', v_correction_id, 'saleId', p_sale_id,
    'inventoryChanges', v_preview->'expectedInventoryChanges',
    'financialChanges', v_preview->'expectedFinancialChanges');
end;
$$;

revoke all on function private.inspect_sale_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_sale_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_sale_correction(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.preview_sale_correction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_sale_correction(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role;
