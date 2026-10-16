-- Phase 6: immutable DCR amendments and protected, narrowly scoped Expense corrections.
-- The original daily_cash_reports row is never updated by these functions.
-- Legacy expenses_admin_update policy remains until isolated Edge/RPC end-to-end
-- validation proves the protected replacement; remove it in a separate release gate.
create table public.dcr_amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  dcr_id uuid not null references public.daily_cash_reports(id) on delete restrict,
  correction_id uuid not null unique references public.transaction_corrections(id) on delete restrict,
  admin_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 10 and 500),
  original_values jsonb not null check (jsonb_typeof(original_values) = 'object'),
  proposed_values jsonb not null check (jsonb_typeof(proposed_values) = 'object'),
  financial_impact jsonb not null check (jsonb_typeof(financial_impact) = 'object'),
  source_correction_id uuid references public.transaction_corrections(id) on delete restrict,
  source_expense_id uuid references public.expenses(id) on delete restrict,
  status text not null default 'applied' check (status = 'applied'),
  created_at timestamptz not null default now()
);
create index dcr_amendments_org_dcr_date_idx on public.dcr_amendments (organization_id, dcr_id, created_at desc, id desc);
alter table public.dcr_amendments enable row level security;
create policy dcr_amendments_admin_select on public.dcr_amendments for select to authenticated
  using (private.has_org_role(organization_id, array['owner_admin']));
revoke all on public.dcr_amendments from public, anon, authenticated;
grant select on public.dcr_amendments to authenticated;
grant all on public.dcr_amendments to service_role;

create function private.reject_dcr_amendment_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'DCR amendments are immutable' using errcode = '42501';
end;
$$;
create trigger dcr_amendments_immutable before update or delete on public.dcr_amendments
  for each row execute function private.reject_dcr_amendment_change();

-- Only the dedicated correction RPC sets this flag. The original Expense trigger
-- still records post-lock changes made through the legacy direct UPDATE policy.
create or replace function private.flag_post_dcr_adjustment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_salesman uuid;
  v_date date;
  v_entity_id uuid;
  v_dcr_id uuid;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'payments'
     and to_jsonb(new) - 'bank_name' - 'reference_number'
         = to_jsonb(old) - 'bank_name' - 'reference_number' then return new; end if;
  if tg_op = 'UPDATE' and tg_table_name = 'expenses'
     and current_setting('app.admin_expense_correction', true) = new.id::text then return new; end if;
  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_salesman := old.salesman_user_id; v_entity_id := old.id;
    if tg_table_name = 'payments' then v_date := old.payment_date; else v_date := old.expense_date; end if;
  else
    v_org := new.organization_id; v_salesman := new.salesman_user_id; v_entity_id := new.id;
    if tg_table_name = 'payments' then v_date := new.payment_date; else v_date := new.expense_date; end if;
  end if;
  if v_salesman is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select id into v_dcr_id from public.daily_cash_reports
    where organization_id = v_org and salesman_user_id = v_salesman
      and report_date = v_date and status = 'locked';
  if found then
    insert into public.discrepancies (organization_id, type, severity, related_entity_type,
      related_entity_id, salesman_user_id, description)
    values (v_org, 'post_dcr_adjustment', 'high', tg_table_name, v_entity_id, v_salesman,
      format('%s %s changed after DCR %s was locked.', initcap(tg_table_name), tg_op, v_dcr_id));
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create function private.current_dcr_values(p_dcr public.daily_cash_reports) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_values jsonb;
begin
  select proposed_values into v_values from public.dcr_amendments
    where organization_id = p_dcr.organization_id and dcr_id = p_dcr.id
    order by created_at desc, id desc limit 1;
  return coalesce(v_values, jsonb_build_object('cashCollected', p_dcr.cash_collected,
    'gcashCollected', p_dcr.gcash_collected, 'bankCollected', p_dcr.bank_collected,
    'cashPaidExpenses', p_dcr.cash_paid_expenses,
    'expectedCashRemittance', p_dcr.expected_cash_remittance,
    'actualCashRemittance', p_dcr.actual_cash_remittance,
    'difference', p_dcr.difference, 'explanation', p_dcr.explanation,
    'reconciliationNotes', null));
end;
$$;

create function private.inspect_expense_correction(p_organization_id uuid, p_expense_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expense public.expenses%rowtype;
  v_old jsonb; v_new jsonb; v_blockers jsonb := '[]'::jsonb;
  v_dcr public.daily_cash_reports%rowtype; v_current jsonb; v_amendment jsonb := '[]'::jsonb;
  v_old_cash numeric; v_new_cash numeric; v_new_expenses numeric; v_new_expected numeric;
  v_old_key text; v_new_key text; v_date date; v_salesman uuid; v_amount numeric;
  v_category text; v_description text; v_status text; v_signature jsonb;
  v_live_cash numeric; v_live_gcash numeric; v_live_bank numeric; v_live_expenses numeric;
begin
  if jsonb_typeof(p_changes) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k(key)
      where k.key not in ('expenseDate', 'salesmanUserId', 'category', 'amount', 'description', 'approvalStatus'))
    or jsonb_typeof(p_changes->'expenseDate') is distinct from 'string'
    or jsonb_typeof(p_changes->'salesmanUserId') not in ('string', 'null')
    or jsonb_typeof(p_changes->'category') is distinct from 'string'
    or jsonb_typeof(p_changes->'amount') is distinct from 'number'
    or jsonb_typeof(p_changes->'description') not in ('string', 'null')
    or jsonb_typeof(p_changes->'approvalStatus') is distinct from 'string' then
    raise exception 'Invalid Expense correction fields' using errcode = '22023';
  end if;
  if p_changes->>'expenseDate' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter a valid Expense date' using errcode = '22023';
  end if;
  v_date := (p_changes->>'expenseDate')::date;
  v_salesman := nullif(p_changes->>'salesmanUserId', '')::uuid;
  v_category := btrim(p_changes->>'category');
  v_amount := (p_changes->>'amount')::numeric;
  v_description := nullif(btrim(p_changes->>'description'), '');
  v_status := p_changes->>'approvalStatus';
  if v_date < date '2000-01-01' or v_date > (now() at time zone 'Asia/Manila')::date
    or length(v_category) not between 1 and 160 or length(coalesce(v_description, '')) > 2000
    or v_amount <= 0 or v_amount >= 100000000000000 or v_amount <> round(v_amount, 2)
    or v_status not in ('pending', 'approved', 'rejected', 'voided') then
    raise exception 'Invalid Expense date, category, amount, description or approval' using errcode = '22023';
  end if;
  select * into v_expense from public.expenses
    where id = p_expense_id and organization_id = p_organization_id;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v_salesman is not null and not private.is_active_salesman(p_organization_id, v_salesman) then
    v_blockers := v_blockers || jsonb_build_array('Select an active Salesman in this organization.');
  end if;
  if exists (select 1 from public.discrepancies d where d.organization_id = p_organization_id
    and d.related_entity_id = p_expense_id and d.status in ('open', 'investigating')) then
    v_blockers := v_blockers || jsonb_build_array('An open Expense discrepancy requires separate review.');
  end if;
  v_old := jsonb_build_object('expenseDate', v_expense.expense_date,
    'salesmanUserId', v_expense.salesman_user_id, 'category', v_expense.category,
    'amount', v_expense.amount, 'description', v_expense.description,
    'approvalStatus', v_expense.approval_status, 'paymentSource', v_expense.payment_source);
  v_new := jsonb_build_object('expenseDate', v_date, 'salesmanUserId', v_salesman,
    'category', v_category, 'amount', v_amount, 'description', v_description,
    'approvalStatus', v_status, 'paymentSource', v_expense.payment_source);
  if v_old = v_new then v_blockers := v_blockers || jsonb_build_array('Make at least one change.'); end if;
  v_old_key := coalesce(v_expense.salesman_user_id::text, '') || ':' || v_expense.expense_date::text;
  v_new_key := coalesce(v_salesman::text, '') || ':' || v_date::text;
  if v_old_key <> v_new_key and exists (
    select 1 from public.daily_cash_reports d where d.organization_id = p_organization_id
      and ((d.salesman_user_id = v_expense.salesman_user_id and d.report_date = v_expense.expense_date)
        or (d.salesman_user_id = v_salesman and d.report_date = v_date))) then
    v_blockers := v_blockers || jsonb_build_array('Moving an Expense into or out of a submitted DCR requires a separate reversal workflow.');
  end if;
  select * into v_dcr from public.daily_cash_reports d where d.organization_id = p_organization_id
    and d.salesman_user_id = v_expense.salesman_user_id and d.report_date = v_expense.expense_date;
  if found then
    if v_dcr.status <> 'locked' then
      v_blockers := v_blockers || jsonb_build_array('Reopened DCR requires separate review.');
    end if;
    if exists (select 1 from public.discrepancies d where d.organization_id = p_organization_id
      and d.related_entity_type = 'daily_cash_report' and d.related_entity_id = v_dcr.id
      and d.status in ('investigating', 'dismissed')) then
      v_blockers := v_blockers || jsonb_build_array('Finalized DCR discrepancy requires separate review.');
    end if;
    v_current := private.current_dcr_values(v_dcr);
    select coalesce(sum(amount) filter (where method = 'cash'), 0),
      coalesce(sum(amount) filter (where method = 'gcash'), 0),
      coalesce(sum(amount) filter (where method = 'bank'), 0)
      into v_live_cash, v_live_gcash, v_live_bank from public.payments
      where organization_id = p_organization_id and salesman_user_id = v_expense.salesman_user_id
        and payment_date = v_expense.expense_date and voided_at is null;
    select coalesce(sum(amount), 0) into v_live_expenses from public.expenses
      where organization_id = p_organization_id and salesman_user_id = v_expense.salesman_user_id
        and expense_date = v_expense.expense_date and payment_source = 'cash_collection'
        and approval_status = 'approved';
    if v_live_cash <> (v_current->>'cashCollected')::numeric
      or v_live_gcash <> (v_current->>'gcashCollected')::numeric
      or v_live_bank <> (v_current->>'bankCollected')::numeric
      or v_live_expenses <> (v_current->>'cashPaidExpenses')::numeric then
      v_blockers := v_blockers || jsonb_build_array('DCR source totals changed. Reconcile the DCR before editing this Expense.');
    end if;
    v_old_cash := case when v_expense.payment_source = 'cash_collection'
      and v_expense.approval_status = 'approved' then v_expense.amount else 0 end;
    v_new_cash := case when v_expense.payment_source = 'cash_collection'
      and v_status = 'approved' then v_amount else 0 end;
    v_new_expenses := (v_current->>'cashPaidExpenses')::numeric + v_new_cash - v_old_cash;
    v_new_expected := (v_current->>'cashCollected')::numeric - v_new_expenses;
    if v_new_expenses < 0 then v_blockers := v_blockers || jsonb_build_array('Cash expenses would become negative.'); end if;
    v_amendment := jsonb_build_array(jsonb_build_object('dcrId', v_dcr.id,
        'before', v_current, 'after', jsonb_build_object(
          'cashCollected', v_current->'cashCollected', 'gcashCollected', v_current->'gcashCollected',
          'bankCollected', v_current->'bankCollected', 'cashPaidExpenses', v_new_expenses,
          'expectedCashRemittance', v_new_expected,
          'actualCashRemittance', v_current->'actualCashRemittance',
          'difference', (v_current->>'actualCashRemittance')::numeric - v_new_expected,
          'explanation', v_current->'explanation',
          'reconciliationNotes', v_current->'reconciliationNotes')));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'status', d.status,
    'current', private.current_dcr_values(d)) order by d.id), '[]'::jsonb) into v_signature
    from public.daily_cash_reports d where d.organization_id = p_organization_id
      and ((d.salesman_user_id = v_expense.salesman_user_id and d.report_date = v_expense.expense_date)
        or (d.salesman_user_id = v_salesman and d.report_date = v_date));
  return jsonb_build_object('originalValues', v_old, 'proposedValues', v_new,
    'affectedRecords', jsonb_build_array(jsonb_build_object('type', 'expense', 'id', p_expense_id)) ||
      (select coalesce(jsonb_agg(jsonb_build_object('type', 'daily_cash_report', 'id', value->>'dcrId')),
        '[]'::jsonb) from jsonb_array_elements(v_amendment) value),
    'dcrAmendments', v_amendment, 'expectedInventoryChanges', '[]'::jsonb,
    'expectedFinancialChanges', jsonb_build_array(jsonb_build_object('type', 'expense',
      'before', v_expense.amount, 'after', v_amount, 'delta', v_amount - v_expense.amount)),
    'blockedReasons', v_blockers, 'eligible', jsonb_array_length(v_blockers) = 0,
    'versionToken', md5(jsonb_build_object('expense', to_jsonb(v_expense), 'dcrs', v_signature)::text));
end;
$$;

create function public.preview_expense_correction(p_organization_id uuid, p_expense_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  return private.inspect_expense_correction(p_organization_id, p_expense_id, p_changes);
end;
$$;

create function public.apply_expense_correction(
  p_organization_id uuid, p_expense_id uuid, p_actor_user_id uuid,
  p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expense public.expenses%rowtype; v_preview jsonb; v_item jsonb;
  v_correction_id uuid := gen_random_uuid(); v_dcr_correction_id uuid; v_amendment_id uuid;
  v_date_key text;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id and p.active and m.organization_id = p_organization_id
      and m.role = 'owner_admin' and m.active for share of p, m;
  if not found then raise exception 'Active Owner / Admin authorization is required' using errcode = '42501'; end if;
  perform private.assert_correction_actor(p_organization_id, p_actor_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 14902));
  select * into v_expense from public.expenses
    where id = p_expense_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  for v_date_key in select distinct value from (values
    (p_organization_id::text || ':' || coalesce(v_expense.salesman_user_id::text, '') || ':' || v_expense.expense_date::text),
    (p_organization_id::text || ':' || coalesce(p_changes->>'salesmanUserId', '') || ':' || coalesce(p_changes->>'expenseDate', ''))
  ) dates(value) order by value loop
    perform pg_advisory_xact_lock(hashtextextended(v_date_key, 0));
  end loop;
  perform 1 from public.daily_cash_reports d where d.organization_id = p_organization_id
    and ((d.salesman_user_id = v_expense.salesman_user_id and d.report_date = v_expense.expense_date)
      or (d.salesman_user_id = nullif(p_changes->>'salesmanUserId', '')::uuid
        and d.report_date = (p_changes->>'expenseDate')::date)) order by d.id for update;
  perform 1 from public.payments p where p.organization_id = p_organization_id
    and p.salesman_user_id = v_expense.salesman_user_id
    and p.payment_date = v_expense.expense_date order by p.id for share;
  perform 1 from public.expenses e where e.organization_id = p_organization_id
    and e.salesman_user_id = v_expense.salesman_user_id
    and e.expense_date = v_expense.expense_date order by e.id for share;
  v_preview := private.inspect_expense_correction(p_organization_id, p_expense_id, p_changes);
  perform private.assert_correction_request(p_organization_id, p_actor_user_id, p_reason,
    p_request_id, p_expected_version, v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception '%', (select string_agg(value, ' ') from jsonb_array_elements_text(v_preview->'blockedReasons'))
      using errcode = '55000';
  end if;
  -- The Expense trigger must not create a second, unresolved post-lock flag: the
  -- linked amendment below is the audited reconciliation for this exact update.
  perform set_config('app.admin_expense_correction', p_expense_id::text, true);
  update public.expenses set expense_date = (v_preview->'proposedValues'->>'expenseDate')::date,
    salesman_user_id = nullif(v_preview->'proposedValues'->>'salesmanUserId', '')::uuid,
    category = v_preview->'proposedValues'->>'category',
    amount = (v_preview->'proposedValues'->>'amount')::numeric,
    description = v_preview->'proposedValues'->>'description',
    approval_status = v_preview->'proposedValues'->>'approvalStatus'
    where id = p_expense_id and organization_id = p_organization_id;
  perform set_config('app.admin_expense_correction', '', true);
  insert into public.transaction_corrections (id, organization_id, module, transaction_id,
    transaction_reference, correction_action, admin_user_id, reason, original_values,
    proposed_values, applied_values, affected_record_ids, inventory_adjustments,
    financial_adjustments, status, version_token, request_id)
  values (v_correction_id, p_organization_id, 'expense', p_expense_id, p_expense_id::text,
    'edit', p_actor_user_id, btrim(p_reason), v_preview->'originalValues',
    v_preview->'proposedValues', v_preview->'proposedValues', v_preview->'affectedRecords',
    '[]'::jsonb, v_preview->'expectedFinancialChanges', 'applied', p_expected_version, p_request_id);
  for v_item in select value from jsonb_array_elements(v_preview->'dcrAmendments') loop
    v_dcr_correction_id := gen_random_uuid();
    insert into public.transaction_corrections (id, organization_id, module, transaction_id,
      transaction_reference, correction_action, admin_user_id, reason, original_values,
      proposed_values, applied_values, affected_record_ids, inventory_adjustments,
      financial_adjustments, status, version_token, request_id)
    values (v_dcr_correction_id, p_organization_id, 'dcr', (v_item->>'dcrId')::uuid,
      (v_item->>'dcrId'), 'amend_from_expense', p_actor_user_id, btrim(p_reason),
      v_item->'before', v_item->'after', v_item->'after',
      jsonb_build_array(jsonb_build_object('type', 'expense', 'id', p_expense_id),
        jsonb_build_object('type', 'daily_cash_report', 'id', v_item->>'dcrId')),
      '[]'::jsonb, jsonb_build_array(jsonb_build_object('type', 'expected_cash',
        'before', v_item->'before'->'expectedCashRemittance',
        'after', v_item->'after'->'expectedCashRemittance')),
      'applied', p_expected_version, gen_random_uuid());
    insert into public.dcr_amendments (organization_id, dcr_id, correction_id, admin_user_id,
      reason, original_values, proposed_values, financial_impact, source_expense_id, source_correction_id)
    values (p_organization_id, (v_item->>'dcrId')::uuid, v_dcr_correction_id, p_actor_user_id,
      btrim(p_reason), v_item->'before', v_item->'after',
      jsonb_build_object('expectedCashDelta', (v_item->'after'->>'expectedCashRemittance')::numeric
        - (v_item->'before'->>'expectedCashRemittance')::numeric,
        'differenceDelta', (v_item->'after'->>'difference')::numeric
        - (v_item->'before'->>'difference')::numeric), p_expense_id, v_correction_id)
      returning id into v_amendment_id;
    insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
      action, before_data, after_data)
    values (p_organization_id, p_actor_user_id, 'daily_cash_report', (v_item->>'dcrId')::uuid,
      'AMEND_DCR_FROM_EXPENSE', v_item->'before', jsonb_build_object('amendmentId', v_amendment_id,
        'correctionId', v_dcr_correction_id, 'sourceCorrectionId', v_correction_id,
        'current', v_item->'after'));
    if (v_item->'after'->>'difference')::numeric <> (v_item->'before'->>'difference')::numeric then
      perform private.reconcile_dcr_discrepancy(p_organization_id, (v_item->>'dcrId')::uuid,
        (v_item->'after'->>'difference')::numeric, p_actor_user_id, v_amendment_id);
    end if;
  end loop;
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (p_organization_id, p_actor_user_id, 'expense', p_expense_id, 'CORRECT_EXPENSE',
    v_preview->'originalValues', jsonb_build_object('correctionId', v_correction_id,
      'applied', v_preview->'proposedValues', 'dcrAmendments', v_preview->'dcrAmendments'));
  return jsonb_build_object('correctionId', v_correction_id, 'expenseId', p_expense_id,
    'dcrAmendmentId', v_amendment_id);
end;
$$;

create function private.reconcile_dcr_discrepancy(p_organization_id uuid, p_dcr_id uuid,
  p_difference numeric, p_actor_user_id uuid, p_amendment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.discrepancies%rowtype;
begin
  for v_old in select * from public.discrepancies d
    where d.organization_id = p_organization_id and d.related_entity_type = 'daily_cash_report'
      and d.related_entity_id = p_dcr_id and d.type in ('cash_shortage', 'cash_overage')
      and d.status in ('open', 'investigating') order by d.id for update loop
    update public.discrepancies set status = 'resolved', resolved_at = now(),
      resolved_by = p_actor_user_id where id = v_old.id;
    insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
      action, before_data, after_data)
    values (p_organization_id, p_actor_user_id, 'discrepancy', v_old.id, 'SUPERSEDED_BY_DCR_AMENDMENT',
      to_jsonb(v_old), jsonb_build_object('amendmentId', p_amendment_id, 'status', 'resolved'));
  end loop;
  if p_difference <> 0 then
    insert into public.discrepancies (organization_id, type, severity, related_entity_type,
      related_entity_id, salesman_user_id, amount_difference, description)
    select p_organization_id, case when p_difference < 0 then 'cash_shortage' else 'cash_overage' end,
      case when abs(p_difference) >= 1000 then 'high' else 'medium' end,
      'daily_cash_report', p_dcr_id, d.salesman_user_id, p_difference,
      'Current cash difference after DCR amendment ' || p_amendment_id::text
    from public.daily_cash_reports d where d.id = p_dcr_id and d.organization_id = p_organization_id;
  end if;
end;
$$;

create function private.inspect_dcr_amendment(p_organization_id uuid, p_dcr_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_dcr public.daily_cash_reports%rowtype; v_current jsonb; v_proposed jsonb;
  v_blockers jsonb := '[]'::jsonb; v_cash numeric; v_gcash numeric; v_bank numeric;
  v_expenses numeric; v_actual numeric; v_expected numeric; v_explanation text;
  v_notes text; v_payments_signature jsonb; v_expenses_signature jsonb;
begin
  if jsonb_typeof(p_changes) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k(key)
      where k.key not in ('actualCashRemittance', 'explanation', 'reconciliationNotes'))
    or jsonb_typeof(p_changes->'actualCashRemittance') is distinct from 'number'
    or jsonb_typeof(p_changes->'explanation') not in ('string', 'null')
    or jsonb_typeof(p_changes->'reconciliationNotes') not in ('string', 'null') then
    raise exception 'Invalid DCR amendment fields' using errcode = '22023';
  end if;
  v_actual := (p_changes->>'actualCashRemittance')::numeric;
  v_explanation := nullif(btrim(p_changes->>'explanation'), '');
  v_notes := nullif(btrim(p_changes->>'reconciliationNotes'), '');
  if v_actual < 0 or v_actual >= 100000000000000 or v_actual <> round(v_actual, 2)
    or length(coalesce(v_explanation, '')) > 2000 or length(coalesce(v_notes, '')) > 2000 then
    raise exception 'Invalid remittance or notes' using errcode = '22023';
  end if;
  select * into v_dcr from public.daily_cash_reports
    where organization_id = p_organization_id and id = p_dcr_id;
  if not found then raise exception 'DCR not found' using errcode = 'P0002'; end if;
  if v_dcr.status <> 'locked' then
    v_blockers := v_blockers || jsonb_build_array('Only locked DCRs can be amended.');
  end if;
  if exists (select 1 from public.discrepancies d where d.organization_id = p_organization_id
    and d.related_entity_type = 'daily_cash_report' and d.related_entity_id = p_dcr_id
    and d.status in ('investigating', 'dismissed')) then
    v_blockers := v_blockers || jsonb_build_array('Finalized DCR discrepancy requires separate review.');
  end if;
  v_current := private.current_dcr_values(v_dcr);
  select coalesce(sum(amount) filter (where method = 'cash'), 0),
    coalesce(sum(amount) filter (where method = 'gcash'), 0),
    coalesce(sum(amount) filter (where method = 'bank'), 0),
    coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
    into v_cash, v_gcash, v_bank, v_payments_signature
    from public.payments p where p.organization_id = p_organization_id
      and p.salesman_user_id = v_dcr.salesman_user_id and p.payment_date = v_dcr.report_date
      and p.voided_at is null;
  if v_cash <> (v_current->>'cashCollected')::numeric
    or v_gcash <> (v_current->>'gcashCollected')::numeric
    or v_bank <> (v_current->>'bankCollected')::numeric then
    v_blockers := v_blockers || jsonb_build_array('Payment totals changed after lock. Correct the source Payment first.');
  end if;
  select coalesce(sum(amount), 0), coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
    into v_expenses, v_expenses_signature from public.expenses e
    where e.organization_id = p_organization_id and e.salesman_user_id = v_dcr.salesman_user_id
      and e.expense_date = v_dcr.report_date and e.payment_source = 'cash_collection'
      and e.approval_status = 'approved';
  v_expected := v_cash - v_expenses;
  if v_actual - v_expected <> 0 and v_explanation is null then
    v_blockers := v_blockers || jsonb_build_array('Explain a nonzero cash difference.');
  end if;
  v_proposed := jsonb_build_object('cashCollected', v_cash, 'gcashCollected', v_gcash,
    'bankCollected', v_bank, 'cashPaidExpenses', v_expenses,
    'expectedCashRemittance', v_expected, 'actualCashRemittance', v_actual,
    'difference', v_actual - v_expected, 'explanation', v_explanation,
    'reconciliationNotes', v_notes);
  if v_proposed = v_current then
    v_blockers := v_blockers || jsonb_build_array('Make at least one amendment.');
  end if;
  return jsonb_build_object('originalValues', v_current, 'proposedValues', v_proposed,
    'affectedRecords', jsonb_build_array(jsonb_build_object('type', 'daily_cash_report', 'id', p_dcr_id)),
    'expectedInventoryChanges', '[]'::jsonb,
    'expectedFinancialChanges', jsonb_build_array(
      jsonb_build_object('type', 'cash_expenses', 'before', (v_current->>'cashPaidExpenses')::numeric,
        'after', v_expenses, 'delta', v_expenses - (v_current->>'cashPaidExpenses')::numeric),
      jsonb_build_object('type', 'expected_cash', 'before', (v_current->>'expectedCashRemittance')::numeric,
        'after', v_expected, 'delta', v_expected - (v_current->>'expectedCashRemittance')::numeric),
      jsonb_build_object('type', 'cash_difference', 'before', (v_current->>'difference')::numeric,
        'after', v_actual - v_expected, 'delta', v_actual - v_expected - (v_current->>'difference')::numeric)),
    'blockedReasons', v_blockers, 'eligible', jsonb_array_length(v_blockers) = 0,
    'versionToken', md5(jsonb_build_object('dcr', to_jsonb(v_dcr), 'current', v_current,
      'payments', v_payments_signature, 'expenses', v_expenses_signature)::text));
end;
$$;

create function public.preview_dcr_amendment(p_organization_id uuid, p_dcr_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  return private.inspect_dcr_amendment(p_organization_id, p_dcr_id, p_changes);
end;
$$;

create function public.apply_dcr_amendment(p_organization_id uuid, p_dcr_id uuid,
  p_actor_user_id uuid, p_reason text, p_request_id uuid,
  p_expected_version text, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dcr public.daily_cash_reports%rowtype; v_preview jsonb;
  v_correction_id uuid := gen_random_uuid(); v_amendment_id uuid;
  v_reference text;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id and p.active and m.organization_id = p_organization_id
      and m.role = 'owner_admin' and m.active for share of p, m;
  if not found then raise exception 'Active Owner / Admin authorization is required' using errcode = '42501'; end if;
  perform private.assert_correction_actor(p_organization_id, p_actor_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 14902));
  select * into v_dcr from public.daily_cash_reports
    where id = p_dcr_id and organization_id = p_organization_id for update;
  if not found then raise exception 'DCR not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' ||
    v_dcr.salesman_user_id::text || ':' || v_dcr.report_date::text, 0));
  perform 1 from public.payments p where p.organization_id = p_organization_id
    and p.salesman_user_id = v_dcr.salesman_user_id and p.payment_date = v_dcr.report_date
    order by p.id for share;
  perform 1 from public.expenses e where e.organization_id = p_organization_id
    and e.salesman_user_id = v_dcr.salesman_user_id and e.expense_date = v_dcr.report_date
    order by e.id for share;
  v_preview := private.inspect_dcr_amendment(p_organization_id, p_dcr_id, p_changes);
  perform private.assert_correction_request(p_organization_id, p_actor_user_id, p_reason,
    p_request_id, p_expected_version, v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception '%', (select string_agg(value, ' ') from jsonb_array_elements_text(v_preview->'blockedReasons'))
      using errcode = '55000';
  end if;
  v_reference := v_dcr.report_date::text || ' / ' || v_dcr.salesman_user_id::text;
  insert into public.transaction_corrections (id, organization_id, module, transaction_id,
    transaction_reference, correction_action, admin_user_id, reason, original_values,
    proposed_values, applied_values, affected_record_ids, inventory_adjustments,
    financial_adjustments, status, version_token, request_id)
  values (v_correction_id, p_organization_id, 'dcr', p_dcr_id, v_reference,
    'amend', p_actor_user_id, btrim(p_reason), v_preview->'originalValues',
    v_preview->'proposedValues', v_preview->'proposedValues', v_preview->'affectedRecords',
    '[]'::jsonb, v_preview->'expectedFinancialChanges', 'applied', p_expected_version, p_request_id);
  insert into public.dcr_amendments (organization_id, dcr_id, correction_id, admin_user_id,
    reason, original_values, proposed_values, financial_impact)
  values (p_organization_id, p_dcr_id, v_correction_id, p_actor_user_id, btrim(p_reason),
    v_preview->'originalValues', v_preview->'proposedValues',
    jsonb_build_object('cashExpenseDelta', (v_preview->'proposedValues'->>'cashPaidExpenses')::numeric
      - (v_preview->'originalValues'->>'cashPaidExpenses')::numeric,
      'expectedCashDelta', (v_preview->'proposedValues'->>'expectedCashRemittance')::numeric
      - (v_preview->'originalValues'->>'expectedCashRemittance')::numeric,
      'differenceDelta', (v_preview->'proposedValues'->>'difference')::numeric
      - (v_preview->'originalValues'->>'difference')::numeric))
  returning id into v_amendment_id;
  if (v_preview->'proposedValues'->>'difference')::numeric
      <> (v_preview->'originalValues'->>'difference')::numeric then
    perform private.reconcile_dcr_discrepancy(p_organization_id, p_dcr_id,
      (v_preview->'proposedValues'->>'difference')::numeric, p_actor_user_id, v_amendment_id);
  end if;
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (p_organization_id, p_actor_user_id, 'daily_cash_report', p_dcr_id, 'AMEND_DCR',
    v_preview->'originalValues', jsonb_build_object('correctionId', v_correction_id,
      'amendmentId', v_amendment_id, 'current', v_preview->'proposedValues'));
  return jsonb_build_object('correctionId', v_correction_id, 'amendmentId', v_amendment_id,
    'dcrId', p_dcr_id);
end;
$$;

revoke all on function private.reject_dcr_amendment_change() from public, anon, authenticated;
revoke all on function private.current_dcr_values(public.daily_cash_reports) from public, anon, authenticated;
revoke all on function private.inspect_expense_correction(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.inspect_dcr_amendment(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.reconcile_dcr_discrepancy(uuid, uuid, numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function public.preview_expense_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_expense_correction(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_dcr_amendment(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_dcr_amendment(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.preview_expense_correction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.preview_dcr_amendment(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_expense_correction(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role;
grant execute on function public.apply_dcr_amendment(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role;
