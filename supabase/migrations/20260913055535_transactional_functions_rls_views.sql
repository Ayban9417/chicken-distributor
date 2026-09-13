-- Chicken Distributor backend foundation: authorization, atomic workflows, RLS, and reports.

create function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.active
      and p.active
  );
$$;

create function private.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
      and m.active
      and p.active
  );
$$;

create function private.is_active_salesman(p_organization_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role = 'salesman'
      and m.active
      and p.active
  );
$$;

create function private.next_document_number(p_organization_id uuid, p_document_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next bigint;
begin
  if p_document_type not in ('ST', 'RR', 'TF', 'PAY') then
    raise exception 'Unsupported document type: %', p_document_type using errcode = '22023';
  end if;

  insert into private.document_sequences (organization_id, document_type, last_value)
  values (p_organization_id, p_document_type, 1)
  on conflict (organization_id, document_type)
  do update set last_value = private.document_sequences.last_value + 1
  returning last_value into v_next;

  return p_document_type || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create function private.custody_balance(
  p_inventory_lot_id uuid,
  p_location_type text,
  p_salesman_user_id uuid default null
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    case
      when m.to_location_type = p_location_type
        and (p_location_type <> 'salesman' or m.to_salesman_user_id = p_salesman_user_id)
        then m.quantity_kg
      else 0
    end
    - case
      when m.from_location_type = p_location_type
        and (p_location_type <> 'salesman' or m.from_salesman_user_id = p_salesman_user_id)
        then m.quantity_kg
      else 0
    end
  ), 0)::numeric
  from public.inventory_movements m
  where m.inventory_lot_id = p_inventory_lot_id;
$$;

create function private.sale_open_balance(p_sale_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(0, s.net_sales - coalesce(sum(a.amount) filter (where p.voided_at is null), 0))
  from public.sales s
  left join public.payment_allocations a on a.sale_id = s.id
  left join public.payments p on p.id = a.payment_id
  where s.id = p_sale_id
  group by s.id, s.net_sales;
$$;

create function private.refresh_sale_status(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_net numeric;
  v_open numeric;
begin
  select net_sales into v_net from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;
  if (select status from public.sales where id = p_sale_id) = 'voided' then
    return;
  end if;
  v_open := private.sale_open_balance(p_sale_id);
  update public.sales
  set status = case when v_open = 0 then 'paid' when v_open < v_net then 'partially_paid' else 'unpaid' end
  where id = p_sale_id;
end;
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, text[]) from public;
revoke all on function private.is_active_salesman(uuid, uuid) from public;
revoke all on function private.next_document_number(uuid, text) from public;
revoke all on function private.custody_balance(uuid, text, uuid) from public;
revoke all on function private.sale_open_balance(uuid) from public;
revoke all on function private.refresh_sale_status(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.is_active_salesman(uuid, uuid) to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.custody_balance(uuid, text, uuid) to authenticated;
grant execute on function private.sale_open_balance(uuid) to authenticated;

create function api.create_stock_trip(
  p_organization_id uuid,
  p_plant_id uuid,
  p_trip_date date,
  p_lines jsonb,
  p_client_request_id uuid,
  p_reference_number text default null,
  p_delivery_note text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_trip public.stock_trips%rowtype;
  v_line jsonb;
  v_trip_line public.stock_trip_lines%rowtype;
  v_lot public.inventory_lots%rowtype;
  v_config record;
  v_code_id uuid;
  v_class_id uuid;
  v_acquisition text;
  v_cost numeric;
  v_quantity numeric;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner_admin', 'warehouse']) then
    raise exception 'Not authorized to receive stock' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one stock line is required' using errcode = '22023';
  end if;

  select * into v_trip from public.stock_trips
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_trip.id, 'trip_number', v_trip.trip_number, 'idempotent_replay', true);
  end if;

  if not exists (select 1 from public.plants where id = p_plant_id and organization_id = p_organization_id and active) then
    raise exception 'Active Plant not found in organization' using errcode = '22023';
  end if;

  insert into public.stock_trips (
    organization_id, plant_id, trip_number, trip_date, reference_number, delivery_note,
    notes, status, client_request_id, created_by
  ) values (
    p_organization_id, p_plant_id, private.next_document_number(p_organization_id, 'ST'),
    p_trip_date, nullif(btrim(p_reference_number), ''), nullif(btrim(p_delivery_note), ''),
    nullif(btrim(p_notes), ''), 'received', p_client_request_id, v_actor
  ) returning * into v_trip;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    select pp.id, pp.product_id, pp.uses_size_codes, pp.uses_class_types,
           pp.uses_bags, pp.uses_head_count, pp.allows_free_from_plant
    into v_config
    from public.plant_products pp
    join public.products pr on pr.id = pp.product_id
    where pp.id = (v_line->>'plant_product_id')::uuid
      and pp.plant_id = p_plant_id and pp.active and pr.active;
    if not found then
      raise exception 'Active Plant Product configuration not found' using errcode = '22023';
    end if;

    v_code_id := nullif(v_line->>'code_id', '')::uuid;
    v_class_id := nullif(v_line->>'class_type_id', '')::uuid;
    v_acquisition := coalesce(nullif(v_line->>'acquisition_type', ''), 'purchased');
    v_cost := coalesce((v_line->>'cost_per_kg')::numeric, 0);
    v_quantity := (v_line->>'quantity_kg')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Stock quantity must be positive' using errcode = '22023';
    end if;

    if v_config.uses_size_codes <> (v_code_id is not null) then
      raise exception 'Code presence does not match Plant Product configuration' using errcode = '22023';
    end if;
    if v_code_id is not null and not exists (
      select 1 from public.plant_product_codes c where c.id = v_code_id and c.plant_product_id = v_config.id and c.active
    ) then
      raise exception 'Active Product Code does not belong to Plant Product' using errcode = '22023';
    end if;
    if v_config.uses_class_types <> (v_class_id is not null) then
      raise exception 'Class Type presence does not match Plant Product configuration' using errcode = '22023';
    end if;
    if v_class_id is not null and not exists (
      select 1 from public.plant_product_class_types c where c.id = v_class_id and c.plant_product_id = v_config.id and c.active
    ) then
      raise exception 'Active Class Type does not belong to Plant Product' using errcode = '22023';
    end if;
    if (v_line ? 'bags') and not v_config.uses_bags then
      raise exception 'Bags are not enabled for this Plant Product' using errcode = '22023';
    end if;
    if (v_line ? 'head_count') and not v_config.uses_head_count then
      raise exception 'Head Count is not enabled for this Plant Product' using errcode = '22023';
    end if;
    if v_acquisition = 'free_from_plant' and not v_config.allows_free_from_plant then
      raise exception 'Free-from-Plant acquisition is not allowed for this Product' using errcode = '22023';
    end if;

    insert into public.stock_trip_lines (
      stock_trip_id, plant_product_id, code_id, class_type_id, bags, head_count,
      quantity_kg, acquisition_type, cost_per_kg
    ) values (
      v_trip.id, v_config.id, v_code_id, v_class_id,
      nullif(v_line->>'bags', '')::integer, nullif(v_line->>'head_count', '')::integer,
      v_quantity, v_acquisition, v_cost
    ) returning * into v_trip_line;

    insert into public.inventory_lots (
      organization_id, stock_trip_line_id, plant_id, product_id, code_id, class_type_id,
      cost_per_kg, original_quantity_kg
    ) values (
      p_organization_id, v_trip_line.id, p_plant_id, v_config.product_id, v_code_id, v_class_id,
      v_cost, v_trip_line.quantity_kg
    ) returning * into v_lot;

    insert into public.inventory_movements (
      organization_id, inventory_lot_id, movement_type, quantity_kg,
      from_location_type, to_location_type, reference_type, reference_id,
      reference_line_id, effective_date, created_by
    ) values (
      p_organization_id, v_lot.id, 'stock_in', v_trip_line.quantity_kg,
      'plant', 'warehouse', 'stock_trip', v_trip.id, v_trip_line.id, p_trip_date, v_actor
    );
  end loop;

  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_organization_id, v_actor, 'stock_trip', v_trip.id, 'created', jsonb_build_object('trip_number', v_trip.trip_number));
  return jsonb_build_object('id', v_trip.id, 'trip_number', v_trip.trip_number, 'idempotent_replay', false);
end;
$$;

create function api.transfer_warehouse_to_salesman(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_effective_date date,
  p_lines jsonb,
  p_client_request_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_receipt public.receiving_receipts%rowtype;
  v_receipt_line public.receiving_receipt_lines%rowtype;
  v_line jsonb;
  v_lot_id uuid;
  v_qty numeric;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner_admin', 'warehouse']) then
    raise exception 'Not authorized for Warehouse transfers' using errcode = '42501';
  end if;
  if not private.is_active_salesman(p_organization_id, p_salesman_user_id) then
    raise exception 'Destination Salesman is not active' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one transfer line is required' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <>
     (select count(distinct value->>'inventory_lot_id') from jsonb_array_elements(p_lines)) then
    raise exception 'Duplicate inventory lots are not allowed' using errcode = '22023';
  end if;

  select * into v_receipt from public.receiving_receipts
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_receipt.id, 'receipt_number', v_receipt.receipt_number, 'idempotent_replay', true);
  end if;

  perform 1
  from public.inventory_lots l
  where l.organization_id = p_organization_id
    and l.id in (select (value->>'inventory_lot_id')::uuid from jsonb_array_elements(p_lines))
  order by l.id
  for update;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_lot_id := (v_line->>'inventory_lot_id')::uuid;
    v_qty := (v_line->>'quantity_kg')::numeric;
    if v_qty is null or v_qty <= 0 or not exists (select 1 from public.inventory_lots where id = v_lot_id and organization_id = p_organization_id) then
      raise exception 'Invalid inventory lot or quantity' using errcode = '22023';
    end if;
    if private.custody_balance(v_lot_id, 'warehouse', null) < v_qty then
      raise exception 'Insufficient Warehouse stock for lot %', v_lot_id using errcode = 'P0001';
    end if;
  end loop;

  insert into public.receiving_receipts (
    organization_id, receipt_number, salesman_user_id, client_request_id, created_by, notes
  ) values (
    p_organization_id, private.next_document_number(p_organization_id, 'RR'), p_salesman_user_id,
    p_client_request_id, v_actor, nullif(btrim(p_notes), '')
  ) returning * into v_receipt;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    insert into public.receiving_receipt_lines (receipt_id, inventory_lot_id, quantity_kg, bags, head_count)
    values (
      v_receipt.id, (v_line->>'inventory_lot_id')::uuid, (v_line->>'quantity_kg')::numeric,
      nullif(v_line->>'bags', '')::integer, nullif(v_line->>'head_count', '')::integer
    ) returning * into v_receipt_line;
    insert into public.inventory_movements (
      organization_id, inventory_lot_id, movement_type, quantity_kg, from_location_type,
      to_location_type, to_salesman_user_id, reference_type, reference_id,
      reference_line_id, effective_date, created_by
    ) values (
      p_organization_id, v_receipt_line.inventory_lot_id, 'warehouse_to_salesman', v_receipt_line.quantity_kg,
      'warehouse', 'salesman', p_salesman_user_id, 'receiving_receipt', v_receipt.id,
      v_receipt_line.id, p_effective_date, v_actor
    );
  end loop;

  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_organization_id, v_actor, 'receiving_receipt', v_receipt.id, 'created', jsonb_build_object('receipt_number', v_receipt.receipt_number));
  return jsonb_build_object('id', v_receipt.id, 'receipt_number', v_receipt.receipt_number, 'idempotent_replay', false);
end;
$$;

create function api.transfer_salesman_to_salesman(
  p_organization_id uuid,
  p_from_salesman_user_id uuid,
  p_to_salesman_user_id uuid,
  p_effective_date date,
  p_lines jsonb,
  p_client_request_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_receipt public.transfer_receipts%rowtype;
  v_receipt_line public.transfer_receipt_lines%rowtype;
  v_line jsonb;
  v_lot_id uuid;
  v_qty numeric;
begin
  if v_actor is null or not (
    private.has_org_role(p_organization_id, array['owner_admin'])
    or (v_actor = p_from_salesman_user_id and private.has_org_role(p_organization_id, array['salesman']))
  ) then
    raise exception 'Not authorized for this Salesman transfer' using errcode = '42501';
  end if;
  if p_from_salesman_user_id = p_to_salesman_user_id then
    raise exception 'Source and destination Salesmen must differ' using errcode = '22023';
  end if;
  if not private.is_active_salesman(p_organization_id, p_from_salesman_user_id)
     or not private.is_active_salesman(p_organization_id, p_to_salesman_user_id) then
    raise exception 'Both Salesmen must be active' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one transfer line is required' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <>
     (select count(distinct value->>'inventory_lot_id') from jsonb_array_elements(p_lines)) then
    raise exception 'Duplicate inventory lots are not allowed' using errcode = '22023';
  end if;

  select * into v_receipt from public.transfer_receipts
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_receipt.id, 'receipt_number', v_receipt.receipt_number, 'idempotent_replay', true);
  end if;

  perform 1
  from public.inventory_lots l
  where l.organization_id = p_organization_id
    and l.id in (select (value->>'inventory_lot_id')::uuid from jsonb_array_elements(p_lines))
  order by l.id
  for update;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_lot_id := (v_line->>'inventory_lot_id')::uuid;
    v_qty := (v_line->>'quantity_kg')::numeric;
    if v_qty is null or v_qty <= 0 or not exists (select 1 from public.inventory_lots where id = v_lot_id and organization_id = p_organization_id) then
      raise exception 'Invalid inventory lot or quantity' using errcode = '22023';
    end if;
    if private.custody_balance(v_lot_id, 'salesman', p_from_salesman_user_id) < v_qty then
      raise exception 'Insufficient Salesman stock for lot %', v_lot_id using errcode = 'P0001';
    end if;
  end loop;

  insert into public.transfer_receipts (
    organization_id, receipt_number, from_salesman_user_id, to_salesman_user_id,
    client_request_id, created_by, notes
  ) values (
    p_organization_id, private.next_document_number(p_organization_id, 'TF'),
    p_from_salesman_user_id, p_to_salesman_user_id, p_client_request_id, v_actor,
    nullif(btrim(p_notes), '')
  ) returning * into v_receipt;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    insert into public.transfer_receipt_lines (receipt_id, inventory_lot_id, quantity_kg, bags, head_count)
    values (
      v_receipt.id, (v_line->>'inventory_lot_id')::uuid, (v_line->>'quantity_kg')::numeric,
      nullif(v_line->>'bags', '')::integer, nullif(v_line->>'head_count', '')::integer
    ) returning * into v_receipt_line;
    insert into public.inventory_movements (
      organization_id, inventory_lot_id, movement_type, quantity_kg, from_location_type,
      from_salesman_user_id, to_location_type, to_salesman_user_id, reference_type,
      reference_id, reference_line_id, effective_date, created_by
    ) values (
      p_organization_id, v_receipt_line.inventory_lot_id, 'salesman_to_salesman', v_receipt_line.quantity_kg,
      'salesman', p_from_salesman_user_id, 'salesman', p_to_salesman_user_id,
      'transfer_receipt', v_receipt.id, v_receipt_line.id, p_effective_date, v_actor
    );
  end loop;

  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_organization_id, v_actor, 'transfer_receipt', v_receipt.id, 'created', jsonb_build_object('receipt_number', v_receipt.receipt_number));
  return jsonb_build_object('id', v_receipt.id, 'receipt_number', v_receipt.receipt_number, 'idempotent_replay', false);
end;
$$;

create function private.record_payment_core(
  p_organization_id uuid,
  p_customer_id uuid,
  p_salesman_user_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_reference_number text,
  p_notes text,
  p_client_request_id uuid,
  p_created_by uuid,
  p_target_sale_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_existing uuid;
  v_remaining numeric := p_amount;
  v_open numeric;
  v_allocate numeric;
  v_sale record;
begin
  select id into v_existing from public.payments
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then return v_existing; end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive' using errcode = '22023';
  end if;
  if p_method not in ('cash', 'gcash', 'bank') then
    raise exception 'Invalid Payment method' using errcode = '22023';
  end if;
  if p_method <> 'cash' and length(btrim(coalesce(p_reference_number, ''))) = 0 then
    raise exception 'Electronic Payments require a reference number' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id and c.active
  ) then
    raise exception 'Active Customer not found' using errcode = '22023';
  end if;
  if p_salesman_user_id is not null and not private.is_active_salesman(p_organization_id, p_salesman_user_id) then
    raise exception 'Active Salesman not found' using errcode = '22023';
  end if;

  if p_target_sale_id is not null then
    perform 1 from public.sales s
    where s.id = p_target_sale_id and s.organization_id = p_organization_id
      and s.customer_id = p_customer_id and s.status <> 'voided' and s.sale_date <= p_payment_date
    for update;
    if not found then
      raise exception 'Target Sale is not eligible for this Payment' using errcode = '22023';
    end if;
    v_open := private.sale_open_balance(p_target_sale_id);
    if p_amount > v_open then
      raise exception 'Payment exceeds target Sale open balance' using errcode = '22023';
    end if;
  else
    perform 1 from public.sales s
    where s.organization_id = p_organization_id and s.customer_id = p_customer_id
      and s.status <> 'voided' and s.sale_date <= p_payment_date
    order by s.sale_date, s.created_at, s.id
    for update;
    select coalesce(sum(private.sale_open_balance(s.id)), 0) into v_open
    from public.sales s
    where s.organization_id = p_organization_id and s.customer_id = p_customer_id
      and s.status <> 'voided' and s.sale_date <= p_payment_date;
    if p_amount > v_open then
      raise exception 'Payment exceeds Customer open balance' using errcode = '22023';
    end if;
  end if;

  insert into public.payments (
    organization_id, payment_number, customer_id, salesman_user_id, payment_date,
    amount, method, reference_number, notes, verification_status, client_request_id, created_by
  ) values (
    p_organization_id, private.next_document_number(p_organization_id, 'PAY'), p_customer_id,
    p_salesman_user_id, p_payment_date, p_amount, p_method,
    nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''),
    case when p_method = 'cash' then 'not_required' else 'pending' end,
    p_client_request_id, p_created_by
  ) returning id into v_payment_id;

  if p_target_sale_id is not null then
    insert into public.payment_allocations (payment_id, sale_id, amount)
    values (v_payment_id, p_target_sale_id, p_amount);
    perform private.refresh_sale_status(p_target_sale_id);
  else
    for v_sale in
      select s.id
      from public.sales s
      where s.organization_id = p_organization_id and s.customer_id = p_customer_id
        and s.status <> 'voided' and s.sale_date <= p_payment_date
        and private.sale_open_balance(s.id) > 0
      order by s.sale_date, s.created_at, s.id
    loop
      exit when v_remaining = 0;
      v_open := private.sale_open_balance(v_sale.id);
      v_allocate := least(v_remaining, v_open);
      insert into public.payment_allocations (payment_id, sale_id, amount)
      values (v_payment_id, v_sale.id, v_allocate);
      v_remaining := v_remaining - v_allocate;
      perform private.refresh_sale_status(v_sale.id);
    end loop;
  end if;

  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_organization_id, p_created_by, 'payment', v_payment_id, 'created', jsonb_build_object('amount', p_amount, 'method', p_method));
  return v_payment_id;
end;
$$;

create function api.record_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_client_request_id uuid,
  p_salesman_user_id uuid default null,
  p_reference_number text default null,
  p_notes text default null,
  p_target_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_payment_id uuid;
  v_existing public.payments%rowtype;
begin
  if v_actor is null or not (
    private.has_org_role(p_organization_id, array['owner_admin', 'cashier'])
    or (v_actor = p_salesman_user_id and private.has_org_role(p_organization_id, array['salesman']))
  ) then
    raise exception 'Not authorized to record this Payment' using errcode = '42501';
  end if;
  select * into v_existing from public.payments
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_existing.id, 'payment_number', v_existing.payment_number, 'idempotent_replay', true);
  end if;
  v_payment_id := private.record_payment_core(
    p_organization_id, p_customer_id, p_salesman_user_id, p_payment_date, p_amount,
    p_method, p_reference_number, p_notes, p_client_request_id, v_actor, p_target_sale_id
  );
  select * into v_existing from public.payments where id = v_payment_id;
  return jsonb_build_object('id', v_existing.id, 'payment_number', v_existing.payment_number, 'idempotent_replay', false);
end;
$$;

create function api.create_sale(
  p_organization_id uuid,
  p_customer_id uuid,
  p_salesman_user_id uuid,
  p_sale_date date,
  p_trust_receipt_number text,
  p_lines jsonb,
  p_client_request_id uuid,
  p_sales_deductions numeric default 0,
  p_notes text default null,
  p_initial_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_sale_line public.sale_lines%rowtype;
  v_line jsonb;
  v_lot public.inventory_lots%rowtype;
  v_qty numeric;
  v_price numeric;
  v_line_sales numeric;
  v_line_cogs numeric;
  v_gross numeric := 0;
  v_cogs numeric := 0;
  v_net numeric;
  v_payment_id uuid;
begin
  if v_actor is null or not (
    private.has_org_role(p_organization_id, array['owner_admin'])
    or (v_actor = p_salesman_user_id and private.has_org_role(p_organization_id, array['salesman']))
  ) then
    raise exception 'Not authorized to create this Sale' using errcode = '42501';
  end if;
  if not private.is_active_salesman(p_organization_id, p_salesman_user_id) then
    raise exception 'Salesman is not active' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id and c.active
  ) then
    raise exception 'Active Customer not found' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_trust_receipt_number, ''))) = 0 then
    raise exception 'Trust Receipt number is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one Sale line is required' using errcode = '22023';
  end if;
  if p_sales_deductions < 0 then
    raise exception 'Sales deductions cannot be negative' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <>
     (select count(distinct value->>'inventory_lot_id') from jsonb_array_elements(p_lines)) then
    raise exception 'Duplicate inventory lots are not allowed' using errcode = '22023';
  end if;

  select * into v_sale from public.sales
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_sale.id, 'trust_receipt_number', v_sale.trust_receipt_number, 'status', v_sale.status, 'idempotent_replay', true);
  end if;

  perform 1
  from public.inventory_lots l
  where l.organization_id = p_organization_id
    and l.id in (select (value->>'inventory_lot_id')::uuid from jsonb_array_elements(p_lines))
  order by l.id
  for update;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    select * into v_lot from public.inventory_lots
    where id = (v_line->>'inventory_lot_id')::uuid and organization_id = p_organization_id;
    if not found then
      raise exception 'Inventory lot not found in organization' using errcode = '22023';
    end if;
    v_qty := (v_line->>'quantity_kg')::numeric;
    v_price := (v_line->>'selling_price_per_kg')::numeric;
    if v_qty is null or v_price is null or v_qty <= 0 or v_price < 0 then
      raise exception 'Sale quantity must be positive and price nonnegative' using errcode = '22023';
    end if;
    if private.custody_balance(v_lot.id, 'salesman', p_salesman_user_id) < v_qty then
      raise exception 'Insufficient Salesman stock for lot %', v_lot.id using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.stock_trip_lines stl
      join public.stock_trips st on st.id = stl.stock_trip_id
      where stl.id = v_lot.stock_trip_line_id and st.trip_date > p_sale_date
    ) then
      raise exception 'Sale date cannot precede the source Trip date' using errcode = '22023';
    end if;
    v_gross := v_gross + round(v_qty * v_price, 2);
    v_cogs := v_cogs + round(v_qty * v_lot.cost_per_kg, 2);
  end loop;
  v_net := v_gross - p_sales_deductions;
  if v_net < 0 then
    raise exception 'Sales deductions cannot exceed gross Sales' using errcode = '22023';
  end if;
  if p_initial_payment is not null and coalesce((p_initial_payment->>'amount')::numeric, 0) > v_net then
    raise exception 'Initial Payment cannot exceed Sale net amount' using errcode = '22023';
  end if;

  insert into public.sales (
    organization_id, trust_receipt_number, customer_id, salesman_user_id, sale_date,
    status, subtotal, gross_sales, sales_deductions, net_sales, total_cogs,
    notes, client_request_id, created_by
  ) values (
    p_organization_id, btrim(p_trust_receipt_number), p_customer_id, p_salesman_user_id,
    p_sale_date, 'unpaid', v_gross, v_gross, p_sales_deductions, v_net, v_cogs,
    nullif(btrim(p_notes), ''), p_client_request_id, v_actor
  ) returning * into v_sale;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    select * into v_lot from public.inventory_lots where id = (v_line->>'inventory_lot_id')::uuid;
    v_qty := (v_line->>'quantity_kg')::numeric;
    v_price := (v_line->>'selling_price_per_kg')::numeric;
    v_line_sales := round(v_qty * v_price, 2);
    v_line_cogs := round(v_qty * v_lot.cost_per_kg, 2);
    insert into public.sale_lines (
      sale_id, inventory_lot_id, product_id, code_id, class_type_id, quantity_kg,
      selling_price_per_kg, acquisition_cost_per_kg, line_sales, line_cogs,
      price_override, default_price
    ) values (
      v_sale.id, v_lot.id, v_lot.product_id, v_lot.code_id, v_lot.class_type_id, v_qty,
      v_price, v_lot.cost_per_kg, v_line_sales, v_line_cogs,
      coalesce((v_line->>'price_override')::boolean, false), nullif(v_line->>'default_price', '')::numeric
    ) returning * into v_sale_line;

    insert into public.inventory_movements (
      organization_id, inventory_lot_id, movement_type, quantity_kg, from_location_type,
      from_salesman_user_id, to_location_type, reference_type, reference_id,
      reference_line_id, effective_date, created_by
    ) values (
      p_organization_id, v_lot.id, 'sale', v_qty, 'salesman', p_salesman_user_id,
      'customer', 'sale', v_sale.id, v_sale_line.id, p_sale_date, v_actor
    );

    if v_sale_line.price_override then
      insert into public.discrepancies (
        organization_id, type, severity, related_entity_type, related_entity_id,
        salesman_user_id, description
      ) values (
        p_organization_id, 'price_override', 'low', 'sale_line', v_sale_line.id,
        p_salesman_user_id, 'Selling price differed from the supplied default price snapshot.'
      );
    end if;
  end loop;

  if p_initial_payment is not null and coalesce((p_initial_payment->>'amount')::numeric, 0) > 0 then
    v_payment_id := private.record_payment_core(
      p_organization_id, p_customer_id, p_salesman_user_id, p_sale_date,
      (p_initial_payment->>'amount')::numeric, p_initial_payment->>'method',
      p_initial_payment->>'reference_number', p_initial_payment->>'notes',
      (p_initial_payment->>'client_request_id')::uuid, v_actor, v_sale.id
    );
    select * into v_sale from public.sales where id = v_sale.id;
  end if;

  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_organization_id, v_actor, 'sale', v_sale.id, 'created', jsonb_build_object('trust_receipt_number', v_sale.trust_receipt_number, 'net_sales', v_sale.net_sales));
  return jsonb_build_object(
    'id', v_sale.id, 'trust_receipt_number', v_sale.trust_receipt_number,
    'status', v_sale.status, 'payment_id', v_payment_id, 'idempotent_replay', false
  );
end;
$$;

create function api.submit_dcr(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_report_date date,
  p_actual_cash_remittance numeric,
  p_client_request_id uuid,
  p_explanation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_dcr public.daily_cash_reports%rowtype;
  v_cash numeric;
  v_gcash numeric;
  v_bank numeric;
  v_expenses numeric;
  v_expected numeric;
  v_difference numeric;
begin
  if v_actor is null or not (
    private.has_org_role(p_organization_id, array['owner_admin', 'cashier'])
    or (v_actor = p_salesman_user_id and private.has_org_role(p_organization_id, array['salesman']))
  ) then
    raise exception 'Not authorized to submit this DCR' using errcode = '42501';
  end if;
  if not private.is_active_salesman(p_organization_id, p_salesman_user_id) then
    raise exception 'Salesman is not active' using errcode = '22023';
  end if;
  if p_actual_cash_remittance < 0 then
    raise exception 'Actual remittance cannot be negative' using errcode = '22023';
  end if;

  select * into v_dcr from public.daily_cash_reports
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_dcr.id, 'status', v_dcr.status, 'idempotent_replay', true);
  end if;

  -- Serialize submissions for the same organization/Salesman/date without a mutable balance row.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_salesman_user_id::text || ':' || p_report_date::text, 0));

  select
    coalesce(sum(amount) filter (where method = 'cash'), 0),
    coalesce(sum(amount) filter (where method = 'gcash'), 0),
    coalesce(sum(amount) filter (where method = 'bank'), 0)
  into v_cash, v_gcash, v_bank
  from public.payments
  where organization_id = p_organization_id and salesman_user_id = p_salesman_user_id
    and payment_date = p_report_date and voided_at is null;

  select coalesce(sum(amount), 0) into v_expenses
  from public.expenses
  where organization_id = p_organization_id and salesman_user_id = p_salesman_user_id
    and expense_date = p_report_date and payment_source = 'cash_collection'
    and approval_status = 'approved';

  v_expected := v_cash - v_expenses;
  v_difference := p_actual_cash_remittance - v_expected;
  if v_difference <> 0 and length(btrim(coalesce(p_explanation, ''))) = 0 then
    raise exception 'An explanation is required when remittance differs' using errcode = '22023';
  end if;

  insert into public.daily_cash_reports (
    organization_id, salesman_user_id, report_date, status, cash_collected,
    gcash_collected, bank_collected, cash_paid_expenses, expected_cash_remittance,
    actual_cash_remittance, difference, explanation, source_snapshot,
    client_request_id, submitted_at, locked_at
  ) values (
    p_organization_id, p_salesman_user_id, p_report_date, 'locked', v_cash,
    v_gcash, v_bank, v_expenses, v_expected, p_actual_cash_remittance,
    v_difference, nullif(btrim(p_explanation), ''),
    jsonb_build_object('cash', v_cash, 'gcash', v_gcash, 'bank', v_bank, 'cash_paid_expenses', v_expenses),
    p_client_request_id, now(), now()
  ) returning * into v_dcr;

  if v_difference <> 0 then
    insert into public.discrepancies (
      organization_id, type, severity, related_entity_type, related_entity_id,
      salesman_user_id, amount_difference, description
    ) values (
      p_organization_id, case when v_difference < 0 then 'cash_shortage' else 'cash_overage' end,
      case when abs(v_difference) >= 1000 then 'high' else 'medium' end,
      'daily_cash_report', v_dcr.id, p_salesman_user_id, v_difference,
      'Submitted cash remittance differs from the database-derived expected amount.'
    );
  end if;
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_organization_id, v_actor, 'daily_cash_report', v_dcr.id, 'submitted_and_locked', to_jsonb(v_dcr));
  return jsonb_build_object('id', v_dcr.id, 'status', v_dcr.status, 'difference', v_dcr.difference, 'idempotent_replay', false);
end;
$$;

create function private.flag_post_dcr_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_salesman uuid;
  v_date date;
  v_entity_id uuid;
  v_dcr_id uuid;
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_salesman := old.salesman_user_id;
    v_entity_id := old.id;
    if tg_table_name = 'payments' then v_date := old.payment_date; else v_date := old.expense_date; end if;
  else
    v_org := new.organization_id;
    v_salesman := new.salesman_user_id;
    v_entity_id := new.id;
    if tg_table_name = 'payments' then v_date := new.payment_date; else v_date := new.expense_date; end if;
  end if;
  if v_salesman is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select id into v_dcr_id from public.daily_cash_reports
  where organization_id = v_org and salesman_user_id = v_salesman
    and report_date = v_date and status = 'locked';
  if found then
    insert into public.discrepancies (
      organization_id, type, severity, related_entity_type, related_entity_id,
      salesman_user_id, description
    ) values (
      v_org, 'post_dcr_adjustment', 'high', tg_table_name, v_entity_id, v_salesman,
      format('%s %s changed after DCR %s was locked.', initcap(tg_table_name), tg_op, v_dcr_id)
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger payments_post_dcr_adjustment
after insert or update or delete on public.payments
for each row execute function private.flag_post_dcr_adjustment();
create trigger expenses_post_dcr_adjustment
after insert or update or delete on public.expenses
for each row execute function private.flag_post_dcr_adjustment();

revoke all on function private.record_payment_core(uuid, uuid, uuid, date, numeric, text, text, text, uuid, uuid, uuid) from public;
revoke all on function private.flag_post_dcr_adjustment() from public;
revoke all on function api.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) from public, anon;
revoke all on function api.transfer_warehouse_to_salesman(uuid, uuid, date, jsonb, uuid, text) from public, anon;
revoke all on function api.transfer_salesman_to_salesman(uuid, uuid, uuid, date, jsonb, uuid, text) from public, anon;
revoke all on function api.create_sale(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb) from public, anon;
revoke all on function api.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) from public, anon;
revoke all on function api.submit_dcr(uuid, uuid, date, numeric, uuid, text) from public, anon;
grant usage on schema api to authenticated;
grant execute on function api.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) to authenticated;
grant execute on function api.transfer_warehouse_to_salesman(uuid, uuid, date, jsonb, uuid, text) to authenticated;
grant execute on function api.transfer_salesman_to_salesman(uuid, uuid, uuid, date, jsonb, uuid, text) to authenticated;
grant execute on function api.create_sale(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb) to authenticated;
grant execute on function api.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) to authenticated;
grant execute on function api.submit_dcr(uuid, uuid, date, numeric, uuid, text) to authenticated;

comment on function api.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) is 'Atomically creates a received Trip, exact source lots, and Warehouse stock-in movements.';
comment on function api.transfer_warehouse_to_salesman(uuid, uuid, date, jsonb, uuid, text) is 'Locks source lots in UUID order, validates Warehouse custody, and creates one Receiving Receipt and movements.';
comment on function api.transfer_salesman_to_salesman(uuid, uuid, uuid, date, jsonb, uuid, text) is 'Locks source lots, validates source Salesman custody, and preserves company stock and cost basis.';
comment on function api.create_sale(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb) is 'Creates an idempotent Sale, exact lot lines, COGS snapshots, movements, and optional initial Payment atomically.';
comment on function api.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) is 'Creates an idempotent Payment and allocates it oldest eligible Sale first, or to one target Sale.';
comment on function api.submit_dcr(uuid, uuid, date, numeric, uuid, text) is 'Derives Payment and approved cash-expense totals, stores one locked DCR snapshot, and records discrepancies.';

create view public.warehouse_stock_summary
with (security_invoker = true)
as
select
  l.organization_id,
  l.id as inventory_lot_id,
  st.id as stock_trip_id,
  st.trip_number,
  st.trip_date,
  l.plant_id,
  p.name as plant_name,
  l.product_id,
  pr.name as product_name,
  pr.category,
  l.code_id,
  pc.code as product_code,
  l.class_type_id,
  ct.class_type,
  l.cost_per_kg,
  l.original_quantity_kg,
  private.custody_balance(l.id, 'warehouse', null) as available_quantity_kg,
  round(private.custody_balance(l.id, 'warehouse', null) * l.cost_per_kg, 2) as inventory_cost_value
from public.inventory_lots l
join public.stock_trip_lines stl on stl.id = l.stock_trip_line_id
join public.stock_trips st on st.id = stl.stock_trip_id
join public.plants p on p.id = l.plant_id
join public.products pr on pr.id = l.product_id
left join public.plant_product_codes pc on pc.id = l.code_id
left join public.plant_product_class_types ct on ct.id = l.class_type_id
where private.has_org_role(l.organization_id, array['owner_admin', 'warehouse']);

create view public.salesman_stock_summary
with (security_invoker = true)
as
with custodians as (
  select organization_id, inventory_lot_id, to_salesman_user_id as salesman_user_id
  from public.inventory_movements where to_location_type = 'salesman'
  union
  select organization_id, inventory_lot_id, from_salesman_user_id
  from public.inventory_movements where from_location_type = 'salesman'
)
select
  c.organization_id,
  c.salesman_user_id,
  pf.full_name as salesman_name,
  l.id as inventory_lot_id,
  st.id as stock_trip_id,
  st.trip_number,
  st.trip_date,
  l.plant_id,
  p.name as plant_name,
  l.product_id,
  pr.name as product_name,
  pr.category,
  l.code_id,
  pc.code as product_code,
  l.class_type_id,
  ct.class_type,
  l.cost_per_kg,
  private.custody_balance(l.id, 'salesman', c.salesman_user_id) as available_quantity_kg,
  round(private.custody_balance(l.id, 'salesman', c.salesman_user_id) * l.cost_per_kg, 2) as inventory_cost_value
from custodians c
join public.inventory_lots l on l.id = c.inventory_lot_id and l.organization_id = c.organization_id
join public.stock_trip_lines stl on stl.id = l.stock_trip_line_id
join public.stock_trips st on st.id = stl.stock_trip_id
join public.plants p on p.id = l.plant_id
join public.products pr on pr.id = l.product_id
join public.profiles pf on pf.id = c.salesman_user_id
left join public.plant_product_codes pc on pc.id = l.code_id
left join public.plant_product_class_types ct on ct.id = l.class_type_id
where c.salesman_user_id = auth.uid()
   or private.has_org_role(c.organization_id, array['owner_admin', 'warehouse']);

create view public.company_stock_summary
with (security_invoker = true)
as
select
  l.organization_id,
  l.id as inventory_lot_id,
  st.id as stock_trip_id,
  st.trip_number,
  st.trip_date,
  l.plant_id,
  p.name as plant_name,
  l.product_id,
  pr.name as product_name,
  l.code_id,
  l.class_type_id,
  l.cost_per_kg,
  coalesce(sum(
    case when m.to_location_type in ('warehouse', 'salesman') then m.quantity_kg else 0 end
    - case when m.from_location_type in ('warehouse', 'salesman') then m.quantity_kg else 0 end
  ), 0) as available_quantity_kg,
  round(coalesce(sum(
    case when m.to_location_type in ('warehouse', 'salesman') then m.quantity_kg else 0 end
    - case when m.from_location_type in ('warehouse', 'salesman') then m.quantity_kg else 0 end
  ), 0) * l.cost_per_kg, 2) as inventory_cost_value
from public.inventory_lots l
join public.stock_trip_lines stl on stl.id = l.stock_trip_line_id
join public.stock_trips st on st.id = stl.stock_trip_id
join public.plants p on p.id = l.plant_id
join public.products pr on pr.id = l.product_id
left join public.inventory_movements m on m.inventory_lot_id = l.id
group by l.organization_id, l.id, st.id, st.trip_number, st.trip_date,
  l.plant_id, p.name, l.product_id, pr.name, l.code_id, l.class_type_id, l.cost_per_kg
having private.has_org_role(l.organization_id, array['owner_admin', 'warehouse']);

create view public.customer_balances
with (security_invoker = true)
as
select
  c.organization_id,
  c.id as customer_id,
  c.name as customer_name,
  coalesce(sum(s.net_sales) filter (where s.status <> 'voided'), 0) as total_sales,
  coalesce(sum(a.allocated_amount), 0) as total_payments,
  coalesce(sum(s.net_sales) filter (where s.status <> 'voided'), 0) - coalesce(sum(a.allocated_amount), 0) as outstanding_balance
from public.customers c
left join public.sales s on s.customer_id = c.id
left join lateral (
  select coalesce(sum(pa.amount) filter (where p.voided_at is null), 0) as allocated_amount
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.sale_id = s.id
) a on true
group by c.organization_id, c.id, c.name;

create view public.customer_ledger_entries
with (security_invoker = true)
as
select
  s.organization_id,
  s.customer_id,
  s.sale_date as entry_date,
  s.created_at,
  'sale'::text as entry_type,
  s.id as entry_id,
  s.trust_receipt_number as reference_number,
  s.net_sales as debit,
  0::numeric as credit
from public.sales s where s.status <> 'voided'
union all
select
  p.organization_id,
  p.customer_id,
  p.payment_date,
  p.created_at,
  'payment'::text,
  p.id,
  p.payment_number,
  0::numeric,
  coalesce(sum(pa.amount), 0)
from public.payments p
join public.payment_allocations pa on pa.payment_id = p.id
where p.voided_at is null
group by p.id;

create view public.collectibles
with (security_invoker = true)
as
select
  s.organization_id,
  s.id as sale_id,
  s.customer_id,
  c.name as customer_name,
  s.salesman_user_id,
  s.sale_date,
  s.trust_receipt_number,
  s.net_sales,
  private.sale_open_balance(s.id) as outstanding_balance,
  c.payment_terms_days,
  case when c.payment_terms_days is null then null else s.sale_date + c.payment_terms_days end as due_date
from public.sales s
join public.customers c on c.id = s.customer_id
where s.status <> 'voided' and private.sale_open_balance(s.id) > 0;

create view public.daily_sales_summary
with (security_invoker = true)
as
select organization_id, sale_date, salesman_user_id, count(*) as sale_count,
  sum(gross_sales) as gross_sales, sum(sales_deductions) as sales_deductions,
  sum(net_sales) as net_sales, sum(total_cogs) as cogs, sum(gross_profit) as gross_profit
from public.sales where status <> 'voided'
group by organization_id, sale_date, salesman_user_id;

create view public.daily_payment_summary
with (security_invoker = true)
as
select organization_id, payment_date, salesman_user_id, count(*) as payment_count,
  coalesce(sum(amount) filter (where method = 'cash'), 0) as cash,
  coalesce(sum(amount) filter (where method = 'gcash'), 0) as gcash,
  coalesce(sum(amount) filter (where method = 'bank'), 0) as bank,
  sum(amount) as total_payments
from public.payments where voided_at is null
group by organization_id, payment_date, salesman_user_id;

create view public.sales_by_plant
with (security_invoker = true)
as
select s.organization_id, l.plant_id, p.name as plant_name, s.sale_date,
  count(distinct s.id) as sale_count, sum(sl.quantity_kg) as quantity_kg,
  sum(sl.line_sales) as gross_sales, sum(sl.line_cogs) as cogs,
  sum(sl.line_gross_profit) as gross_profit
from public.sale_lines sl
join public.sales s on s.id = sl.sale_id and s.status <> 'voided'
join public.inventory_lots l on l.id = sl.inventory_lot_id
join public.plants p on p.id = l.plant_id
group by s.organization_id, l.plant_id, p.name, s.sale_date;

create view public.sales_by_product
with (security_invoker = true)
as
select s.organization_id, sl.product_id, p.name as product_name, s.sale_date,
  count(distinct s.id) as sale_count, sum(sl.quantity_kg) as quantity_kg,
  sum(sl.line_sales) as gross_sales, sum(sl.line_cogs) as cogs,
  sum(sl.line_gross_profit) as gross_profit
from public.sale_lines sl
join public.sales s on s.id = sl.sale_id and s.status <> 'voided'
join public.products p on p.id = sl.product_id
group by s.organization_id, sl.product_id, p.name, s.sale_date;

create view public.profitability_by_plant
with (security_invoker = true)
as
select organization_id, plant_id, plant_name,
  sum(quantity_kg) as quantity_kg, sum(gross_sales) as net_sales,
  sum(cogs) as cogs, sum(gross_profit) as gross_profit,
  case when sum(gross_sales) = 0 then 0 else round(sum(gross_profit) / sum(gross_sales) * 100, 2) end as gross_margin_percent
from public.sales_by_plant
group by organization_id, plant_id, plant_name;

create view public.profitability_by_product
with (security_invoker = true)
as
select organization_id, product_id, product_name,
  sum(quantity_kg) as quantity_kg, sum(gross_sales) as net_sales,
  sum(cogs) as cogs, sum(gross_profit) as gross_profit,
  case when sum(gross_sales) = 0 then 0 else round(sum(gross_profit) / sum(gross_sales) * 100, 2) end as gross_margin_percent
from public.sales_by_product
group by organization_id, product_id, product_name;

comment on view public.warehouse_stock_summary is 'Lot-level Warehouse inventory; zero-balance sold-out lots remain present.';
comment on view public.salesman_stock_summary is 'Lot-level Salesman custody derived from immutable movements.';
comment on view public.company_stock_summary is 'Warehouse plus all Salesman custody, excluding sold Customer stock.';

-- Every client/business table is RLS-protected. Critical transaction tables have no direct write grants.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'organizations', 'profiles', 'organization_memberships', 'plants', 'products',
    'plant_products', 'plant_product_codes', 'plant_product_class_types', 'stock_trips',
    'stock_trip_lines', 'inventory_lots', 'inventory_movements', 'receiving_receipts',
    'receiving_receipt_lines', 'transfer_receipts', 'transfer_receipt_lines', 'customers',
    'customer_prices', 'sales', 'sale_lines', 'payments', 'payment_allocations', 'expenses',
    'daily_cash_reports', 'discrepancies', 'audit_events', 'trucks', 'truck_renewals',
    'truck_maintenance', 'time_entries', 'payroll_periods', 'payroll_entries'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$$;

create policy organizations_select on public.organizations for select to authenticated
using (private.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
using (private.has_org_role(id, array['owner_admin']))
with check (private.has_org_role(id, array['owner_admin']));

create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid() or exists (
    select 1 from public.organization_memberships mine
    join public.organization_memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and mine.active and theirs.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_select on public.organization_memberships for select to authenticated
using (private.is_org_member(organization_id));
create policy memberships_insert on public.organization_memberships for insert to authenticated
with check (private.has_org_role(organization_id, array['owner_admin']));
create policy memberships_update on public.organization_memberships for update to authenticated
using (private.has_org_role(organization_id, array['owner_admin']))
with check (private.has_org_role(organization_id, array['owner_admin']));

create policy plants_select on public.plants for select to authenticated
using (private.is_org_member(organization_id));
create policy plants_write on public.plants for all to authenticated
using (private.has_org_role(organization_id, array['owner_admin']))
with check (private.has_org_role(organization_id, array['owner_admin']));
create policy products_select on public.products for select to authenticated
using (private.is_org_member(organization_id));
create policy products_write on public.products for all to authenticated
using (private.has_org_role(organization_id, array['owner_admin']))
with check (private.has_org_role(organization_id, array['owner_admin']));

create policy plant_products_select on public.plant_products for select to authenticated
using (exists (select 1 from public.plants p where p.id = plant_id and private.is_org_member(p.organization_id)));
create policy plant_products_write on public.plant_products for all to authenticated
using (exists (select 1 from public.plants p where p.id = plant_id and private.has_org_role(p.organization_id, array['owner_admin'])))
with check (exists (select 1 from public.plants p where p.id = plant_id and private.has_org_role(p.organization_id, array['owner_admin'])));
create policy product_codes_select on public.plant_product_codes for select to authenticated
using (exists (
  select 1 from public.plant_products pp join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.is_org_member(p.organization_id)
));
create policy product_codes_write on public.plant_product_codes for all to authenticated
using (exists (
  select 1 from public.plant_products pp join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
)) with check (exists (
  select 1 from public.plant_products pp join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
));
create policy product_class_types_select on public.plant_product_class_types for select to authenticated
using (exists (
  select 1 from public.plant_products pp join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.is_org_member(p.organization_id)
));
create policy product_class_types_write on public.plant_product_class_types for all to authenticated
using (exists (
  select 1 from public.plant_products pp join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
)) with check (exists (
  select 1 from public.plant_products pp join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
));

create policy stock_trips_select on public.stock_trips for select to authenticated
using (private.is_org_member(organization_id));
create policy stock_trip_lines_select on public.stock_trip_lines for select to authenticated
using (exists (select 1 from public.stock_trips st where st.id = stock_trip_id and private.is_org_member(st.organization_id)));
create policy inventory_lots_select on public.inventory_lots for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'warehouse'])
  or exists (
    select 1 from public.inventory_movements m
    where m.inventory_lot_id = inventory_lots.id
      and (m.from_salesman_user_id = auth.uid() or m.to_salesman_user_id = auth.uid())
  )
);
create policy inventory_movements_select on public.inventory_movements for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'warehouse'])
  or from_salesman_user_id = auth.uid() or to_salesman_user_id = auth.uid()
);

create policy receiving_receipts_select on public.receiving_receipts for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'warehouse'])
  or salesman_user_id = auth.uid()
);
create policy receiving_receipt_lines_select on public.receiving_receipt_lines for select to authenticated
using (exists (
  select 1 from public.receiving_receipts r where r.id = receipt_id
    and (private.has_org_role(r.organization_id, array['owner_admin', 'warehouse']) or r.salesman_user_id = auth.uid())
));

create policy transfer_receipts_select on public.transfer_receipts for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'warehouse'])
  or from_salesman_user_id = auth.uid() or to_salesman_user_id = auth.uid()
);
create policy transfer_receipt_lines_select on public.transfer_receipt_lines for select to authenticated
using (exists (
  select 1 from public.transfer_receipts r where r.id = receipt_id
    and (private.has_org_role(r.organization_id, array['owner_admin', 'warehouse'])
      or r.from_salesman_user_id = auth.uid() or r.to_salesman_user_id = auth.uid())
));

create policy customers_select on public.customers for select to authenticated
using (private.is_org_member(organization_id));
create policy customers_write on public.customers for all to authenticated
using (private.has_org_role(organization_id, array['owner_admin', 'cashier']))
with check (private.has_org_role(organization_id, array['owner_admin', 'cashier']));
create policy customer_prices_select on public.customer_prices for select to authenticated
using (exists (select 1 from public.customers c where c.id = customer_id and private.is_org_member(c.organization_id)));
create policy customer_prices_write on public.customer_prices for all to authenticated
using (exists (
  select 1 from public.customers c where c.id = customer_id and private.has_org_role(c.organization_id, array['owner_admin', 'cashier'])
)) with check (exists (
  select 1 from public.customers c where c.id = customer_id and private.has_org_role(c.organization_id, array['owner_admin', 'cashier'])
));

create policy sales_select on public.sales for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'cashier'])
  or salesman_user_id = auth.uid()
);
create policy sale_lines_select on public.sale_lines for select to authenticated
using (exists (
  select 1 from public.sales s where s.id = sale_id
    and (private.has_org_role(s.organization_id, array['owner_admin', 'cashier']) or s.salesman_user_id = auth.uid())
));
create policy payments_select on public.payments for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'cashier'])
  or salesman_user_id = auth.uid()
);
create policy payment_allocations_select on public.payment_allocations for select to authenticated
using (exists (
  select 1 from public.payments p where p.id = payment_id
    and (private.has_org_role(p.organization_id, array['owner_admin', 'cashier']) or p.salesman_user_id = auth.uid())
));

create policy expenses_select on public.expenses for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'cashier'])
  or salesman_user_id = auth.uid()
);
create policy expenses_insert on public.expenses for insert to authenticated
with check (
  created_by = auth.uid() and (
    private.has_org_role(organization_id, array['owner_admin', 'cashier'])
    or (salesman_user_id = auth.uid() and private.has_org_role(organization_id, array['salesman']))
  )
);
create policy expenses_admin_update on public.expenses for update to authenticated
using (private.has_org_role(organization_id, array['owner_admin', 'cashier']))
with check (private.has_org_role(organization_id, array['owner_admin', 'cashier']));
create policy dcr_select on public.daily_cash_reports for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'cashier'])
  or salesman_user_id = auth.uid()
);
create policy discrepancies_select on public.discrepancies for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin', 'cashier', 'warehouse'])
  or salesman_user_id = auth.uid()
);
create policy audit_events_select on public.audit_events for select to authenticated
using (private.has_org_role(organization_id, array['owner_admin']));

create policy trucks_select on public.trucks for select to authenticated
using (private.is_org_member(organization_id));
create policy trucks_write on public.trucks for all to authenticated
using (private.has_org_role(organization_id, array['owner_admin', 'warehouse']))
with check (private.has_org_role(organization_id, array['owner_admin', 'warehouse']));
create policy truck_renewals_select on public.truck_renewals for select to authenticated
using (exists (select 1 from public.trucks t where t.id = truck_id and private.is_org_member(t.organization_id)));
create policy truck_renewals_write on public.truck_renewals for all to authenticated
using (exists (select 1 from public.trucks t where t.id = truck_id and private.has_org_role(t.organization_id, array['owner_admin', 'warehouse'])))
with check (exists (select 1 from public.trucks t where t.id = truck_id and private.has_org_role(t.organization_id, array['owner_admin', 'warehouse'])));
create policy truck_maintenance_select on public.truck_maintenance for select to authenticated
using (exists (select 1 from public.trucks t where t.id = truck_id and private.is_org_member(t.organization_id)));
create policy truck_maintenance_write on public.truck_maintenance for all to authenticated
using (exists (select 1 from public.trucks t where t.id = truck_id and private.has_org_role(t.organization_id, array['owner_admin', 'warehouse'])))
with check (exists (select 1 from public.trucks t where t.id = truck_id and private.has_org_role(t.organization_id, array['owner_admin', 'warehouse'])));

create policy time_entries_select on public.time_entries for select to authenticated
using (
  user_id = auth.uid() or private.has_org_role(organization_id, array['owner_admin', 'payroll_admin'])
);
create policy time_entries_insert on public.time_entries for insert to authenticated
with check (
  user_id = auth.uid() or private.has_org_role(organization_id, array['owner_admin', 'payroll_admin'])
);
create policy time_entries_update on public.time_entries for update to authenticated
using (user_id = auth.uid() or private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']))
with check (user_id = auth.uid() or private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']));
create policy payroll_periods_select on public.payroll_periods for select to authenticated
using (private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']));
create policy payroll_periods_write on public.payroll_periods for all to authenticated
using (private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']))
with check (private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']));
create policy payroll_entries_select on public.payroll_entries for select to authenticated
using (
  user_id = auth.uid() or exists (
    select 1 from public.payroll_periods pp where pp.id = payroll_period_id
      and private.has_org_role(pp.organization_id, array['owner_admin', 'payroll_admin'])
  )
);
create policy payroll_entries_write on public.payroll_entries for all to authenticated
using (exists (
  select 1 from public.payroll_periods pp where pp.id = payroll_period_id
    and private.has_org_role(pp.organization_id, array['owner_admin', 'payroll_admin'])
)) with check (exists (
  select 1 from public.payroll_periods pp where pp.id = payroll_period_id
    and private.has_org_role(pp.organization_id, array['owner_admin', 'payroll_admin'])
));

-- New Supabase projects require explicit Data API privileges; keep anon fully denied.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.organizations, public.profiles, public.organization_memberships,
  public.plants, public.products, public.plant_products, public.plant_product_codes,
  public.plant_product_class_types, public.customers, public.customer_prices,
  public.expenses, public.trucks, public.truck_renewals, public.truck_maintenance,
  public.time_entries, public.payroll_periods, public.payroll_entries to authenticated;

grant select on public.warehouse_stock_summary, public.salesman_stock_summary,
  public.company_stock_summary, public.customer_balances, public.customer_ledger_entries,
  public.collectibles, public.daily_sales_summary, public.daily_payment_summary,
  public.sales_by_plant, public.sales_by_product,
  public.profitability_by_plant, public.profitability_by_product to authenticated;
