-- Additive fields retain historical customer and payment records unchanged.
alter table public.customers
  add column additional_phones text[] not null default '{}'::text[];

alter table public.payments
  add column bank_name text;

alter table public.payments
  drop constraint payments_electronic_reference_check;
alter table public.payments
  add constraint payments_gcash_reference_check
  check (method <> 'gcash' or length(btrim(coalesce(reference_number, ''))) > 0);

create or replace function private.flag_post_dcr_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_salesman uuid;
  v_date date;
  v_entity_id uuid;
  v_dcr_id uuid;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'payments'
     and to_jsonb(new) - 'bank_name' - 'reference_number'
         = to_jsonb(old) - 'bank_name' - 'reference_number' then
    return new;
  end if;
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_salesman := old.salesman_user_id;
    v_entity_id := old.id;
    if tg_table_name = 'payments' then v_date := old.payment_date; else v_date := old.expense_date; end if;
  else
    v_org := new.organization_id;
    v_salesman := new.salesman_user_id;
    v_entity_id := new.id;
    if tg_table_name = 'payments' then v_date := new.payment_date; else v_date := new.expense_date; end if;
  end if;
  if v_salesman is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select id into v_dcr_id from public.daily_cash_reports
  where organization_id = v_org and salesman_user_id = v_salesman
    and report_date = v_date and status = 'locked';
  if found then
    insert into public.discrepancies (
      organization_id, type, severity, related_entity_type, related_entity_id,
      salesman_user_id, description
    ) values (
      v_org, 'post_dcr_adjustment', 'high', tg_table_name, v_entity_id, v_salesman,
      format('%s %s changed after DCR %s was locked.', initcap(tg_table_name), tg_op, v_dcr_id)
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Delegate authorization, allocation, and idempotency to the existing payment RPC.
-- The legacy core requires a nonempty bank reference, so the bank name is supplied
-- only inside this transaction and moved to its proper column before commit.
create function api.record_bank_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_client_request_id uuid,
  p_salesman_user_id uuid,
  p_reference_number text,
  p_notes text,
  p_target_sale_id uuid,
  p_bank_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_payment public.payments%rowtype;
  v_bank_name text := nullif(btrim(p_bank_name), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_method <> 'bank' or v_bank_name is null or nullif(btrim(p_reference_number), '') is not null then
    raise exception 'Select a bank without a bank reference number' using errcode = '22023';
  end if;

  v_result := api.record_payment(
    p_organization_id, p_customer_id, p_payment_date, p_amount, p_method,
    p_client_request_id, p_salesman_user_id, v_bank_name, p_notes, p_target_sale_id
  );
  select * into v_payment from public.payments
  where id = (v_result->>'id')::uuid and organization_id = p_organization_id
  for update;
  if not found or v_payment.method <> 'bank' or v_payment.customer_id <> p_customer_id then
    raise exception 'Bank Payment mismatch' using errcode = '22023';
  end if;
  if (v_result->>'idempotent_replay')::boolean then
    if v_payment.bank_name is distinct from v_bank_name then
      raise exception 'Bank Payment replay does not match the original' using errcode = '22023';
    end if;
  else
    update public.payments set bank_name = v_bank_name, reference_number = null
    where id = v_payment.id;
  end if;
  return v_result;
end;
$$;

create function public.record_bank_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_client_request_id uuid,
  p_salesman_user_id uuid,
  p_reference_number text,
  p_notes text,
  p_target_sale_id uuid,
  p_bank_name text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select api.record_bank_payment($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
$$;

-- The Sale and its initial bank Payment remain one atomic operation.
create function api.create_sale_with_bank_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_salesman_user_id uuid,
  p_sale_date date,
  p_trust_receipt_number text,
  p_lines jsonb,
  p_client_request_id uuid,
  p_sales_deductions numeric,
  p_notes text,
  p_initial_payment jsonb,
  p_bank_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_payment public.payments%rowtype;
  v_bank_name text := nullif(btrim(p_bank_name), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_bank_name is null or p_initial_payment->>'method' <> 'bank'
     or coalesce((p_initial_payment->>'amount')::numeric, 0) <= 0
     or nullif(btrim(p_initial_payment->>'reference_number'), '') is not null
     or nullif(p_initial_payment->>'client_request_id', '') is null then
    raise exception 'Initial bank Payment requires a bank and positive amount, without a reference number' using errcode = '22023';
  end if;

  v_result := api.create_sale(
    p_organization_id, p_customer_id, p_salesman_user_id, p_sale_date,
    p_trust_receipt_number, p_lines, p_client_request_id, p_sales_deductions,
    p_notes, jsonb_set(p_initial_payment, '{reference_number}', to_jsonb(v_bank_name), true)
  );
  select p.* into v_payment from public.payments p
  join public.payment_allocations a on a.payment_id = p.id
  where p.organization_id = p_organization_id
    and p.client_request_id = (p_initial_payment->>'client_request_id')::uuid
    and a.sale_id = (v_result->>'id')::uuid
  for update of p;
  if not found or v_payment.method <> 'bank' or v_payment.customer_id <> p_customer_id then
    raise exception 'Initial bank Payment mismatch' using errcode = '22023';
  end if;
  if (v_result->>'idempotent_replay')::boolean then
    if v_payment.bank_name is distinct from v_bank_name then
      raise exception 'Bank Sale replay does not match the original' using errcode = '22023';
    end if;
  else
    update public.payments set bank_name = v_bank_name, reference_number = null
    where id = v_payment.id;
  end if;
  return v_result;
end;
$$;

create function public.create_sale_with_bank_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_salesman_user_id uuid,
  p_sale_date date,
  p_trust_receipt_number text,
  p_lines jsonb,
  p_client_request_id uuid,
  p_sales_deductions numeric,
  p_notes text,
  p_initial_payment jsonb,
  p_bank_name text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select api.create_sale_with_bank_payment($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
$$;

revoke all on function api.record_bank_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid, text) from public, anon;
revoke all on function public.record_bank_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid, text) from public, anon;
revoke all on function api.create_sale_with_bank_payment(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb, text) from public, anon;
revoke all on function public.create_sale_with_bank_payment(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb, text) from public, anon;
grant execute on function api.record_bank_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid, text) to authenticated;
grant execute on function public.record_bank_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid, text) to authenticated;
grant execute on function api.create_sale_with_bank_payment(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb, text) to authenticated;
grant execute on function public.create_sale_with_bank_payment(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb, text) to authenticated;
