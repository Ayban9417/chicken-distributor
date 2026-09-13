begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000000101', 'rls-owner@test.invalid'),
  ('c0000000-0000-4000-8000-000000000102', 'rls-warehouse@test.invalid'),
  ('c0000000-0000-4000-8000-000000000103', 'rls-sales-one@test.invalid'),
  ('c0000000-0000-4000-8000-000000000104', 'rls-sales-two@test.invalid'),
  ('c0000000-0000-4000-8000-000000000105', 'rls-cashier@test.invalid'),
  ('c0000000-0000-4000-8000-000000000106', 'rls-outsider@test.invalid');
insert into public.profiles (id, full_name) values
  ('c0000000-0000-4000-8000-000000000101', 'RLS Owner'),
  ('c0000000-0000-4000-8000-000000000102', 'RLS Warehouse'),
  ('c0000000-0000-4000-8000-000000000103', 'RLS Sales One'),
  ('c0000000-0000-4000-8000-000000000104', 'RLS Sales Two'),
  ('c0000000-0000-4000-8000-000000000105', 'RLS Cashier'),
  ('c0000000-0000-4000-8000-000000000106', 'RLS Outsider');
insert into public.organizations (id, name, slug) values
  ('c0000000-0000-4000-8000-000000000001', 'RLS Organization A', 'rls-organization-a'),
  ('c0000000-0000-4000-8000-000000000002', 'RLS Organization B', 'rls-organization-b');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000102', 'warehouse'),
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000103', 'salesman'),
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000104', 'salesman'),
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000105', 'cashier'),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000106', 'owner_admin');
insert into public.plants (id, organization_id, name, short_code) values
  ('c0000000-0000-4000-8000-000000000201', 'c0000000-0000-4000-8000-000000000001', 'RLS Plant A', 'RLSA'),
  ('c0000000-0000-4000-8000-000000000202', 'c0000000-0000-4000-8000-000000000002', 'RLS Plant B', 'RLSB');
insert into public.payroll_periods (id, organization_id, period_start, period_end, created_by)
values ('c0000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-15', 'c0000000-0000-4000-8000-000000000101');
insert into public.payroll_entries (
  payroll_period_id, user_id, base_pay, gross_pay, net_pay
) values (
  'c0000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000103', 1000, 1000, 1000
);

set local role anon;
select throws_ok(
  $$select * from public.organizations$$,
  '42501', null, 'anonymous role cannot read organizations'
);
select throws_ok(
  $$select api.create_sale(
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), current_date,
    'ANON-DENIED', '[]', gen_random_uuid()
  )$$,
  '42501', null, 'anonymous role cannot execute Sale RPC'
);

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000103';
select results_eq(
  $$update public.plants set name = 'Unauthorized' where id = 'c0000000-0000-4000-8000-000000000201' returning 1$$,
  $$select 1 where false$$,
  'Salesman cannot edit Plant configuration'
);
select throws_ok(
  $$insert into public.inventory_movements (
    organization_id, inventory_lot_id, movement_type, quantity_kg,
    from_location_type, to_location_type, reference_type, reference_id,
    reference_line_id, effective_date, created_by
  ) values (
    'c0000000-0000-4000-8000-000000000001', gen_random_uuid(), 'adjustment_in', 1,
    'adjustment', 'warehouse', 'test', gen_random_uuid(), gen_random_uuid(), current_date,
    'c0000000-0000-4000-8000-000000000103'
  )$$,
  '42501', null, 'Salesman cannot insert arbitrary inventory movements'
);
select throws_ok(
  $$update public.inventory_movements set quantity_kg = quantity_kg + 1 where from_salesman_user_id = 'c0000000-0000-4000-8000-000000000104'$$,
  '42501', null, 'Salesman cannot mutate another Salesman inventory movement'
);
select is((select count(*) from public.organizations where id = 'c0000000-0000-4000-8000-000000000002'), 0::bigint, 'Salesman cannot read another organization');

set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000102';
select is((select count(*) from public.payroll_entries), 0::bigint, 'Warehouse cannot read payroll entries');
select throws_ok(
  $$select api.create_sale(
    'c0000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'c0000000-0000-4000-8000-000000000103', current_date, 'RLS-DENIED', '[]', gen_random_uuid()
  )$$,
  '42501', null, 'Warehouse cannot execute a Sale for a Salesman'
);

set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000105';
select results_eq(
  $$update public.plants set name = 'Cashier Unauthorized' where id = 'c0000000-0000-4000-8000-000000000201' returning 1$$,
  $$select 1 where false$$,
  'Cashier cannot edit Plant configuration'
);

set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000101';
select is((select count(*) from public.organizations where id = 'c0000000-0000-4000-8000-000000000001'), 1::bigint, 'Owner can read own organization');

select * from finish();
rollback;
