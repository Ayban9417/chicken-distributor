begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000101', 'attendance-owner@test.invalid'),
  ('f0000000-0000-4000-8000-000000000102', 'attendance-sales-a@test.invalid'),
  ('f0000000-0000-4000-8000-000000000103', 'attendance-sales-b@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('f0000000-0000-4000-8000-000000000101', 'Attendance Owner', 'attendance.owner'),
  ('f0000000-0000-4000-8000-000000000102', 'Attendance Sales A', 'attendance.sales.a'),
  ('f0000000-0000-4000-8000-000000000103', 'Attendance Sales B', 'attendance.sales.b');
insert into public.organizations (id, name, slug) values
  ('f0000000-0000-4000-8000-000000000001', 'Attendance Test', 'attendance-test');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000102', 'salesman'),
  ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000103', 'salesman');

select is(
  (select pg_get_function_arguments('public.time_in_now(uuid)'::regprocedure)),
  'p_organization_id uuid',
  'Time In accepts no employee identity or timestamp'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000102';
select lives_ok(
  $$select public.time_in_now('f0000000-0000-4000-8000-000000000001')$$,
  'Salesman can Time In themselves'
);
select is((select count(*) from public.time_entries), 1::bigint, 'Time In creates one attendance entry');
select ok(
  (select abs(extract(epoch from ((work_date + time_in) - timezone('Asia/Manila', clock_timestamp())))) < 5 from public.time_entries),
  'Time In uses the authoritative database clock'
);
select lives_ok(
  $$select public.time_in_now('f0000000-0000-4000-8000-000000000001')$$,
  'duplicate Time In is an idempotent success'
);
select is((select count(*) from public.time_entries), 1::bigint, 'duplicate Time In creates no second entry');
select lives_ok(
  $$select public.time_out_now('f0000000-0000-4000-8000-000000000001')$$,
  'Salesman can Time Out their active entry'
);
select isnt((select time_out from public.time_entries), null::time, 'Time Out completes the active entry');
select lives_ok(
  $$select public.time_out_now('f0000000-0000-4000-8000-000000000001')$$,
  'duplicate Time Out is an idempotent success'
);
select is((select count(*) from public.time_entries), 1::bigint, 'duplicate Time Out creates no entry');

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000103';
select throws_ok(
  $$select public.time_out_now('f0000000-0000-4000-8000-000000000001')$$,
  'P0001', null, 'Time Out without Time In is denied'
);
select throws_ok(
  $$insert into public.time_entries (organization_id, user_id, work_date, time_in) values ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000102', current_date - 1, '01:00')$$,
  '42501', null, 'Salesman cannot create arbitrary attendance for another employee'
);
select results_eq(
  $$update public.time_entries set time_in = '01:00' where user_id = 'f0000000-0000-4000-8000-000000000102' returning 1$$,
  $$select 1 where false$$,
  'Salesman cannot modify a completed DTR'
);

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000101';
select is((select count(*) from public.time_entries), 1::bigint, 'Owner can view Salesman attendance');
select throws_ok(
  $$update public.time_entries set break_minutes = 15 where user_id = 'f0000000-0000-4000-8000-000000000102'$$,
  '22023', null, 'Owner correction requires a reason'
);
select lives_ok(
  $$update public.time_entries set break_minutes = 15, correction_reason = 'Approved route break correction' where user_id = 'f0000000-0000-4000-8000-000000000102'$$,
  'Owner can correct attendance with a reason'
);
select is((select count(*) from public.audit_events where entity_type = 'time_entry' and action = 'corrected'), 1::bigint, 'Owner correction creates an audit event');
select isnt((select total_minutes from public.time_entries), null::integer, 'completed attendance remains payroll-compatible');

select * from finish();
rollback;
