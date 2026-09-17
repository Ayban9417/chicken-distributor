-- Release-candidate hardening: isolate Salesman reads from cost-bearing tables,
-- make Expenses idempotent/auditable, and add indexes for the operational paths.

alter table public.expenses add column client_request_id uuid;
update public.expenses set client_request_id = gen_random_uuid() where client_request_id is null;
alter table public.expenses alter column client_request_id set not null;
create unique index expenses_org_request_key on public.expenses (organization_id, client_request_id);

drop policy if exists stock_trip_lines_select on public.stock_trip_lines;
create policy stock_trip_lines_select on public.stock_trip_lines for select to authenticated
using (exists (
  select 1 from public.stock_trips st
  where st.id = stock_trip_id
    and private.has_org_role(st.organization_id, array['owner_admin', 'warehouse'])
));

drop policy if exists inventory_lots_select on public.inventory_lots;
create policy inventory_lots_select on public.inventory_lots for select to authenticated
using (private.has_org_role(organization_id, array['owner_admin', 'warehouse']));

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
using (private.has_org_role(organization_id, array['owner_admin']));

drop policy if exists sale_lines_select on public.sale_lines;
create policy sale_lines_select on public.sale_lines for select to authenticated
using (exists (
  select 1 from public.sales s
  where s.id = sale_id
    and private.has_org_role(s.organization_id, array['owner_admin'])
));

drop policy if exists payroll_entries_select on public.payroll_entries;
create policy payroll_entries_select on public.payroll_entries for select to authenticated
using (exists (
  select 1 from public.payroll_periods pp
  where pp.id = payroll_period_id
    and private.has_org_role(pp.organization_id, array['owner_admin', 'payroll_admin'])
));

create function api.get_salesman_workspace(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['salesman']) then
    raise exception 'Salesman access is required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'stock', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select organization_id, salesman_user_id, salesman_name, inventory_lot_id,
        stock_trip_id, trip_number, trip_date, plant_id, plant_name, product_id,
        product_name, category, code_id, product_code, class_type_id, class_type,
        available_quantity_kg
      from public.salesman_stock_summary
      where organization_id = p_organization_id and salesman_user_id = v_actor
      order by trip_date desc, product_name
    ) x), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select l.id, l.stock_trip_line_id, l.original_quantity_kg
      from public.inventory_lots l
      where l.organization_id = p_organization_id
        and exists (
          select 1 from public.inventory_movements m
          where m.inventory_lot_id = l.id
            and (m.from_salesman_user_id = v_actor or m.to_salesman_user_id = v_actor)
        )
    ) x), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, organization_id, inventory_lot_id, movement_type, quantity_kg,
        from_location_type, from_salesman_user_id, to_location_type,
        to_salesman_user_id, reference_type, reference_id, reference_line_id,
        effective_date, notes, created_at
      from public.inventory_movements
      where organization_id = p_organization_id
        and (from_salesman_user_id = v_actor or to_salesman_user_id = v_actor)
      order by effective_date desc, created_at desc
    ) x), '[]'::jsonb),
    'transferReceipts', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, organization_id, receipt_number, from_salesman_user_id,
        to_salesman_user_id, created_at, notes
      from public.transfer_receipts
      where organization_id = p_organization_id
        and (from_salesman_user_id = v_actor or to_salesman_user_id = v_actor)
    ) x), '[]'::jsonb),
    'transferReceiptLines', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select trl.id, trl.receipt_id, trl.inventory_lot_id, trl.quantity_kg,
        trl.bags, trl.head_count, trl.created_at
      from public.transfer_receipt_lines trl
      join public.transfer_receipts tr on tr.id = trl.receipt_id
      where tr.organization_id = p_organization_id
        and (tr.from_salesman_user_id = v_actor or tr.to_salesman_user_id = v_actor)
    ) x), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, organization_id, trust_receipt_number, customer_id,
        salesman_user_id, sale_date, status, subtotal, gross_sales,
        sales_deductions, net_sales, notes, client_request_id, created_at, updated_at
      from public.sales
      where organization_id = p_organization_id and salesman_user_id = v_actor
      order by sale_date desc, created_at desc
    ) x), '[]'::jsonb),
    'saleLines', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select sl.id, sl.sale_id, sl.inventory_lot_id, sl.product_id, sl.code_id,
        sl.class_type_id, sl.quantity_kg, sl.selling_price_per_kg,
        sl.line_sales, sl.price_override, sl.default_price, sl.created_at
      from public.sale_lines sl
      join public.sales s on s.id = sl.sale_id
      where s.organization_id = p_organization_id and s.salesman_user_id = v_actor
    ) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, organization_id, payment_number, customer_id, salesman_user_id,
        payment_date, amount, method, reference_number, notes, verification_status,
        client_request_id, created_at, voided_at, void_reason
      from public.payments
      where organization_id = p_organization_id and salesman_user_id = v_actor
      order by payment_date desc, created_at desc
    ) x), '[]'::jsonb),
    'allocations', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select pa.id, pa.payment_id, pa.sale_id, pa.amount, pa.created_at
      from public.payment_allocations pa
      join public.payments p on p.id = pa.payment_id
      where p.organization_id = p_organization_id and p.salesman_user_id = v_actor
    ) x), '[]'::jsonb),
    'balances', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.organization_id, c.id as customer_id, c.name as customer_name,
        coalesce(sum(s.net_sales) filter (where s.status <> 'voided'), 0) as total_sales,
        coalesce(sum(a.paid_amount), 0) as total_payments,
        coalesce(sum(s.net_sales) filter (where s.status <> 'voided'), 0) - coalesce(sum(a.paid_amount), 0) as outstanding_balance
      from public.customers c
      left join public.sales s on s.customer_id = c.id and s.salesman_user_id = v_actor
      left join lateral (
        select coalesce(sum(pa.amount), 0) as paid_amount
        from public.payment_allocations pa
        join public.payments p on p.id = pa.payment_id and p.voided_at is null
        where pa.sale_id = s.id
      ) a on true
      where c.organization_id = p_organization_id
      group by c.organization_id, c.id, c.name
    ) x), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select s.organization_id, s.customer_id, s.sale_date as entry_date,
        s.created_at, 'sale'::text as entry_type, s.id as entry_id,
        s.trust_receipt_number as reference_number, s.net_sales as debit, 0::numeric as credit
      from public.sales s
      where s.organization_id = p_organization_id and s.salesman_user_id = v_actor and s.status <> 'voided'
      union all
      select p.organization_id, p.customer_id, p.payment_date, p.created_at,
        'payment'::text, p.id, p.payment_number, 0::numeric, p.amount
      from public.payments p
      where p.organization_id = p_organization_id and p.salesman_user_id = v_actor and p.voided_at is null
      order by entry_date, created_at
    ) x), '[]'::jsonb),
    'collectibles', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select s.organization_id, s.id as sale_id, s.customer_id, c.name as customer_name,
        s.salesman_user_id, s.sale_date, s.trust_receipt_number, s.net_sales,
        greatest(s.net_sales - coalesce(a.paid_amount, 0), 0) as outstanding_balance,
        c.payment_terms_days,
        case when c.payment_terms_days is null then null else s.sale_date + c.payment_terms_days end as due_date
      from public.sales s
      join public.customers c on c.id = s.customer_id
      left join lateral (
        select coalesce(sum(pa.amount), 0) as paid_amount
        from public.payment_allocations pa
        join public.payments p on p.id = pa.payment_id and p.voided_at is null
        where pa.sale_id = s.id
      ) a on true
      where s.organization_id = p_organization_id and s.salesman_user_id = v_actor
        and s.status <> 'voided' and s.net_sales - coalesce(a.paid_amount, 0) > 0
      order by s.sale_date
    ) x), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, organization_id, salesman_user_id, expense_date, category, amount,
        payment_source, description, approval_status, client_request_id, created_at, updated_at
      from public.expenses
      where organization_id = p_organization_id and salesman_user_id = v_actor
      order by expense_date desc, created_at desc
    ) x), '[]'::jsonb),
    'dcrs', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.daily_cash_reports
      where organization_id = p_organization_id and salesman_user_id = v_actor
      order by report_date desc
    ) x), '[]'::jsonb),
    'discrepancies', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.discrepancies
      where organization_id = p_organization_id and salesman_user_id = v_actor
      order by created_at desc
    ) x), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.customers where organization_id = p_organization_id order by name
    ) x), '[]'::jsonb),
    'prices', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select cp.* from public.customer_prices cp
      join public.customers c on c.id = cp.customer_id
      where c.organization_id = p_organization_id and cp.active
    ) x), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, organization_id, name, category, active from public.products
      where organization_id = p_organization_id
    ) x), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select m.user_id, m.role, m.active, p.id, p.full_name, p.active as profile_active,
        p.must_change_password
      from public.organization_memberships m
      join public.profiles p on p.id = m.user_id
      where m.organization_id = p_organization_id and m.active and p.active
    ) x), '[]'::jsonb),
    'tripLines', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select stl.id, stl.stock_trip_id
      from public.stock_trip_lines stl
      join public.inventory_lots l on l.stock_trip_line_id = stl.id
      where l.organization_id = p_organization_id
        and exists (select 1 from public.inventory_movements m where m.inventory_lot_id = l.id and (m.from_salesman_user_id = v_actor or m.to_salesman_user_id = v_actor))
    ) x), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select distinct st.id, st.trip_number, st.trip_date, st.plant_id
      from public.stock_trips st
      join public.stock_trip_lines stl on stl.stock_trip_id = st.id
      join public.inventory_lots l on l.stock_trip_line_id = stl.id
      where st.organization_id = p_organization_id
        and exists (select 1 from public.inventory_movements m where m.inventory_lot_id = l.id and (m.from_salesman_user_id = v_actor or m.to_salesman_user_id = v_actor))
    ) x), '[]'::jsonb),
    'plants', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, name from public.plants where organization_id = p_organization_id
    ) x), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select pc.id, pc.code, pc.display_name
      from public.plant_product_codes pc
      join public.plant_products pp on pp.id = pc.plant_product_id
      join public.plants p on p.id = pp.plant_id
      where p.organization_id = p_organization_id
    ) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select ct.id, ct.class_type, ct.display_name
      from public.plant_product_class_types ct
      join public.plant_products pp on pp.id = ct.plant_product_id
      join public.plants p on p.id = pp.plant_id
      where p.organization_id = p_organization_id
    ) x), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create function public.get_salesman_workspace(p_organization_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select api.get_salesman_workspace($1) $$;

revoke all on function api.get_salesman_workspace(uuid) from public, anon;
revoke all on function public.get_salesman_workspace(uuid) from public, anon;
grant execute on function api.get_salesman_workspace(uuid) to authenticated;
grant execute on function public.get_salesman_workspace(uuid) to authenticated;

create function api.record_expense(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_expense_date date,
  p_category text,
  p_amount numeric,
  p_payment_source text,
  p_client_request_id uuid,
  p_description text default null,
  p_approval_status text default 'approved'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense public.expenses;
begin
  if v_actor is null or not (
    private.has_org_role(p_organization_id, array['owner_admin'])
    or (v_actor = p_salesman_user_id and private.has_org_role(p_organization_id, array['salesman']))
  ) then
    raise exception 'Not authorized to record this Expense' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be positive' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_category, ''))) = 0 then
    raise exception 'Expense category is required' using errcode = '22023';
  end if;

  select * into v_expense from public.expenses
  where organization_id = p_organization_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_expense.id, 'idempotent_replay', true);
  end if;

  insert into public.expenses (
    organization_id, salesman_user_id, expense_date, category, amount,
    payment_source, description, approval_status, created_by, client_request_id
  ) values (
    p_organization_id, p_salesman_user_id, p_expense_date, btrim(p_category), p_amount,
    p_payment_source, nullif(btrim(p_description), ''), p_approval_status, v_actor, p_client_request_id
  ) returning * into v_expense;

  return jsonb_build_object('id', v_expense.id, 'idempotent_replay', false);
end;
$$;

create function public.record_expense(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_expense_date date,
  p_category text,
  p_amount numeric,
  p_payment_source text,
  p_client_request_id uuid,
  p_description text default null,
  p_approval_status text default 'approved'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select api.record_expense($1, $2, $3, $4, $5, $6, $7, $8, $9) $$;

revoke all on function api.record_expense(uuid, uuid, date, text, numeric, text, uuid, text, text) from public, anon;
revoke all on function public.record_expense(uuid, uuid, date, text, numeric, text, uuid, text, text) from public, anon;
grant execute on function api.record_expense(uuid, uuid, date, text, numeric, text, uuid, text, text) to authenticated;
grant execute on function public.record_expense(uuid, uuid, date, text, numeric, text, uuid, text, text) to authenticated;

create function private.audit_release_candidate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org uuid;
  v_id uuid := (v_row->>'id')::uuid;
begin
  if tg_table_name in ('plants', 'products', 'customers', 'expenses') then
    v_org := (v_row->>'organization_id')::uuid;
  elsif tg_table_name = 'customer_prices' then
    select organization_id into v_org from public.customers where id = (v_row->>'customer_id')::uuid;
  elsif tg_table_name in ('plant_product_codes', 'plant_product_class_types') then
    select p.organization_id into v_org
    from public.plant_products pp join public.plants p on p.id = pp.plant_id
    where pp.id = (v_row->>'plant_product_id')::uuid;
  elsif tg_table_name = 'plant_products' then
    select organization_id into v_org from public.plants where id = (v_row->>'plant_id')::uuid;
  end if;

  if v_org is not null then
    insert into public.audit_events (
      organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      v_org, auth.uid(), tg_table_name, v_id, lower(tg_op),
      case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'plants', 'products', 'plant_products', 'plant_product_codes',
    'plant_product_class_types', 'customers', 'customer_prices', 'expenses'
  ] loop
    execute format('drop trigger if exists audit_release_candidate_change on public.%I', v_table);
    execute format(
      'create trigger audit_release_candidate_change after insert or update or delete on public.%I for each row execute function private.audit_release_candidate_change()',
      v_table
    );
  end loop;
end;
$$;

revoke all on function private.audit_release_candidate_change() from public, anon, authenticated;

create table private.login_rate_limits (
  identifier_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now()
);
revoke all on table private.login_rate_limits from public, anon, authenticated;
create index login_rate_limits_window_idx on private.login_rate_limits (window_started_at);

create function public.consume_login_rate_limit(
  p_identifier_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if length(coalesce(p_identifier_hash, '')) <> 64
     or p_max_attempts not between 1 and 100
     or p_window_seconds not between 30 and 3600 then
    return false;
  end if;

  insert into private.login_rate_limits (identifier_hash, window_started_at, attempt_count, updated_at)
  values (p_identifier_hash, now(), 1, now())
  on conflict (identifier_hash) do update
  set window_started_at = case
        when private.login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then now()
        else private.login_rate_limits.window_started_at
      end,
      attempt_count = case
        when private.login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then 1
        else private.login_rate_limits.attempt_count + 1
      end,
      updated_at = now()
  returning attempt_count into v_count;

  delete from private.login_rate_limits
  where window_started_at < now() - interval '1 day';
  return v_count <= p_max_attempts;
end;
$$;

create function public.clear_login_rate_limit(p_identifier_hash text)
returns void
language sql
security definer
set search_path = ''
as $$ delete from private.login_rate_limits where identifier_hash = $1 $$;

revoke all on function public.consume_login_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_login_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_login_rate_limit(text, integer, integer) to service_role;
grant execute on function public.clear_login_rate_limit(text) to service_role;

create index if not exists inventory_movements_org_from_salesman_date_idx on public.inventory_movements (organization_id, from_salesman_user_id, effective_date desc) where from_salesman_user_id is not null;
create index if not exists inventory_movements_org_to_salesman_date_idx on public.inventory_movements (organization_id, to_salesman_user_id, effective_date desc) where to_salesman_user_id is not null;
create index if not exists sales_org_salesman_date_idx on public.sales (organization_id, salesman_user_id, sale_date desc);
create index if not exists sale_lines_product_idx on public.sale_lines (product_id);
create index if not exists payments_org_salesman_date_idx on public.payments (organization_id, salesman_user_id, payment_date desc) where voided_at is null;
create index if not exists expenses_org_salesman_date_idx on public.expenses (organization_id, salesman_user_id, expense_date desc);
create index if not exists discrepancies_org_salesman_created_idx on public.discrepancies (organization_id, salesman_user_id, created_at desc);

comment on function public.get_salesman_workspace(uuid) is
  'Salesman-safe read model. Exposes operational quantities and selling data without acquisition cost, valuation, company profit, or another Salesman financial records.';
comment on function public.record_expense(uuid, uuid, date, text, numeric, text, uuid, text, text) is
  'Idempotent Expense command authorized for Owner/Admin or the acting Salesman.';
