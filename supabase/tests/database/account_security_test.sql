begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select has_column('public', 'profiles', 'username', 'Profiles have an operational username');
select has_column('public', 'profiles', 'must_change_password', 'Profiles track required password changes');
select hasnt_function_privilege('authenticated', 'public.provision_salesman_account(uuid,uuid,text,text,uuid)', 'execute', 'Browser sessions cannot call the provisioning RPC');
select hasnt_function_privilege('authenticated', 'public.update_salesman_account(uuid,uuid,text,text,boolean,uuid)', 'execute', 'Browser sessions cannot call the account update RPC');
select has_function_privilege('service_role', 'public.provision_salesman_account(uuid,uuid,text,text,uuid)', 'execute', 'Only the server-side service role can provision Salesmen');

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-000000000101', 'account-owner@test.invalid'),
  ('e0000000-0000-4000-8000-000000000102', 'account-sales@test.invalid');
insert into public.profiles (id, full_name, username, must_change_password) values
  ('e0000000-0000-4000-8000-000000000101', 'Account Owner', 'account.owner', false),
  ('e0000000-0000-4000-8000-000000000102', 'Account Sales', 'account.sales', true);
insert into public.organizations (id, name, slug) values
  ('e0000000-0000-4000-8000-000000000001', 'Account Security Organization', 'account-security-organization');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000102', 'salesman');

select throws_ok(
  $$insert into public.profiles (id, full_name, username) values (gen_random_uuid(), 'Duplicate', 'account.sales')$$,
  '23505', null, 'Normalized usernames are unique'
);

select hasnt_table_privilege('anon', 'public.profiles', 'select', 'Anonymous callers cannot enumerate usernames');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000102', true);
select throws_ok(
  $$update public.profiles set username = 'promoted.salesman' where id = 'e0000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'Salesman cannot directly rewrite profile identity'
);
select results_eq(
  $$update public.organization_memberships set role = 'owner_admin' where user_id = 'e0000000-0000-4000-8000-000000000102' returning role$$,
  $$select null::text where false$$,
  'Salesman cannot promote themselves'
);

select * from finish(true);
rollback;
