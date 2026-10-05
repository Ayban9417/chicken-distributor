-- Permanent deletion is intentionally available only through the service-role
-- Edge Function after current-password reauthentication. Browser clients retain
-- normal create/update access, but no direct DELETE policy.
drop policy if exists products_write on public.products;
create policy products_insert on public.products for insert to authenticated
with check (private.has_org_role(organization_id, array['owner_admin']));
create policy products_update on public.products for update to authenticated
using (private.has_org_role(organization_id, array['owner_admin']))
with check (private.has_org_role(organization_id, array['owner_admin']));

drop policy if exists plant_products_write on public.plant_products;
create policy plant_products_insert on public.plant_products for insert to authenticated
with check (exists (
  select 1 from public.plants p
  where p.id = plant_id and private.has_org_role(p.organization_id, array['owner_admin'])
));
create policy plant_products_update on public.plant_products for update to authenticated
using (exists (
  select 1 from public.plants p
  where p.id = plant_id and private.has_org_role(p.organization_id, array['owner_admin'])
)) with check (exists (
  select 1 from public.plants p
  where p.id = plant_id and private.has_org_role(p.organization_id, array['owner_admin'])
));

drop policy if exists product_codes_write on public.plant_product_codes;
create policy product_codes_insert on public.plant_product_codes for insert to authenticated
with check (exists (
  select 1 from public.plant_products pp
  join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
));
create policy product_codes_update on public.plant_product_codes for update to authenticated
using (exists (
  select 1 from public.plant_products pp
  join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
)) with check (exists (
  select 1 from public.plant_products pp
  join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
));

drop policy if exists product_class_types_write on public.plant_product_class_types;
create policy product_class_types_insert on public.plant_product_class_types for insert to authenticated
with check (exists (
  select 1 from public.plant_products pp
  join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
));
create policy product_class_types_update on public.plant_product_class_types for update to authenticated
using (exists (
  select 1 from public.plant_products pp
  join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
)) with check (exists (
  select 1 from public.plant_products pp
  join public.plants p on p.id = pp.plant_id
  where pp.id = plant_product_id and private.has_org_role(p.organization_id, array['owner_admin'])
));

create or replace function private.assert_protected_delete_actor(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null or not exists (
    select 1
    from public.profiles p
    join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id
      and p.active
      and m.organization_id = p_organization_id
      and m.role = 'owner_admin'
      and m.active
  ) then
    raise exception 'Owner / Admin authorization is required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.delete_unused_stock_trip(
  p_organization_id uuid,
  p_stock_trip_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.stock_trips%rowtype;
  v_replay jsonb;
  v_plant_name text;
  v_line_count integer;
  v_lot_count integer;
  v_original_kg numeric(14,3);
  v_original_cost numeric(16,2);
  v_summary jsonb;
begin
  perform private.assert_protected_delete_actor(p_organization_id, p_actor_user_id);
  if p_request_id is null then
    raise exception 'Deletion request ID is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 or length(btrim(p_reason)) > 200 then
    raise exception 'Enter a deletion reason between 3 and 200 characters' using errcode = '22023';
  end if;

  select ae.after_data into v_replay
  from public.audit_events ae
  where ae.organization_id = p_organization_id
    and ae.actor_user_id = p_actor_user_id
    and ae.entity_type = 'stock_trip'
    and ae.entity_id = p_stock_trip_id
    and ae.action = 'DELETE_STOCK_TRIP'
    and ae.after_data->>'request_id' = p_request_id::text
  order by ae.created_at desc
  limit 1;
  if found then
    return v_replay || jsonb_build_object('idempotent_replay', true);
  end if;

  select st.* into v_trip
  from public.stock_trips st
  where st.id = p_stock_trip_id and st.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Stock-In Trip not found or already deleted' using errcode = 'P0002';
  end if;

  select p.name into v_plant_name from public.plants p where p.id = v_trip.plant_id;

  -- These locks serialize the dependency recheck with writes that acquire FK/key
  -- locks on the same Trip lines and lots.
  perform 1 from public.stock_trip_lines stl where stl.stock_trip_id = v_trip.id for update;
  perform 1
  from public.inventory_lots il
  join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
  where stl.stock_trip_id = v_trip.id
  for update of il;
  perform 1
  from public.inventory_movements im
  join public.inventory_lots il on il.id = im.inventory_lot_id
  join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
  where stl.stock_trip_id = v_trip.id
  for update of im;

  select count(*), coalesce(sum(stl.quantity_kg), 0), coalesce(sum(stl.total_acquisition_cost), 0)
  into v_line_count, v_original_kg, v_original_cost
  from public.stock_trip_lines stl
  where stl.stock_trip_id = v_trip.id;

  select count(*) into v_lot_count
  from public.inventory_lots il
  join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
  where stl.stock_trip_id = v_trip.id;

  if v_line_count = 0 or v_lot_count <> v_line_count or exists (
    select 1
    from public.stock_trip_lines stl
    left join public.inventory_lots il on il.stock_trip_line_id = stl.id
    where stl.stock_trip_id = v_trip.id
      and (il.id is null or il.original_quantity_kg <> stl.quantity_kg)
  ) then
    raise exception 'This trip cannot be deleted because its original inventory state is incomplete. Preserve the trip and use an adjustment/correction workflow instead.' using errcode = '55000';
  end if;

  -- Exactly one original Stock-In movement per lot is required. Any additional,
  -- changed, or operational movement makes the Trip historical and undeletable.
  if exists (
    select 1
    from public.inventory_lots il
    join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    left join public.inventory_movements im on im.inventory_lot_id = il.id
    where stl.stock_trip_id = v_trip.id
    group by il.id, stl.id, stl.quantity_kg
    having count(im.id) <> 1
      or count(im.id) filter (
        where im.movement_type = 'stock_in'
          and im.reference_type = 'stock_trip'
          and im.reference_id = v_trip.id
          and im.reference_line_id = stl.id
          and im.quantity_kg = stl.quantity_kg
          and im.from_location_type = 'plant'
          and im.to_location_type = 'warehouse'
      ) <> 1
  ) or exists (
    select 1
    from public.inventory_lots il
    join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    join public.inventory_movements im on im.inventory_lot_id = il.id
    where stl.stock_trip_id = v_trip.id and im.movement_type <> 'stock_in'
  ) then
    raise exception 'This trip cannot be deleted because stock from it has already been used in transactions. Preserve the trip and use an adjustment/correction workflow instead.' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.receiving_receipt_lines rrl
    join public.inventory_lots il on il.id = rrl.inventory_lot_id
    join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    where stl.stock_trip_id = v_trip.id
  ) or exists (
    select 1 from public.transfer_receipt_lines trl
    join public.inventory_lots il on il.id = trl.inventory_lot_id
    join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    where stl.stock_trip_id = v_trip.id
  ) or exists (
    select 1 from public.sale_lines sl
    join public.inventory_lots il on il.id = sl.inventory_lot_id
    join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    where stl.stock_trip_id = v_trip.id
  ) or exists (
    select 1
    from public.discrepancies d
    where d.organization_id = p_organization_id
      and d.related_entity_id in (
        select v_trip.id
        union select stl.id from public.stock_trip_lines stl where stl.stock_trip_id = v_trip.id
        union select il.id from public.inventory_lots il join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id where stl.stock_trip_id = v_trip.id
      )
  ) or exists (
    select 1
    from public.audit_events ae
    where ae.organization_id = p_organization_id
      and ae.entity_id in (
        select stl.id from public.stock_trip_lines stl where stl.stock_trip_id = v_trip.id
        union select il.id from public.inventory_lots il join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id where stl.stock_trip_id = v_trip.id
      )
  ) or exists (
    select 1 from public.audit_events ae
    where ae.organization_id = p_organization_id
      and ae.entity_type = 'stock_trip'
      and ae.entity_id = v_trip.id
      and lower(ae.action) <> 'created'
  ) then
    raise exception 'This trip cannot be deleted because stock from it has already been used in transactions. Preserve the trip and use an adjustment/correction workflow instead.' using errcode = '55000';
  end if;

  -- Recheck immediately before deletion while every source row remains locked.
  if exists (
    select 1
    from public.inventory_movements im
    join public.inventory_lots il on il.id = im.inventory_lot_id
    join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id
    where stl.stock_trip_id = v_trip.id and im.movement_type <> 'stock_in'
  ) then
    raise exception 'This trip cannot be deleted because stock from it has already been used in transactions. Preserve the trip and use an adjustment/correction workflow instead.' using errcode = '55000';
  end if;

  v_summary := jsonb_build_object(
    'request_id', p_request_id,
    'trip_id', v_trip.id,
    'trip_number', v_trip.trip_number,
    'plant_id', v_trip.plant_id,
    'plant', v_plant_name,
    'trip_date', v_trip.trip_date,
    'reason', btrim(p_reason),
    'deleted_line_count', v_line_count,
    'deleted_original_kg', v_original_kg,
    'deleted_acquisition_cost', v_original_cost,
    'idempotent_replay', false
  );

  delete from public.inventory_movements im
  using public.inventory_lots il, public.stock_trip_lines stl
  where im.inventory_lot_id = il.id and il.stock_trip_line_id = stl.id and stl.stock_trip_id = v_trip.id;
  delete from public.inventory_lots il
  using public.stock_trip_lines stl
  where il.stock_trip_line_id = stl.id and stl.stock_trip_id = v_trip.id;
  delete from public.stock_trip_lines where stock_trip_id = v_trip.id;
  delete from public.stock_trips where id = v_trip.id;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'stock_trip', v_trip.id, 'DELETE_STOCK_TRIP',
    jsonb_build_object('trip_number', v_trip.trip_number, 'plant', v_plant_name, 'trip_date', v_trip.trip_date),
    v_summary
  );
  return v_summary;
end;
$$;

create or replace function private.delete_unused_plant_product(
  p_organization_id uuid,
  p_plant_product_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.plant_products%rowtype;
  v_replay jsonb;
  v_plant_name text;
  v_product_name text;
  v_codes jsonb;
  v_class_types jsonb;
  v_summary jsonb;
begin
  perform private.assert_protected_delete_actor(p_organization_id, p_actor_user_id);
  if p_request_id is null then
    raise exception 'Deletion request ID is required' using errcode = '22023';
  end if;

  select ae.after_data into v_replay
  from public.audit_events ae
  where ae.organization_id = p_organization_id
    and ae.actor_user_id = p_actor_user_id
    and ae.entity_type = 'plant_product'
    and ae.entity_id = p_plant_product_id
    and ae.action = 'DELETE_PLANT_PRODUCT'
    and ae.after_data->>'request_id' = p_request_id::text
  order by ae.created_at desc
  limit 1;
  if found then
    return v_replay || jsonb_build_object('idempotent_replay', true);
  end if;

  select pp.*
  into v_config
  from public.plant_products pp
  join public.plants p on p.id = pp.plant_id
  where pp.id = p_plant_product_id and p.organization_id = p_organization_id
  for update of pp;
  if not found then
    raise exception 'Plant Product not found or already deleted' using errcode = 'P0002';
  end if;
  select p.name, pr.name into v_plant_name, v_product_name
  from public.plants p
  join public.products pr on pr.id = v_config.product_id
  where p.id = v_config.plant_id;

  perform 1 from public.plant_product_codes where plant_product_id = v_config.id for update;
  perform 1 from public.plant_product_class_types where plant_product_id = v_config.id for update;

  if exists (select 1 from public.stock_trip_lines where plant_product_id = v_config.id)
    or exists (
      select 1 from public.inventory_lots il
      where il.plant_id = v_config.plant_id and il.product_id = v_config.product_id
    )
    or exists (
      select 1 from public.sale_lines sl
      join public.inventory_lots il on il.id = sl.inventory_lot_id
      where il.plant_id = v_config.plant_id and sl.product_id = v_config.product_id
    )
    or exists (
      select 1 from public.customer_prices cp
      where cp.code_id in (select id from public.plant_product_codes where plant_product_id = v_config.id)
         or cp.class_type_id in (select id from public.plant_product_class_types where plant_product_id = v_config.id)
    )
    or exists (
      select 1 from public.discrepancies d
      where d.organization_id = p_organization_id
        and d.related_entity_id in (
          select v_config.id
          union select id from public.plant_product_codes where plant_product_id = v_config.id
          union select id from public.plant_product_class_types where plant_product_id = v_config.id
        )
    ) then
    raise exception 'This product has transaction or inventory history and cannot be permanently deleted. Deactivate it instead to preserve historical records.' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'display_name', display_name) order by code), '[]'::jsonb)
  into v_codes from public.plant_product_codes where plant_product_id = v_config.id;
  select coalesce(jsonb_agg(jsonb_build_object('class_type', class_type, 'display_name', display_name) order by class_type), '[]'::jsonb)
  into v_class_types from public.plant_product_class_types where plant_product_id = v_config.id;

  v_summary := jsonb_build_object(
    'request_id', p_request_id,
    'plant_product_id', v_config.id,
    'plant_id', v_config.plant_id,
    'plant', v_plant_name,
    'product_id', v_config.product_id,
    'product', v_product_name,
    'reason', nullif(btrim(coalesce(p_reason, '')), ''),
    'deleted_codes', v_codes,
    'deleted_class_types', v_class_types,
    'idempotent_replay', false
  );

  -- Operational dependencies are checked again under row locks immediately
  -- before the child configuration and Plant Product are removed.
  if exists (select 1 from public.stock_trip_lines where plant_product_id = v_config.id) then
    raise exception 'This product has transaction or inventory history and cannot be permanently deleted. Deactivate it instead to preserve historical records.' using errcode = '55000';
  end if;

  delete from public.plant_product_codes where plant_product_id = v_config.id;
  delete from public.plant_product_class_types where plant_product_id = v_config.id;
  delete from public.plant_products where id = v_config.id;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'plant_product', v_config.id, 'DELETE_PLANT_PRODUCT',
    jsonb_build_object('plant', v_plant_name, 'product', v_product_name, 'codes', v_codes, 'class_types', v_class_types),
    v_summary
  );
  return v_summary;
end;
$$;

-- Public-schema wrappers are visible to PostgREST but executable only with the
-- service role used by the protected Edge Function.
create or replace function public.delete_unused_stock_trip(
  p_organization_id uuid,
  p_stock_trip_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.delete_unused_stock_trip($1, $2, $3, $4, $5) $$;

create or replace function public.delete_unused_plant_product(
  p_organization_id uuid,
  p_plant_product_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.delete_unused_plant_product($1, $2, $3, $4, $5) $$;

revoke all on function private.assert_protected_delete_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function private.delete_unused_stock_trip(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.delete_unused_plant_product(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_unused_stock_trip(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_unused_plant_product(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;

grant execute on function private.assert_protected_delete_actor(uuid, uuid) to service_role;
grant execute on function private.delete_unused_stock_trip(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function private.delete_unused_plant_product(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.delete_unused_stock_trip(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.delete_unused_plant_product(uuid, uuid, uuid, text, uuid) to service_role;
