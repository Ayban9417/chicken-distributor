-- Run only on a disposable migrated Supabase database. Never run on live DEV.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f5000000-0000-4000-8000-000000000101', 'payment-owner@test.invalid'),
  ('f5000000-0000-4000-8000-000000000102', 'payment-agent@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('f5000000-0000-4000-8000-000000000101', 'QA Owner', 'payment.qa.owner'),
  ('f5000000-0000-4000-8000-000000000102', 'QA Agent', 'payment.qa.agent');
insert into public.organizations (id, name, slug) values
  ('f5000000-0000-4000-8000-000000000001', 'Payment Correction QA', 'payment-correction-qa');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000102', 'salesman');
insert into public.customers (id, organization_id, name) values
  ('f5000000-0000-4000-8000-000000000011', 'f5000000-0000-4000-8000-000000000001', 'QA Customer A'),
  ('f5000000-0000-4000-8000-000000000012', 'f5000000-0000-4000-8000-000000000001', 'QA Customer B');
insert into public.sales (id, organization_id, trust_receipt_number, customer_id,
  salesman_user_id, sale_date, subtotal, gross_sales, net_sales, total_cogs,
  client_request_id, created_by) values
  ('f5000000-0000-4000-8000-000000000041', 'f5000000-0000-4000-8000-000000000001',
   'TR-QA-P1', 'f5000000-0000-4000-8000-000000000011',
   'f5000000-0000-4000-8000-000000000102', '2026-01-02', 150, 150, 150, 0,
   'f5000000-0000-4000-8000-000000000141', 'f5000000-0000-4000-8000-000000000101'),
  ('f5000000-0000-4000-8000-000000000042', 'f5000000-0000-4000-8000-000000000001',
   'TR-QA-P2', 'f5000000-0000-4000-8000-000000000011',
   'f5000000-0000-4000-8000-000000000102', '2026-01-03', 100, 100, 100, 0,
   'f5000000-0000-4000-8000-000000000142', 'f5000000-0000-4000-8000-000000000101'),
  ('f5000000-0000-4000-8000-000000000043', 'f5000000-0000-4000-8000-000000000001',
   'TR-QA-P3', 'f5000000-0000-4000-8000-000000000012',
   'f5000000-0000-4000-8000-000000000102', '2026-01-03', 100, 100, 100, 0,
   'f5000000-0000-4000-8000-000000000143', 'f5000000-0000-4000-8000-000000000101');
insert into public.payments (id, organization_id, payment_number, customer_id,
  salesman_user_id, payment_date, amount, method, verification_status,
  client_request_id, created_by) values
  ('f5000000-0000-4000-8000-000000000061', 'f5000000-0000-4000-8000-000000000001',
   'PAY-QA-1', 'f5000000-0000-4000-8000-000000000011',
   'f5000000-0000-4000-8000-000000000102', '2026-01-04', 100, 'cash', 'not_required',
   'f5000000-0000-4000-8000-000000000161', 'f5000000-0000-4000-8000-000000000101');
insert into public.payment_allocations (id, payment_id, sale_id, amount) values
  ('f5000000-0000-4000-8000-000000000062', 'f5000000-0000-4000-8000-000000000061',
   'f5000000-0000-4000-8000-000000000041', 60),
  ('f5000000-0000-4000-8000-000000000063', 'f5000000-0000-4000-8000-000000000061',
   'f5000000-0000-4000-8000-000000000042', 40);
select is((select outstanding_balance from public.customer_balances
  where customer_id = 'f5000000-0000-4000-8000-000000000011'), 150::numeric,
  'starting Customer A balance reconciles');

create temp table qa_payment as select
  '{"paymentDate":"2026-01-04","customerId":"f5000000-0000-4000-8000-000000000011",
    "amount":120,"method":"gcash","referenceNumber":"GC-QA-1","bankName":"",
    "notes":"Corrected QA Payment","allocationMode":"fifo","allocations":[]}'::jsonb changes;
alter table qa_payment add column preview jsonb;
grant select on qa_payment to authenticated, service_role;
update qa_payment set preview = private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061', changes);
select is((select preview->>'eligible' from qa_payment), 'true', 'unverified Payment can be previewed');
select is((select (preview->'proposedValues'->'allocations'->0->>'amount')::numeric from qa_payment),
  120::numeric, 'FIFO uses the oldest eligible Sale first');
select is((select (preview->'expectedFinancialChanges'->1->>'after')::numeric from qa_payment),
  130::numeric, 'Customer balance preview includes changed Payment amount');
select is((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set((select changes from qa_payment), '{amount}', '80'::jsonb)
  )->>'eligible'), 'true', 'Payment amount decrease can be reviewed');
select is((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set((select changes from qa_payment), '{customerId}',
    '"f5000000-0000-4000-8000-000000000012"'::jsonb)
  )->>'eligible'), 'false', 'Customer reassignment cannot overpay the new Customer');
select is((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set(jsonb_set((select changes from qa_payment), '{customerId}',
    '"f5000000-0000-4000-8000-000000000012"'::jsonb), '{amount}', '90'::jsonb)
  )->>'eligible'), 'true', 'Customer reassignment is eligible when the new Customer has capacity');
select ok((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set((select changes from qa_payment), '{referenceNumber}', '""'::jsonb)
  )->>'blockedReasons') like '%GCash requires a reference%', 'GCash reference is required');
select ok((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set(jsonb_set((select changes from qa_payment), '{method}', '"bank"'::jsonb),
    '{bankName}', '""'::jsonb)
  )->>'blockedReasons') like '%Bank Payment requires a bank name%', 'Bank name is required');
select is((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set(jsonb_set((select changes from qa_payment), '{method}', '"bank"'::jsonb),
    '{bankName}', '"BDO"'::jsonb)
  )->>'eligible'), 'true', 'unverified Cash to Bank method correction can be reviewed');
select ok((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set((select changes from qa_payment), '{amount}', '1000'::jsonb)
  )->>'blockedReasons') like '%exceeds eligible Customer open balances%', 'overpayment is rejected');
select ok((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set(jsonb_set((select changes from qa_payment), '{allocationMode}', '"manual"'::jsonb),
    '{allocations}', '[{"saleId":"f5000000-0000-4000-8000-000000000041","amount":120},
      {"saleId":"f5000000-0000-4000-8000-000000000041","amount":1}]'::jsonb)
  )->>'blockedReasons') like '%Duplicate Sale allocations%', 'duplicate manual allocation is rejected');

set local role authenticated;
set local request.jwt.claim.sub = 'f5000000-0000-4000-8000-000000000102';
select throws_ok($$select public.preview_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  (select changes from qa_payment))$$, '42501', null, 'Salesman cannot preview Payment correction');
set local request.jwt.claim.sub = 'f5000000-0000-4000-8000-000000000101';
select is((public.preview_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  (select changes from qa_payment))->>'eligible'), 'true', 'Owner can preview Payment correction');
reset role;

update qa_payment set changes = jsonb_set(jsonb_set(changes, '{allocationMode}', '"manual"'::jsonb),
  '{allocations}', '[{"saleId":"f5000000-0000-4000-8000-000000000041","amount":70},
    {"saleId":"f5000000-0000-4000-8000-000000000042","amount":50}]'::jsonb);
update qa_payment set preview = private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061', changes);
select is((select preview->>'eligible' from qa_payment), 'true', 'explicit manual allocation is eligible');
set local role service_role;
select throws_ok($$select public.apply_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  'f5000000-0000-4000-8000-000000000102', 'Correct QA Payment details',
  'f5000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_payment),
  (select changes from qa_payment))$$, '42501', null, 'Salesman cannot apply Payment correction');
select lives_ok($$select public.apply_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  'f5000000-0000-4000-8000-000000000101', 'Correct QA Payment details',
  'f5000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_payment),
  (select changes from qa_payment))$$, 'eligible manual correction commits');
reset role;
select is((select amount from public.payments where id = 'f5000000-0000-4000-8000-000000000061'),
  120::numeric, 'Payment ID and new amount reconcile');
select is((select amount from public.payment_allocations where sale_id = 'f5000000-0000-4000-8000-000000000041'),
  70::numeric, 'first manual allocation reconciles');
select is((select amount from public.payment_allocations where sale_id = 'f5000000-0000-4000-8000-000000000042'),
  50::numeric, 'second manual allocation reconciles');
select is((select outstanding_balance from public.customer_balances
  where customer_id = 'f5000000-0000-4000-8000-000000000011'), 130::numeric,
  'Customer balance and collectibles reconcile');
select is((select status from public.sales where id = 'f5000000-0000-4000-8000-000000000041'),
  'partially_paid', 'Sale status refreshes after partial allocation');
select is((select count(*) from public.transaction_corrections where module = 'payment'), 1::bigint,
  'Payment correction appears in immutable edit history');
select is((select count(*) from public.audit_events where entity_id = 'f5000000-0000-4000-8000-000000000061'
  and action = 'CORRECT_PAYMENT'), 1::bigint, 'Payment correction audit event is written');
select throws_ok($$select public.apply_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  'f5000000-0000-4000-8000-000000000101', 'Correct QA Payment details',
  'f5000000-0000-4000-8000-000000000299', (select preview->>'versionToken' from qa_payment),
  (select changes from qa_payment))$$, '55000', null, 'concurrent stale version is rejected');
select throws_ok($$select public.apply_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  'f5000000-0000-4000-8000-000000000101', 'Correct QA Payment details',
  'f5000000-0000-4000-8000-000000000201',
  (select private.inspect_payment_correction('f5000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000061', changes)->>'versionToken' from qa_payment),
  (select changes from qa_payment))$$, '23505', null, 'duplicate request ID is rejected');
select throws_ok($$update public.transaction_corrections set reason = 'Tampered QA reason'
  where transaction_id = 'f5000000-0000-4000-8000-000000000061'$$,
  '55000', null, 'correction history is immutable');
reset role;

update qa_payment set changes = jsonb_set(jsonb_set(changes, '{allocationMode}', '"fifo"'::jsonb),
  '{allocations}', '[]'::jsonb);
update qa_payment set changes = jsonb_set(changes, '{amount}', '1000'::jsonb);
select throws_ok($$select public.apply_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  'f5000000-0000-4000-8000-000000000101', 'Increase beyond open balances',
  'f5000000-0000-4000-8000-000000000202',
  (select private.inspect_payment_correction('f5000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000061', changes)->>'versionToken' from qa_payment),
  (select changes from qa_payment))$$, '55000', null, 'ineligible Payment correction rolls back');
select is((select count(*) from public.transaction_corrections where module = 'payment'), 1::bigint,
  'failed correction leaves no new audit entry');
reset role;

select is((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  jsonb_set(jsonb_set(jsonb_set((select changes from qa_payment), '{amount}', '120'::jsonb),
    '{method}', '"bank"'::jsonb), '{bankName}', '"BPI"'::jsonb)
  )->>'eligible'), 'true', 'pending GCash to Bank correction can be reviewed');
update public.payments set method = 'gcash', reference_number = 'GC-VERIFIED-QA',
  verification_status = 'verified' where id = 'f5000000-0000-4000-8000-000000000061';
select ok((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  (select changes from qa_payment))->>'blockedReasons') like '%Finalized or verified Payment%',
  'verified GCash Payment is protected');
update public.payments set method = 'bank', bank_name = 'BDO', verification_status = 'verified'
  where id = 'f5000000-0000-4000-8000-000000000061';
select ok((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  (select changes from qa_payment))->>'blockedReasons') like '%Finalized or verified Payment%',
  'verified Bank Payment is protected');
update public.payments set method = 'cash', bank_name = null, reference_number = null,
  verification_status = 'not_required' where id = 'f5000000-0000-4000-8000-000000000061';
insert into public.daily_cash_reports (organization_id, salesman_user_id, report_date,
  cash_collected, gcash_collected, bank_collected, cash_paid_expenses,
  expected_cash_remittance, actual_cash_remittance, difference, source_snapshot,
  client_request_id) values
  ('f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000102',
   '2026-01-04', 0, 0, 0, 0, 0, 0, 0, '{}'::jsonb,
   'f5000000-0000-4000-8000-000000000191');
select ok((private.inspect_payment_correction(
  'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000061',
  (select changes from qa_payment))->>'blockedReasons') like '%submitted DCR%',
  'submitted DCR blocks direct Payment correction');
select * from finish();
rollback;
