-- Disposable, fully migrated Supabase only. This script rolls back its own fixtures.
-- Edge/Auth password verification is tested separately in an isolated E2E run.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id,email) values
  ('f7000000-0000-4000-8000-000000000101','phase7-owner-a@test.invalid'),
  ('f7000000-0000-4000-8000-000000000102','phase7-owner-b@test.invalid'),
  ('f7000000-0000-4000-8000-000000000103','phase7-salesman@test.invalid');
insert into public.profiles (id,full_name,username) values
  ('f7000000-0000-4000-8000-000000000101','Phase 7 Owner A','phase7.owner.a'),
  ('f7000000-0000-4000-8000-000000000102','Phase 7 Owner B','phase7.owner.b'),
  ('f7000000-0000-4000-8000-000000000103','Phase 7 Salesman','phase7.salesman');
insert into public.organizations (id,name,slug) values
  ('f7000000-0000-4000-8000-000000000001','Phase 7 QA','phase7-qa');
insert into public.organization_memberships (organization_id,user_id,role) values
  ('f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000101','owner_admin'),
  ('f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000102','owner_admin'),
  ('f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000103','salesman');
insert into public.time_entries (id,organization_id,user_id,work_date,time_in,time_out,break_minutes)
values ('f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000103','2026-01-05','08:00','17:00',60);
insert into public.payroll_periods (id,organization_id,period_start,period_end,status,created_by)
values ('f7000000-0000-4000-8000-000000000021','f7000000-0000-4000-8000-000000000001',
  '2026-01-01','2026-01-15','draft','f7000000-0000-4000-8000-000000000101');
insert into public.payroll_entries (id,payroll_period_id,user_id,hourly_rate,overtime_rate,
  base_pay,regular_minutes,overtime_minutes,overtime_pay,allowances,deductions,gross_pay,net_pay)
values ('f7000000-0000-4000-8000-000000000022','f7000000-0000-4000-8000-000000000021',
  'f7000000-0000-4000-8000-000000000103',100,125,800,480,0,0,0,0,800,800);
insert into public.time_entries (id,organization_id,user_id,work_date,time_in,time_out,break_minutes)
values ('f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000103','2026-02-01','08:00','17:00',60);
insert into public.trucks (id,organization_id,unit_name,plate_number,make_model,current_mileage)
values ('f7000000-0000-4000-8000-000000000031','f7000000-0000-4000-8000-000000000001',
  'QA Truck','QA-700','Test Unit',1000);
insert into public.truck_renewals (id,truck_id,renewal_date,next_renewal_date,created_by)
values ('f7000000-0000-4000-8000-000000000032','f7000000-0000-4000-8000-000000000031',
  '2026-01-10','2026-04-10','f7000000-0000-4000-8000-000000000101');
insert into public.truck_renewals (id,truck_id,renewal_date,next_renewal_date,created_by)
values ('f7000000-0000-4000-8000-000000000034','f7000000-0000-4000-8000-000000000031',
  '2026-05-10','2026-08-10','f7000000-0000-4000-8000-000000000101');
insert into public.truck_maintenance (id,truck_id,maintenance_type,service_date,mileage,created_by)
values ('f7000000-0000-4000-8000-000000000033','f7000000-0000-4000-8000-000000000031',
  'Oil Change','2026-01-11',1100,'f7000000-0000-4000-8000-000000000101');
select is((select current_mileage from public.trucks where id='f7000000-0000-4000-8000-000000000031'),
  1100::numeric,'new maintenance and truck mileage commit together');

create temp table qa7 as select
  '{"workDate":"2026-01-05","timeIn":"09:00","timeOut":"17:00","breakMinutes":60,"attendanceStatus":"late","attendanceNotes":"QA shift"}'::jsonb dtr_changes,
  '{"hourlyRate":120,"overtimeHours":0,"overtimeRate":125,"allowances":0,"deductions":0,"notes":"QA rate"}'::jsonb pay_changes,
  '{"unitName":"QA Truck","plateNumber":"QA-700","makeModel":"Test Unit","mileage":1200,"ltoExpiry":null,"active":true}'::jsonb truck_changes;
alter table qa7 add column dtr_version text;
alter table qa7 add column pay_version text;
alter table qa7 add column truck_version text;
grant select on qa7 to authenticated,service_role;
update qa7 set dtr_version=(private.inspect_dtr_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011',dtr_changes))->>'versionToken',
  pay_version=(private.inspect_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022','entry',pay_changes))->>'versionToken',
  truck_version=(private.inspect_truck_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000031','truck',truck_changes))->>'versionToken';

set local role authenticated;
set local request.jwt.claim.sub='f7000000-0000-4000-8000-000000000103';
select throws_ok($$select public.preview_dtr_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011',
  (select dtr_changes from qa7))$$,'42501',null,'Salesman cannot preview protected DTR edit');
select throws_ok($$select public.preview_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022',
  'entry',(select pay_changes from qa7))$$,'42501',null,'Salesman cannot preview Payroll edit');
set local request.jwt.claim.sub='f7000000-0000-4000-8000-000000000101';
select is((public.preview_dtr_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011',
  (select dtr_changes from qa7)))->>'eligible'),'true','Owner can preview DTR correction');
reset role;

select is((private.inspect_dtr_correction('f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000011',
  '{"workDate":"2026-02-01","timeIn":"09:00","timeOut":"17:00","breakMinutes":60,"attendanceStatus":"late","attendanceNotes":"Overlap"}'::jsonb)->>'eligible'),
  'false','DTR cannot move onto another attendance date for the same employee');
select throws_ok($$select private.inspect_dtr_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011',
  '{"workDate":"2026-01-05","timeIn":"18:00","timeOut":"17:00","breakMinutes":0,"attendanceStatus":"present","attendanceNotes":"Invalid"}'::jsonb)$$,
  '22023',null,'invalid DTR time range is rejected');
select is((private.inspect_truck_correction('f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000032','renewal',
  '{"date":"2026-05-10","notes":"Duplicate"}'::jsonb)->>'eligible'),
  'false','duplicate Truck renewal is blocked');

set local role service_role;
select throws_ok($$select public.apply_dtr_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011',
  'f7000000-0000-4000-8000-000000000103','Correct QA shift',
  'f7000000-0000-4000-8000-000000000201',(select dtr_version from qa7),
  (select dtr_changes from qa7))$$,'42501',null,'Salesman cannot apply protected correction');
select lives_ok($$select public.apply_dtr_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011',
  'f7000000-0000-4000-8000-000000000101','Correct QA shift',
  'f7000000-0000-4000-8000-000000000201',(select dtr_version from qa7),
  (select dtr_changes from qa7))$$,'DTR correction commits');
select is((select total_minutes from public.time_entries where id='f7000000-0000-4000-8000-000000000011'),
  420,'corrected shift has 420 paid minutes');
select is((select base_pay from public.payroll_entries where id='f7000000-0000-4000-8000-000000000022'),
  700::numeric,'draft payroll recalculates from corrected DTR');
select throws_ok($$select public.apply_dtr_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011',
  'f7000000-0000-4000-8000-000000000101','Correct QA shift',
  'f7000000-0000-4000-8000-000000000201',(select dtr_version from qa7),
  (select dtr_changes from qa7))$$,'40001',null,'stale replay cannot change attendance');
select is((select count(*) from public.transaction_corrections where module='dtr'
  and organization_id='f7000000-0000-4000-8000-000000000001'),
  1::bigint,'rejected replay leaves exactly one DTR audit record');
update qa7 set pay_version=(private.inspect_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022','entry',pay_changes))->>'versionToken';
select lives_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022',
  'entry','f7000000-0000-4000-8000-000000000101','Correct QA hourly rate',
  'f7000000-0000-4000-8000-000000000202',(select pay_version from qa7),
  (select pay_changes from qa7))$$,'draft payroll edit commits');
select is((select net_pay from public.payroll_entries where id='f7000000-0000-4000-8000-000000000022'),
  840::numeric,'draft payroll totals reconcile');
select is((private.inspect_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022',
  'adjustment','{"grossDelta":10,"netDelta":10,"notes":"Premature"}'::jsonb)->>'eligible'),
  'false','draft payroll cannot receive a finalized adjustment');
select lives_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000021',
  'period','f7000000-0000-4000-8000-000000000101','Review QA payroll period',
  'f7000000-0000-4000-8000-000000000204',
  (private.inspect_payroll_correction('f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000021','period','{"status":"reviewed"}'::jsonb)->>'versionToken'),
  '{"status":"reviewed"}'::jsonb)$$,'payroll period finalizes atomically to Reviewed');
select is((select count(*) from public.payroll_entries where payroll_period_id='f7000000-0000-4000-8000-000000000021'
  and status='reviewed'),1::bigint,'entry status advanced with period');
select is((private.inspect_dtr_correction('f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000011',
  '{"workDate":"2026-01-05","timeIn":"08:30","timeOut":"17:00","breakMinutes":60,"attendanceStatus":"late","attendanceNotes":"Reviewed"}'::jsonb)->>'eligible'),
  'false','reviewed payroll blocks direct attendance rewrite');
select lives_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022',
  'adjustment','f7000000-0000-4000-8000-000000000101','Request QA payroll supplement',
  'f7000000-0000-4000-8000-000000000205',
  (private.inspect_payroll_correction('f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000022','adjustment',
    '{"grossDelta":25,"netDelta":25,"notes":"QA supplement"}'::jsonb)->>'versionToken'),
  '{"grossDelta":25,"netDelta":25,"notes":"QA supplement"}'::jsonb)$$,
  'reviewed payroll creates an append-only adjustment request');
select is((select net_pay from public.payroll_entries where id='f7000000-0000-4000-8000-000000000022'),
  840::numeric,'original reviewed payroll net remains immutable');
select lives_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001',
  (select id from public.payroll_adjustment_requests where payroll_entry_id='f7000000-0000-4000-8000-000000000022'),
  'approval','f7000000-0000-4000-8000-000000000101','Approve QA reviewed supplement',
  'f7000000-0000-4000-8000-000000000206',
  (private.inspect_payroll_correction('f7000000-0000-4000-8000-000000000001',
    (select id from public.payroll_adjustment_requests where payroll_entry_id='f7000000-0000-4000-8000-000000000022'),
    'approval','{}'::jsonb)->>'versionToken'),'{}'::jsonb)$$,
  'reviewed supplement is approved without rewriting original');
select lives_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000021',
  'period','f7000000-0000-4000-8000-000000000101','Mark QA payroll paid',
  'f7000000-0000-4000-8000-000000000207',
  (private.inspect_payroll_correction('f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000021','period','{"status":"paid"}'::jsonb)->>'versionToken'),
  '{"status":"paid"}'::jsonb)$$,'payroll period advances atomically to Paid');
select lives_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022',
  'adjustment','f7000000-0000-4000-8000-000000000101','Request QA paid supplement',
  'f7000000-0000-4000-8000-000000000208',
  (private.inspect_payroll_correction('f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000022','adjustment',
    '{"grossDelta":15,"netDelta":15,"notes":"Paid supplement"}'::jsonb)->>'versionToken'),
  '{"grossDelta":15,"netDelta":15,"notes":"Paid supplement"}'::jsonb)$$,
  'paid payroll supplement is pending approval');
select throws_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001',
  (select id from public.payroll_adjustment_requests where period_status='paid'),
  'approval','f7000000-0000-4000-8000-000000000101','Self-approve paid supplement',
  'f7000000-0000-4000-8000-000000000209',
  (private.inspect_payroll_correction('f7000000-0000-4000-8000-000000000001',
    (select id from public.payroll_adjustment_requests where period_status='paid'),
    'approval','{}'::jsonb)->>'versionToken'),'{}'::jsonb)$$,
  '42501',null,'requester cannot approve their own paid adjustment');
select lives_ok($$select public.apply_payroll_correction(
  'f7000000-0000-4000-8000-000000000001',
  (select id from public.payroll_adjustment_requests where period_status='paid'),
  'approval','f7000000-0000-4000-8000-000000000102','Second Admin approved paid supplement',
  'f7000000-0000-4000-8000-000000000210',
  (private.inspect_payroll_correction('f7000000-0000-4000-8000-000000000001',
    (select id from public.payroll_adjustment_requests where period_status='paid'),
    'approval','{}'::jsonb)->>'versionToken'),'{}'::jsonb)$$,
  'different Admin can approve paid payroll adjustment');
select is((select count(*) from public.payroll_adjustment_approvals),2::bigint,
  'both adjustment approvals have append-only evidence');
select lives_ok($$select public.apply_truck_correction(
  'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000031',
  'truck','f7000000-0000-4000-8000-000000000101','Correct QA odometer',
  'f7000000-0000-4000-8000-000000000203',(select truck_version from qa7),
  (select truck_changes from qa7))$$,'Truck correction commits');
select is((select current_mileage from public.trucks where id='f7000000-0000-4000-8000-000000000031'),
  1200::numeric,'Truck identity stays with corrected mileage');
select is((select count(*) from public.transaction_corrections where organization_id='f7000000-0000-4000-8000-000000000001'),
  9::bigint,'DTR, payroll, adjustment and Truck actions have ledger evidence');
select throws_ok($$update public.transaction_corrections set reason='tampered'
  where organization_id='f7000000-0000-4000-8000-000000000001'$$,
  '55000',null,'correction history is immutable');
reset role;
select * from finish();
rollback;
