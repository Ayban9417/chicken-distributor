-- Run only against a disposable, fully migrated Supabase database. Never live DEV.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f6000000-0000-4000-8000-000000000101', 'finance-owner@test.invalid'),
  ('f6000000-0000-4000-8000-000000000102', 'finance-agent@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('f6000000-0000-4000-8000-000000000101', 'Finance QA Owner', 'finance.qa.owner'),
  ('f6000000-0000-4000-8000-000000000102', 'Finance QA Agent', 'finance.qa.agent');
insert into public.organizations (id, name, slug) values
  ('f6000000-0000-4000-8000-000000000001', 'Finance Correction QA', 'finance-correction-qa');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000102', 'salesman');
insert into public.customers (id, organization_id, name) values
  ('f6000000-0000-4000-8000-000000000011', 'f6000000-0000-4000-8000-000000000001', 'Finance QA Customer');
insert into public.payments (id, organization_id, payment_number, customer_id,
  salesman_user_id, payment_date, amount, method, verification_status,
  client_request_id, created_by) values
  ('f6000000-0000-4000-8000-000000000061', 'f6000000-0000-4000-8000-000000000001',
   'PAY-QA-F1', 'f6000000-0000-4000-8000-000000000011',
   'f6000000-0000-4000-8000-000000000102', '2026-01-04', 100, 'cash', 'not_required',
   'f6000000-0000-4000-8000-000000000161', 'f6000000-0000-4000-8000-000000000101');
insert into public.expenses (id, organization_id, salesman_user_id, expense_date,
  category, amount, payment_source, approval_status, created_by, client_request_id) values
  ('f6000000-0000-4000-8000-000000000071', 'f6000000-0000-4000-8000-000000000001',
   'f6000000-0000-4000-8000-000000000102', '2026-01-04', 'Fuel', 20, 'cash_collection',
   'approved', 'f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000171'),
  ('f6000000-0000-4000-8000-000000000072', 'f6000000-0000-4000-8000-000000000001',
   'f6000000-0000-4000-8000-000000000102', '2026-01-03', 'Meals', 10, 'personal_cash',
   'pending', 'f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000172');
insert into public.daily_cash_reports (id, organization_id, salesman_user_id, report_date,
  status, cash_collected, gcash_collected, bank_collected, cash_paid_expenses,
  expected_cash_remittance, actual_cash_remittance, difference, source_snapshot,
  client_request_id, locked_at) values
  ('f6000000-0000-4000-8000-000000000081', 'f6000000-0000-4000-8000-000000000001',
   'f6000000-0000-4000-8000-000000000102', '2026-01-04', 'locked', 100, 0, 0,
   20, 80, 80, 0, '{"cash":100,"gcash":0,"bank":0,"cash_paid_expenses":20}',
   'f6000000-0000-4000-8000-000000000181', now());

create temp table qa_finance as select
  '{"expenseDate":"2026-01-04","salesmanUserId":"f6000000-0000-4000-8000-000000000102",
    "category":"Fuel","amount":25,"description":"Corrected fuel receipt",
    "approvalStatus":"approved"}'::jsonb expense_changes,
  '{"actualCashRemittance":75,"explanation":"Reconciled against corrected fuel receipt",
    "reconciliationNotes":"Reviewed cash slip"}'::jsonb dcr_changes;
alter table qa_finance add column expense_preview jsonb;
alter table qa_finance add column dcr_preview jsonb;
grant select on qa_finance to authenticated, service_role;
update qa_finance set expense_preview = private.inspect_expense_correction(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000071', expense_changes);
select is((select expense_preview->>'eligible' from qa_finance), 'true', 'locked Expense can be corrected with linked amendment');
select is((select (expense_preview->'dcrAmendments'->0->'after'->>'expectedCashRemittance')::numeric from qa_finance),
  75::numeric, 'corrected Expense reduces expected cash by five');
select is((private.inspect_expense_correction('f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000071',
  jsonb_set((select expense_changes from qa_finance), '{expenseDate}', '"2026-01-03"'::jsonb)
  )->>'eligible'), 'false', 'moving locked Expense date is blocked');
select is((private.inspect_expense_correction('f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000072',
  jsonb_set((select expense_changes from qa_finance), '{expenseDate}', '"2026-01-03"'::jsonb)
  )->>'eligible'), 'true', 'unlocked Expense metadata and approval are eligible');

set local role authenticated;
set local request.jwt.claim.sub = 'f6000000-0000-4000-8000-000000000102';
select throws_ok($$select public.preview_expense_correction(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000071',
  (select expense_changes from qa_finance))$$, '42501', null, 'Salesman cannot preview Expense correction');
select throws_ok($$select public.preview_dcr_amendment(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000081',
  (select dcr_changes from qa_finance))$$, '42501', null, 'Salesman cannot preview DCR amendment');
set local request.jwt.claim.sub = 'f6000000-0000-4000-8000-000000000101';
select is((public.preview_expense_correction(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000071',
  (select expense_changes from qa_finance)))->>'eligible'), 'true', 'Owner can preview Expense correction');
reset role;

set local role service_role;
select throws_ok($$select public.apply_expense_correction(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000071',
  'f6000000-0000-4000-8000-000000000102', 'Correct QA fuel expense',
  'f6000000-0000-4000-8000-000000000201', (select expense_preview->>'versionToken' from qa_finance),
  (select expense_changes from qa_finance))$$, '42501', null, 'Salesman cannot apply Expense correction');
select lives_ok($$select public.apply_expense_correction(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000071',
  'f6000000-0000-4000-8000-000000000101', 'Correct QA fuel expense',
  'f6000000-0000-4000-8000-000000000201', (select expense_preview->>'versionToken' from qa_finance),
  (select expense_changes from qa_finance))$$, 'Expense and linked amendment commit together');
select is((select amount from public.expenses where id = 'f6000000-0000-4000-8000-000000000071'),
  25::numeric, 'Expense ID preserved with corrected amount');
select is((select expected_cash_remittance from public.daily_cash_reports
  where id = 'f6000000-0000-4000-8000-000000000081'), 80::numeric, 'original DCR remains unchanged');
select is((select (proposed_values->>'expectedCashRemittance')::numeric from public.dcr_amendments
  where dcr_id = 'f6000000-0000-4000-8000-000000000081'), 75::numeric,
  'linked amendment records current expected cash');
select is((select count(*) from public.transaction_corrections where module = 'expense'),
  1::bigint, 'Expense edit history records correction');
select throws_ok($$select public.apply_expense_correction(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000071',
  'f6000000-0000-4000-8000-000000000101', 'Correct QA fuel expense',
  'f6000000-0000-4000-8000-000000000201', (select expense_preview->>'versionToken' from qa_finance),
  (select expense_changes from qa_finance))$$, '40001', null, 'stale Expense preview is rejected');
reset role;

update qa_finance set dcr_preview = private.inspect_dcr_amendment(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000081', dcr_changes);
select is((select dcr_preview->>'eligible' from qa_finance), 'true', 'DCR can reconcile actual cash after source correction');
select is((select (dcr_preview->'proposedValues'->>'difference')::numeric from qa_finance),
  0::numeric, 'DCR amendment clears the five peso discrepancy');
set local role service_role;
select lives_ok($$select public.apply_dcr_amendment(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000081',
  'f6000000-0000-4000-8000-000000000101', 'Reconcile corrected QA cash',
  'f6000000-0000-4000-8000-000000000202', (select dcr_preview->>'versionToken' from qa_finance),
  (select dcr_changes from qa_finance))$$, 'DCR amendment commits');
select is((select count(*) from public.dcr_amendments where dcr_id = 'f6000000-0000-4000-8000-000000000081'),
  2::bigint, 'source correction and Admin amendment are both retained');
select is((select count(*) from public.discrepancies where related_entity_id =
  'f6000000-0000-4000-8000-000000000081' and status = 'open'), 0::bigint,
  'reconciled cash difference has no open discrepancy');
select throws_ok($$update public.dcr_amendments set reason = 'Tamper with history'
  where dcr_id = 'f6000000-0000-4000-8000-000000000081'$$,
  '42501', null, 'amendment history is immutable');
select throws_ok($$select public.apply_dcr_amendment(
  'f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000081',
  'f6000000-0000-4000-8000-000000000101', 'Reconcile corrected QA cash',
  'f6000000-0000-4000-8000-000000000202', (select dcr_preview->>'versionToken' from qa_finance),
  (select dcr_changes from qa_finance))$$, '40001', null, 'concurrent stale DCR amendment is rejected');
reset role;
select * from finish();
rollback;
