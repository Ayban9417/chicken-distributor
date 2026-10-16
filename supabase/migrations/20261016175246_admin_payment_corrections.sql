-- Phase 5: narrowly scoped correction of unverified, non-finalized Payments.
create function private.inspect_payment_correction(
  p_organization_id uuid, p_payment_id uuid, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_old_allocations jsonb;
  v_new_allocations jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_dcrs jsonb;
  v_affected jsonb := jsonb_build_array(jsonb_build_object('type', 'payment', 'id', p_payment_id));
  v_date date;
  v_customer uuid;
  v_amount numeric;
  v_method text;
  v_reference text;
  v_bank text;
  v_notes text;
  v_mode text;
  v_remaining numeric;
  v_capacity numeric;
  v_allocated numeric;
  v_old_balance numeric;
  v_new_balance numeric;
  v_original jsonb;
  v_proposed jsonb;
  v_sale_signature jsonb;
  v_allocation_signature jsonb;
begin
  if jsonb_typeof(p_changes) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k(key)
      where k.key not in ('paymentDate', 'customerId', 'amount', 'method',
        'referenceNumber', 'bankName', 'notes', 'allocationMode', 'allocations'))
    or jsonb_typeof(p_changes->'paymentDate') is distinct from 'string'
    or jsonb_typeof(p_changes->'customerId') is distinct from 'string'
    or jsonb_typeof(p_changes->'amount') is distinct from 'number'
    or jsonb_typeof(p_changes->'method') is distinct from 'string'
    or jsonb_typeof(p_changes->'allocationMode') is distinct from 'string'
    or jsonb_typeof(p_changes->'allocations') is distinct from 'array'
    or (p_changes ? 'referenceNumber' and jsonb_typeof(p_changes->'referenceNumber') not in ('string', 'null'))
    or (p_changes ? 'bankName' and jsonb_typeof(p_changes->'bankName') not in ('string', 'null'))
    or (p_changes ? 'notes' and jsonb_typeof(p_changes->'notes') not in ('string', 'null')) then
    raise exception 'Invalid Payment correction fields' using errcode = '22023';
  end if;
  if p_changes->>'paymentDate' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter a valid Payment date' using errcode = '22023';
  end if;
  v_date := (p_changes->>'paymentDate')::date;
  v_customer := (p_changes->>'customerId')::uuid;
  v_amount := (p_changes->>'amount')::numeric;
  v_method := p_changes->>'method';
  v_reference := nullif(btrim(p_changes->>'referenceNumber'), '');
  v_bank := nullif(btrim(p_changes->>'bankName'), '');
  v_notes := nullif(btrim(p_changes->>'notes'), '');
  v_mode := p_changes->>'allocationMode';
  if v_amount <= 0 or v_amount >= 100000000000000 or v_amount <> round(v_amount, 2)
    or v_method not in ('cash', 'gcash', 'bank')
    or v_mode not in ('preserve', 'fifo', 'manual')
    or length(coalesce(v_reference, '')) > 160 or length(coalesce(v_bank, '')) > 160
    or length(coalesce(v_notes, '')) > 2000
    or jsonb_array_length(p_changes->'allocations') > 100 then
    raise exception 'Invalid Payment amount, method, notes or allocations' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes->'allocations') > 0 and v_mode <> 'manual' then
    raise exception 'Explicit allocations require manual mode' using errcode = '22023';
  end if;
  select * into v_payment from public.payments
    where id = p_payment_id and organization_id = p_organization_id;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'saleId', a.sale_id,
    'trustReceiptNumber', s.trust_receipt_number, 'amount', a.amount) order by s.sale_date, s.created_at, s.id), '[]'::jsonb)
    into v_old_allocations from public.payment_allocations a
    join public.sales s on s.id = a.sale_id where a.payment_id = p_payment_id;
  if v_payment.voided_at is not null or v_payment.verification_status in ('verified', 'rejected') then
    v_blockers := v_blockers || jsonb_build_array('Finalized or verified Payment requires a reversal and replacement workflow.');
  end if;
  if v_date < date '2000-01-01' or v_date > (now() at time zone 'Asia/Manila')::date then
    v_blockers := v_blockers || jsonb_build_array('Payment date must not be future-dated or before 2000.');
  end if;
  if not exists (select 1 from public.customers c where c.id = v_customer
    and c.organization_id = p_organization_id and c.active) then
    v_blockers := v_blockers || jsonb_build_array('Select an active Customer in this organization.');
  end if;
  if v_method = 'gcash' and v_reference is null then
    v_blockers := v_blockers || jsonb_build_array('GCash requires a reference number.');
  end if;
  if v_method = 'bank' and v_bank is null then
    v_blockers := v_blockers || jsonb_build_array('Bank Payment requires a bank name.');
  end if;
  if v_method = 'cash' then v_reference := null; v_bank := null;
  elsif v_method = 'gcash' then v_bank := null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'reportDate', d.report_date,
    'status', d.status) order by d.id), '[]'::jsonb) into v_dcrs
    from public.daily_cash_reports d where d.organization_id = p_organization_id
      and d.salesman_user_id = v_payment.salesman_user_id
      and d.report_date in (v_payment.payment_date, v_date);
  if jsonb_array_length(v_dcrs) > 0 then
    v_blockers := v_blockers || jsonb_build_array('Payment belongs to a submitted DCR. Direct correction is blocked.');
  end if;
  if exists (select 1 from public.discrepancies d where d.organization_id = p_organization_id
    and (d.related_entity_id = p_payment_id or d.related_entity_id in
      (select a.id from public.payment_allocations a where a.payment_id = p_payment_id))) then
    v_blockers := v_blockers || jsonb_build_array('Related discrepancy requires separate review.');
  end if;
  if (select coalesce(sum(a.amount), 0) from public.payment_allocations a
    where a.payment_id = p_payment_id) <> v_payment.amount then
    v_blockers := v_blockers || jsonb_build_array('Existing Payment allocations do not reconcile to the Payment amount.');
  end if;
  if exists (select 1 from public.payment_allocations a join public.sales s on s.id = a.sale_id
    where a.payment_id = p_payment_id and (s.organization_id <> p_organization_id
      or s.customer_id <> v_payment.customer_id or s.status = 'voided')) then
    v_blockers := v_blockers || jsonb_build_array('Existing allocation ownership or Sale status is inconsistent.');
  end if;

  if v_mode = 'preserve' then
    if v_customer <> v_payment.customer_id or v_date <> v_payment.payment_date
      or v_amount <> v_payment.amount then
      v_blockers := v_blockers || jsonb_build_array('Changed Customer, date or amount requires FIFO or explicit manual reallocation.');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('saleId', value->>'saleId',
      'trustReceiptNumber', value->>'trustReceiptNumber', 'amount', (value->>'amount')::numeric)
      order by value->>'saleId'), '[]'::jsonb) into v_new_allocations
      from jsonb_array_elements(v_old_allocations) value;
  elsif v_mode = 'manual' then
    if jsonb_array_length(p_changes->'allocations') = 0
      or exists (select 1 from jsonb_array_elements(p_changes->'allocations') value
        where jsonb_typeof(value) is distinct from 'object'
          or exists (select 1 from jsonb_object_keys(value) k(key) where k.key not in ('saleId', 'amount'))
          or jsonb_typeof(value->'saleId') is distinct from 'string'
          or jsonb_typeof(value->'amount') is distinct from 'number') then
      raise exception 'Manual allocations require Sale IDs and amounts' using errcode = '22023';
    end if;
    if (select count(distinct value->>'saleId') from jsonb_array_elements(p_changes->'allocations') value)
      <> jsonb_array_length(p_changes->'allocations') then
      v_blockers := v_blockers || jsonb_build_array('Duplicate Sale allocations are not allowed.');
    end if;
    for v_item in select value from jsonb_array_elements(p_changes->'allocations') loop
      select * into v_sale from public.sales s where s.id = (v_item->>'saleId')::uuid
        and s.organization_id = p_organization_id and s.customer_id = v_customer
        and s.status <> 'voided' and s.sale_date <= v_date;
      if not found then
        v_blockers := v_blockers || jsonb_build_array('Allocation Sale is not eligible for this Customer and Payment date.');
        continue;
      end if;
      v_allocated := (v_item->>'amount')::numeric;
      if v_allocated <= 0 or v_allocated <> round(v_allocated, 2) then
        v_blockers := v_blockers || jsonb_build_array('Allocation amounts must be positive with two decimals.');
        continue;
      end if;
      select v_sale.net_sales - coalesce(sum(a.amount) filter (where p.voided_at is null), 0)
        into v_capacity from public.payment_allocations a
        join public.payments p on p.id = a.payment_id
        where a.sale_id = v_sale.id and a.payment_id <> p_payment_id;
      if v_allocated > v_capacity then
        v_blockers := v_blockers || jsonb_build_array('Allocation exceeds the selected Sale open balance.');
      end if;
      v_new_allocations := v_new_allocations || jsonb_build_array(jsonb_build_object(
        'saleId', v_sale.id, 'trustReceiptNumber', v_sale.trust_receipt_number, 'amount', v_allocated));
    end loop;
  else
    v_remaining := v_amount;
    for v_sale in select s.* from public.sales s where s.organization_id = p_organization_id
      and s.customer_id = v_customer and s.status <> 'voided' and s.sale_date <= v_date
      order by s.sale_date, s.created_at, s.id loop
      exit when v_remaining = 0;
      select v_sale.net_sales - coalesce(sum(a.amount) filter (where p.voided_at is null), 0)
        into v_capacity from public.payment_allocations a
        join public.payments p on p.id = a.payment_id
        where a.sale_id = v_sale.id and a.payment_id <> p_payment_id;
      if v_capacity < 0 then
        v_blockers := v_blockers || jsonb_build_array('Existing Sale allocations exceed its total. Review is required.');
      end if;
      v_allocated := least(v_remaining, greatest(v_capacity, 0));
      if v_allocated > 0 then
        v_new_allocations := v_new_allocations || jsonb_build_array(jsonb_build_object(
          'saleId', v_sale.id, 'trustReceiptNumber', v_sale.trust_receipt_number, 'amount', v_allocated));
        v_remaining := v_remaining - v_allocated;
      end if;
    end loop;
    if v_remaining > 0 then
      v_blockers := v_blockers || jsonb_build_array('Payment exceeds eligible Customer open balances.');
    end if;
  end if;
  if (select coalesce(sum((value->>'amount')::numeric), 0)
    from jsonb_array_elements(v_new_allocations) value) <> v_amount then
    v_blockers := v_blockers || jsonb_build_array('Proposed allocations must equal the Payment amount.');
  end if;
  select coalesce(jsonb_agg(value order by value->>'saleId'), '[]'::jsonb)
    into v_new_allocations from jsonb_array_elements(v_new_allocations) value;
  select coalesce(outstanding_balance, 0) into v_old_balance from public.customer_balances
    where organization_id = p_organization_id and customer_id = v_payment.customer_id;
  select coalesce(outstanding_balance, 0) into v_new_balance from public.customer_balances
    where organization_id = p_organization_id and customer_id = v_customer;
  if v_customer = v_payment.customer_id then
    if coalesce(v_old_balance, 0) + v_payment.amount - v_amount < 0 then
      v_blockers := v_blockers || jsonb_build_array('Corrected Payment would create a negative Customer balance.');
    end if;
  elsif coalesce(v_new_balance, 0) - v_amount < 0 then
    v_blockers := v_blockers || jsonb_build_array('Reassigned Payment would create a negative Customer balance.');
  end if;
  for v_item in select value from jsonb_array_elements(v_old_allocations || v_new_allocations) loop
    if not (v_affected @> jsonb_build_array(jsonb_build_object('type', 'sale', 'id', v_item->>'saleId'))) then
      v_affected := v_affected || jsonb_build_array(jsonb_build_object('type', 'sale', 'id', v_item->>'saleId'));
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_old_allocations) loop
    v_affected := v_affected || jsonb_build_array(jsonb_build_object('type', 'payment_allocation', 'id', v_item->>'id'));
  end loop;
  v_original := jsonb_build_object('paymentDate', v_payment.payment_date, 'customerId', v_payment.customer_id,
    'amount', v_payment.amount, 'method', v_payment.method, 'referenceNumber', v_payment.reference_number,
    'bankName', v_payment.bank_name, 'notes', v_payment.notes,
    'verificationStatus', v_payment.verification_status, 'allocations', v_old_allocations);
  v_proposed := jsonb_build_object('paymentDate', v_date, 'customerId', v_customer,
    'amount', v_amount, 'method', v_method, 'referenceNumber', v_reference,
    'bankName', v_bank, 'notes', v_notes,
    'verificationStatus', case when v_method = 'cash' then 'not_required' else 'pending' end,
    'allocations', v_new_allocations);
  if (v_original - 'allocations') = (v_proposed - 'allocations')
    and (select coalesce(jsonb_agg(jsonb_build_object('saleId', value->>'saleId',
      'amount', (value->>'amount')::numeric) order by value->>'saleId'), '[]'::jsonb)
      from jsonb_array_elements(v_old_allocations) value)
    = (select coalesce(jsonb_agg(jsonb_build_object('saleId', value->>'saleId',
      'amount', (value->>'amount')::numeric) order by value->>'saleId'), '[]'::jsonb)
      from jsonb_array_elements(v_new_allocations) value) then
    v_blockers := v_blockers || jsonb_build_array('Make at least one change before confirming.');
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) into v_sale_signature
    from public.sales s where s.organization_id = p_organization_id
      and s.customer_id in (v_payment.customer_id, v_customer);
  select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) into v_allocation_signature
    from public.payment_allocations a join public.sales s on s.id = a.sale_id
    where s.organization_id = p_organization_id
      and s.customer_id in (v_payment.customer_id, v_customer);
  return jsonb_build_object(
    'originalValues', v_original, 'proposedValues', v_proposed,
    'relatedDcrs', v_dcrs, 'affectedRecords', v_affected,
    'expectedFinancialChanges', jsonb_build_array(
      jsonb_build_object('type', 'payment', 'before', v_payment.amount, 'after', v_amount,
        'delta', v_amount - v_payment.amount),
      jsonb_build_object('type', 'customer_balance', 'customerId', v_payment.customer_id,
        'before', v_old_balance, 'after', v_old_balance + v_payment.amount
          - case when v_customer = v_payment.customer_id then v_amount else 0 end))
      || case when v_customer = v_payment.customer_id then '[]'::jsonb else
        jsonb_build_array(jsonb_build_object('type', 'customer_balance', 'customerId', v_customer,
          'before', v_new_balance, 'after', v_new_balance - v_amount)) end,
    'expectedInventoryChanges', '[]'::jsonb,
    'blockedReasons', v_blockers, 'eligible', jsonb_array_length(v_blockers) = 0,
    'versionToken', md5(jsonb_build_object('payment', to_jsonb(v_payment),
      'oldAllocations', v_old_allocations, 'sales', v_sale_signature,
      'allocations', v_allocation_signature, 'dcrs', v_dcrs,
      'oldBalance', v_old_balance, 'newBalance', v_new_balance)::text));
end;
$$;

create function public.preview_payment_correction(p_organization_id uuid, p_payment_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  return private.inspect_payment_correction(p_organization_id, p_payment_id, p_changes);
end;
$$;

create function public.apply_payment_correction(
  p_organization_id uuid, p_payment_id uuid, p_actor_user_id uuid,
  p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
  v_preview jsonb;
  v_old jsonb;
  v_new jsonb;
  v_item jsonb;
  v_affected jsonb;
  v_correction_id uuid := gen_random_uuid();
  v_allocation_id uuid;
  v_applied_allocations jsonb;
  v_date_key text;
  v_old_date_key text;
  v_new_date_key text;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id and p.active and m.organization_id = p_organization_id
      and m.role = 'owner_admin' and m.active for share of p, m;
  if not found then raise exception 'Active Owner / Admin authorization is required' using errcode = '42501'; end if;
  perform private.assert_correction_actor(p_organization_id, p_actor_user_id);
  select * into v_payment from public.payments
    where id = p_payment_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  perform 1 from public.sales s where s.organization_id = p_organization_id
    and s.customer_id in (v_payment.customer_id, (p_changes->>'customerId')::uuid)
    order by s.id for update;
  perform 1 from public.payment_allocations a where a.payment_id = p_payment_id
    order by a.id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 14902));
  if v_payment.salesman_user_id is not null then
    v_old_date_key := p_organization_id::text || ':' || v_payment.salesman_user_id::text
      || ':' || v_payment.payment_date::text;
    v_new_date_key := p_organization_id::text || ':' || v_payment.salesman_user_id::text
      || ':' || coalesce(p_changes->>'paymentDate', '');
    for v_date_key in select distinct value from (values (v_old_date_key), (v_new_date_key)) dates(value)
      order by value loop
      perform pg_advisory_xact_lock(hashtextextended(v_date_key, 0));
    end loop;
  end if;
  v_preview := private.inspect_payment_correction(p_organization_id, p_payment_id, p_changes);
  perform private.assert_correction_request(p_organization_id, p_actor_user_id, p_reason,
    p_request_id, p_expected_version, v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception '%', (select string_agg(value, ' ') from jsonb_array_elements_text(v_preview->'blockedReasons'))
      using errcode = '55000';
  end if;
  v_old := v_preview->'originalValues'; v_new := v_preview->'proposedValues';
  v_affected := v_preview->'affectedRecords';
  update public.payments set payment_date = (v_new->>'paymentDate')::date,
    customer_id = (v_new->>'customerId')::uuid, amount = (v_new->>'amount')::numeric,
    method = v_new->>'method', reference_number = v_new->>'referenceNumber',
    bank_name = v_new->>'bankName', notes = v_new->>'notes',
    verification_status = v_new->>'verificationStatus'
    where id = p_payment_id and organization_id = p_organization_id;
  delete from public.payment_allocations a where a.payment_id = p_payment_id
    and not exists (select 1 from jsonb_array_elements(v_new->'allocations') item
      where (item->>'saleId')::uuid = a.sale_id);
  for v_item in select value from jsonb_array_elements(v_new->'allocations') loop
    update public.payment_allocations set amount = (v_item->>'amount')::numeric
      where payment_id = p_payment_id and sale_id = (v_item->>'saleId')::uuid
      returning id into v_allocation_id;
    if not found then
      insert into public.payment_allocations (payment_id, sale_id, amount)
        values (p_payment_id, (v_item->>'saleId')::uuid, (v_item->>'amount')::numeric)
        returning id into v_allocation_id;
      v_affected := v_affected || jsonb_build_array(jsonb_build_object(
        'type', 'payment_allocation', 'id', v_allocation_id));
    end if;
  end loop;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where payment_id = p_payment_id)
      <> (v_new->>'amount')::numeric then
    raise exception 'Payment allocations failed reconciliation' using errcode = '55000';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'saleId', a.sale_id,
    'trustReceiptNumber', s.trust_receipt_number, 'amount', a.amount) order by s.sale_date, s.created_at, s.id), '[]'::jsonb)
    into v_applied_allocations from public.payment_allocations a
    join public.sales s on s.id = a.sale_id where a.payment_id = p_payment_id;
  v_new := jsonb_set(v_new, '{allocations}', v_applied_allocations);
  for v_item in select value from jsonb_array_elements(v_affected) loop
    if v_item->>'type' = 'sale' then
      if (select coalesce(sum(a.amount), 0) from public.payment_allocations a
        join public.payments p on p.id = a.payment_id
        where a.sale_id = (v_item->>'id')::uuid and p.voided_at is null)
        > (select net_sales from public.sales where id = (v_item->>'id')::uuid) then
        raise exception 'Corrected allocation exceeds Sale total' using errcode = '55000';
      end if;
      perform private.refresh_sale_status((v_item->>'id')::uuid);
    end if;
  end loop;
  if exists (select 1 from public.customer_balances b where b.organization_id = p_organization_id
    and b.customer_id in (v_payment.customer_id, (v_new->>'customerId')::uuid)
    and b.outstanding_balance < 0) then
    raise exception 'Corrected Customer balance failed reconciliation' using errcode = '55000';
  end if;
  insert into public.transaction_corrections (
    id, organization_id, module, transaction_id, transaction_reference, correction_action,
    admin_user_id, reason, original_values, proposed_values, applied_values,
    affected_record_ids, inventory_adjustments, financial_adjustments,
    status, version_token, request_id
  ) values (v_correction_id, p_organization_id, 'payment', p_payment_id,
    v_payment.payment_number, 'edit', p_actor_user_id, btrim(p_reason),
    v_old, v_new, v_new, v_affected, '[]'::jsonb,
    v_preview->'expectedFinancialChanges', 'applied', p_expected_version, p_request_id);
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (p_organization_id, p_actor_user_id, 'payment', p_payment_id, 'CORRECT_PAYMENT', v_old,
    jsonb_build_object('correction_id', v_correction_id, 'request_id', p_request_id,
      'applied', v_new, 'affected', v_affected));
  return jsonb_build_object('correctionId', v_correction_id, 'paymentId', p_payment_id,
    'financialChanges', v_preview->'expectedFinancialChanges');
end;
$$;

revoke all on function private.inspect_payment_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_payment_correction(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_payment_correction(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.preview_payment_correction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_payment_correction(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role;
