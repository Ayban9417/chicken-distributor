begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000101', 'correction-owner@test.invalid'),
  ('f1000000-0000-4000-8000-000000000102', 'correction-salesman@test.invalid'),
  ('f1000000-0000-4000-8000-000000000103', 'correction-other-owner@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('f1000000-0000-4000-8000-000000000101', 'Correction Owner', 'correction.owner'),
  ('f1000000-0000-4000-8000-000000000102', 'Correction Salesman', 'correction.salesman'),
  ('f1000000-0000-4000-8000-000000000103', 'Other Owner', 'correction.other');
insert into public.organizations (id, name, slug) values
  ('f1000000-0000-4000-8000-000000000001', 'Correction Test A', 'correction-test-a'),
  ('f1000000-0000-4000-8000-000000000002', 'Correction Test B', 'correction-test-b');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000102', 'salesman'),
  ('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000103', 'owner_admin');

select lives_ok(
  $$select private.assert_correction_request(
    'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000101',
    'Correct the recorded date', 'f1000000-0000-4000-8000-000000000201', 'version-a', 'version-a'
  )$$,
  'active Owner passes the private correction guard'
);
select throws_ok(
  $$select private.assert_correction_request(
    'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000102',
    'Correct the recorded date', 'f1000000-0000-4000-8000-000000000202', 'version-a', 'version-a'
  )$$,
  '42501', null, 'Salesman cannot authorize corrections'
);
select throws_ok(
  $$select private.assert_correction_request(
    'f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000101',
    'Correct the recorded date', 'f1000000-0000-4000-8000-000000000203', 'version-a', 'version-a'
  )$$,
  '42501', null, 'Owner of another organization is denied'
);
select throws_ok(
  $$select private.assert_correction_request(
    'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000101',
    'short', 'f1000000-0000-4000-8000-000000000204', 'version-a', 'version-a'
  )$$,
  '22023', null, 'meaningful reason is required'
);
select throws_ok(
  $$select private.assert_correction_request(
    'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000101',
    'Correct the recorded date', 'f1000000-0000-4000-8000-000000000205', 'version-a', 'version-b'
  )$$,
  '55000', null, 'stale preview version is rejected without a retryable SQLSTATE'
);

insert into public.transaction_corrections (
  organization_id, module, transaction_id, transaction_reference, correction_action,
  admin_user_id, reason, original_values, proposed_values, applied_values,
  affected_record_ids, inventory_adjustments, financial_adjustments, status,
  version_token, request_id
) values (
  'f1000000-0000-4000-8000-000000000001', 'stock_in', 'f1000000-0000-4000-8000-000000000301',
  'QA-001', 'correct_date', 'f1000000-0000-4000-8000-000000000101',
  'Correct the recorded date',
  '{"date":"2026-10-01","nested":{"password":"not-a-real-password"}}',
  '{"date":"2026-10-02","apiKey":"not-a-real-key"}',
  '{"date":"2026-10-02"}', '[]', '[]', '[]', 'applied', 'version-a',
  'f1000000-0000-4000-8000-000000000201'
);
select is((select original_values->'nested'->>'password' from public.transaction_corrections where transaction_reference = 'QA-001'), '[REDACTED]', 'nested password is redacted by database trigger');
select is((select proposed_values->>'apiKey' from public.transaction_corrections where transaction_reference = 'QA-001'), '[REDACTED]', 'API key is redacted by database trigger');
select throws_ok(
  $$select private.assert_correction_request(
    'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000101',
    'Correct the recorded date', 'f1000000-0000-4000-8000-000000000201', 'version-a', 'version-a'
  )$$,
  '23505', null, 'used request ID cannot be replayed'
);
select throws_ok(
  $$update public.transaction_corrections set reason = 'Changed later' where transaction_reference = 'QA-001'$$,
  '55000', null, 'audit entry cannot be updated'
);
select throws_ok(
  $$delete from public.transaction_corrections where transaction_reference = 'QA-001'$$,
  '55000', null, 'audit entry cannot be deleted'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000101';
select is((select count(*) from public.transaction_corrections), 1::bigint, 'Owner sees own organization history');
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000103';
select is((select count(*) from public.transaction_corrections), 0::bigint, 'Owner cannot see another organization history');
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000102';
select is((select count(*) from public.transaction_corrections), 0::bigint, 'Salesman cannot read correction history');
select throws_ok(
  $$insert into public.transaction_corrections (
    organization_id, module, transaction_id, transaction_reference, correction_action,
    admin_user_id, reason, status, version_token, request_id
  ) values (
    'f1000000-0000-4000-8000-000000000001', 'stock_in', gen_random_uuid(), 'DENIED', 'edit',
    'f1000000-0000-4000-8000-000000000102', 'Unauthorized correction', 'applied', 'v1', gen_random_uuid()
  )$$,
  '42501', null, 'authenticated role cannot insert correction history'
);

select * from finish();
rollback;
