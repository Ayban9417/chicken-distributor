begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-000000000101', 'delete-owner@test.invalid'),
  ('e0000000-0000-4000-8000-000000000102', 'delete-warehouse@test.invalid'),
  ('e0000000-0000-4000-8000-000000000103', 'delete-salesman@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('e0000000-0000-4000-8000-000000000101', 'Delete Owner', 'delete.owner'),
  ('e0000000-0000-4000-8000-000000000102', 'Delete Warehouse', 'delete.warehouse'),
  ('e0000000-0000-4000-8000-000000000103', 'Delete Salesman', 'delete.salesman');
insert into public.organizations (id, name, slug) values
  ('e0000000-0000-4000-8000-000000000001', 'Protected Delete Test', 'protected-delete-test');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000102', 'warehouse'),
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000103', 'salesman');
insert into public.plants (id, organization_id, name, short_code) values
  ('e0000000-0000-4000-8000-000000000201', 'e0000000-0000-4000-8000-000000000001', 'Delete Plant A', 'DPA'),
  ('e0000000-0000-4000-8000-000000000202', 'e0000000-0000-4000-8000-000000000001', 'Delete Plant B', 'DPB');
insert into public.products (id, organization_id, name, category) values
  ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000001', 'Safe Chicken', 'whole_chicken'),
  ('e0000000-0000-4000-8000-000000000302', 'e0000000-0000-4000-8000-000000000001', 'Used Chicken', 'whole_chicken'),
  ('e0000000-0000-4000-8000-000000000303', 'e0000000-0000-4000-8000-000000000001', 'Shared Product', 'by_product');
insert into public.plant_products (id, plant_id, product_id, allows_free_from_plant, uses_size_codes, uses_class_types) values
  ('e0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000201', 'e0000000-0000-4000-8000-000000000301', true, false, false),
  ('e0000000-0000-4000-8000-000000000402', 'e0000000-0000-4000-8000-000000000201', 'e0000000-0000-4000-8000-000000000302', true, false, false),
  ('e0000000-0000-4000-8000-000000000403', 'e0000000-0000-4000-8000-000000000201', 'e0000000-0000-4000-8000-000000000303', true, true, true),
  ('e0000000-0000-4000-8000-000000000404', 'e0000000-0000-4000-8000-000000000202', 'e0000000-0000-4000-8000-000000000303', true, false, false);
insert into public.plant_product_codes (id, plant_product_id, code, display_name) values
  ('e0000000-0000-4000-8000-000000000411', 'e0000000-0000-4000-8000-000000000403', 'QA', 'QA Code');
insert into public.plant_product_class_types (id, plant_product_id, class_type, display_name) values
  ('e0000000-0000-4000-8000-000000000412', 'e0000000-0000-4000-8000-000000000403', 'QA Class', 'QA Class');

select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000101', true);
select api.create_stock_trip(
  'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000201', '2026-10-01',
  '[{"plant_product_id":"e0000000-0000-4000-8000-000000000401","quantity_kg":25,"acquisition_type":"purchased","cost_per_kg":100}]',
  'e0000000-0000-4000-8000-000000000501'
);
select api.create_stock_trip(
  'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000201', '2026-10-02',
  '[{"plant_product_id":"e0000000-0000-4000-8000-000000000402","quantity_kg":40,"acquisition_type":"purchased","cost_per_kg":110}]',
  'e0000000-0000-4000-8000-000000000502'
);

select lives_ok(
  $$select private.delete_unused_stock_trip(
    'e0000000-0000-4000-8000-000000000001',
    (select id from public.stock_trips where client_request_id = 'e0000000-0000-4000-8000-000000000501'),
    'e0000000-0000-4000-8000-000000000101', 'Wrong trip date', 'e0000000-0000-4000-8000-000000000601'
  )$$,
  'unused Trip deletion succeeds'
);
select is((select count(*) from public.stock_trips where client_request_id = 'e0000000-0000-4000-8000-000000000501'), 0::bigint, 'safe Trip is removed');
select is((select count(*) from public.stock_trip_lines where plant_product_id = 'e0000000-0000-4000-8000-000000000401'), 0::bigint, 'safe Trip lines are removed');
select is((select count(*) from public.inventory_lots where product_id = 'e0000000-0000-4000-8000-000000000301'), 0::bigint, 'safe source lots are removed');
select is((select count(*) from public.inventory_movements where inventory_lot_id not in (select id from public.inventory_lots)), 0::bigint, 'safe deletion leaves no orphan movements');
select is((select coalesce(sum(available_quantity_kg), 0) from public.warehouse_stock_summary where product_id = 'e0000000-0000-4000-8000-000000000301'), 0::numeric, 'Warehouse stock reconciles after deletion');
select is((select count(*) from public.audit_events where organization_id = 'e0000000-0000-4000-8000-000000000001' and action = 'DELETE_STOCK_TRIP' and after_data->>'request_id' = 'e0000000-0000-4000-8000-000000000601'), 1::bigint, 'Trip deletion audit survives');
select is(
  (private.delete_unused_stock_trip(
    'e0000000-0000-4000-8000-000000000001',
    (select entity_id from public.audit_events where organization_id = 'e0000000-0000-4000-8000-000000000001' and action = 'DELETE_STOCK_TRIP' and after_data->>'request_id' = 'e0000000-0000-4000-8000-000000000601'),
    'e0000000-0000-4000-8000-000000000101', 'Wrong trip date', 'e0000000-0000-4000-8000-000000000601'
  )->>'idempotent_replay')::boolean,
  true,
  'replayed Trip deletion is idempotent'
);
select is((select count(*) from public.audit_events where organization_id = 'e0000000-0000-4000-8000-000000000001' and action = 'DELETE_STOCK_TRIP'), 1::bigint, 'idempotent replay creates no duplicate audit');

select api.transfer_warehouse_to_salesman(
  'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000103', '2026-10-02',
  jsonb_build_array(jsonb_build_object(
    'inventory_lot_id', (select il.id from public.inventory_lots il join public.stock_trip_lines stl on stl.id = il.stock_trip_line_id where stl.plant_product_id = 'e0000000-0000-4000-8000-000000000402'),
    'quantity_kg', 5
  )),
  'e0000000-0000-4000-8000-000000000503'
);
select throws_ok(
  $$select private.delete_unused_stock_trip(
    'e0000000-0000-4000-8000-000000000001',
    (select id from public.stock_trips where client_request_id = 'e0000000-0000-4000-8000-000000000502'),
    'e0000000-0000-4000-8000-000000000101', 'Encoding mistake', 'e0000000-0000-4000-8000-000000000602'
  )$$,
  '55000', null, 'used Trip deletion is blocked after transfer'
);
select is((select count(*) from public.stock_trips where client_request_id = 'e0000000-0000-4000-8000-000000000502'), 1::bigint, 'blocked Trip remains intact');
select throws_ok(
  $$select private.delete_unused_stock_trip(
    'e0000000-0000-4000-8000-000000000001',
    (select id from public.stock_trips where client_request_id = 'e0000000-0000-4000-8000-000000000502'),
    'e0000000-0000-4000-8000-000000000103', 'Encoding mistake', 'e0000000-0000-4000-8000-000000000603'
  )$$,
  '42501', null, 'Salesman actor is denied by backend role validation'
);
select throws_ok(
  $$select private.delete_unused_stock_trip(
    'e0000000-0000-4000-8000-000000000001',
    (select id from public.stock_trips where client_request_id = 'e0000000-0000-4000-8000-000000000502'),
    'e0000000-0000-4000-8000-000000000102', 'Encoding mistake', 'e0000000-0000-4000-8000-000000000604'
  )$$,
  '42501', null, 'Warehouse actor is denied by backend role validation'
);

select lives_ok(
  $$select private.delete_unused_plant_product(
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000403',
    'e0000000-0000-4000-8000-000000000101', 'Product added by mistake.', 'e0000000-0000-4000-8000-000000000605'
  )$$,
  'unused Plant Product deletion succeeds'
);
select is((select count(*) from public.plant_product_codes where id = 'e0000000-0000-4000-8000-000000000411'), 0::bigint, 'unused Product code is cleaned up');
select is((select count(*) from public.plant_product_class_types where id = 'e0000000-0000-4000-8000-000000000412'), 0::bigint, 'unused class type is cleaned up');
select is((select count(*) from public.products where id = 'e0000000-0000-4000-8000-000000000303'), 1::bigint, 'shared Product master is preserved');
select is((select count(*) from public.plant_products where id = 'e0000000-0000-4000-8000-000000000404'), 1::bigint, 'other Plant configuration is preserved');
select is((select count(*) from public.audit_events where organization_id = 'e0000000-0000-4000-8000-000000000001' and action = 'DELETE_PLANT_PRODUCT'), 1::bigint, 'Product deletion audit survives');
select throws_ok(
  $$select private.delete_unused_plant_product(
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000402',
    'e0000000-0000-4000-8000-000000000101', 'Product added by mistake.', 'e0000000-0000-4000-8000-000000000606'
  )$$,
  '55000', null, 'used Plant Product deletion is blocked'
);
select is((select active from public.plant_products where id = 'e0000000-0000-4000-8000-000000000402'), true, 'used Product remains available for normal deactivation');

set local role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select public.delete_unused_plant_product(
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000404',
    'e0000000-0000-4000-8000-000000000101', 'Bypass attempt', gen_random_uuid()
  )$$,
  '42501', null, 'authenticated browser cannot bypass the Edge Function'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.delete_unused_stock_trip(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'Bypass attempt', gen_random_uuid())$$,
  '42501', null, 'anonymous direct deletion is denied'
);
reset role;

select * from finish(true);
rollback;
