-- A transaction can create more than one amendment with the same created_at.
-- Give amendments a stable insertion order for current-value and version checks.
do $$
begin
  if exists (select 1 from public.dcr_amendments) then
    raise exception 'Existing DCR amendments require a reviewed chronological backfill before this migration';
  end if;
end;
$$;

alter table public.dcr_amendments
  add column amendment_seq bigint generated always as identity unique;
create index dcr_amendments_current_idx
  on public.dcr_amendments (organization_id, dcr_id, amendment_seq desc);

create or replace function private.current_dcr_values(p_dcr public.daily_cash_reports)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_values jsonb;
begin
  select proposed_values into v_values from public.dcr_amendments
    where organization_id = p_dcr.organization_id and dcr_id = p_dcr.id
    order by amendment_seq desc limit 1;
  return coalesce(v_values, jsonb_build_object('cashCollected', p_dcr.cash_collected,
    'gcashCollected', p_dcr.gcash_collected, 'bankCollected', p_dcr.bank_collected,
    'cashPaidExpenses', p_dcr.cash_paid_expenses,
    'expectedCashRemittance', p_dcr.expected_cash_remittance,
    'actualCashRemittance', p_dcr.actual_cash_remittance,
    'difference', p_dcr.difference, 'explanation', p_dcr.explanation,
    'reconciliationNotes', null));
end;
$$;

create or replace function private.inspect_dcr_amendment(p_organization_id uuid, p_dcr_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_dcr public.daily_cash_reports%rowtype; v_current jsonb; v_proposed jsonb;
  v_blockers jsonb := '[]'::jsonb; v_cash numeric; v_gcash numeric; v_bank numeric;
  v_expenses numeric; v_actual numeric; v_expected numeric; v_explanation text;
  v_notes text; v_payments_signature jsonb; v_expenses_signature jsonb;
  v_amendment_seq bigint;
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
  select a.amendment_seq into v_amendment_seq from public.dcr_amendments a
    where a.organization_id = p_organization_id and a.dcr_id = p_dcr_id
    order by a.amendment_seq desc limit 1;
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
      'amendmentSeq', v_amendment_seq, 'payments', v_payments_signature,
      'expenses', v_expenses_signature)::text));
end;
$$;
