-- The client has no operational Cashier role. Keep the historical text value for
-- compatibility, but deactivate it and prevent it from being assigned as active.
update public.organization_memberships
set active = false
where role = 'cashier' and active;

drop policy if exists memberships_insert on public.organization_memberships;
drop policy if exists memberships_update on public.organization_memberships;
create policy memberships_insert on public.organization_memberships for insert to authenticated
with check (
  private.has_org_role(organization_id, array['owner_admin'])
  and (role <> 'cashier' or active = false)
);
create policy memberships_update on public.organization_memberships for update to authenticated
using (private.has_org_role(organization_id, array['owner_admin']))
with check (
  private.has_org_role(organization_id, array['owner_admin'])
  and (role <> 'cashier' or active = false)
);
comment on column public.organization_memberships.role is
  'Operational values are owner_admin, warehouse, salesman, and payroll_admin. cashier is retained only as an inactive legacy value.';

-- Preserve the validated transaction implementations as non-callable cores, then
-- put the clarified role checks at the API boundary used by PostgREST wrappers.
alter function api.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) set schema private;
alter function private.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) rename to create_stock_trip_authorized_core;
revoke all on function private.create_stock_trip_authorized_core(uuid, uuid, date, jsonb, uuid, text, text, text) from public, anon, authenticated;

create function api.create_stock_trip(
  p_organization_id uuid,
  p_plant_id uuid,
  p_trip_date date,
  p_lines jsonb,
  p_client_request_id uuid,
  p_reference_number text default null,
  p_delivery_note text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Only the Owner / Admin can receive stock' using errcode = '42501';
  end if;
  return private.create_stock_trip_authorized_core(
    p_organization_id, p_plant_id, p_trip_date, p_lines, p_client_request_id,
    p_reference_number, p_delivery_note, p_notes
  );
end;
$$;

alter function api.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) set schema private;
alter function private.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) rename to record_payment_authorized_core;
revoke all on function private.record_payment_authorized_core(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) from public, anon, authenticated;

create function api.record_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_client_request_id uuid,
  p_salesman_user_id uuid default null,
  p_reference_number text default null,
  p_notes text default null,
  p_target_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    private.has_org_role(p_organization_id, array['owner_admin'])
    or (v_actor = p_salesman_user_id and private.has_org_role(p_organization_id, array['salesman']))
  ) then
    raise exception 'Not authorized to record this Payment' using errcode = '42501';
  end if;
  return private.record_payment_authorized_core(
    p_organization_id, p_customer_id, p_payment_date, p_amount, p_method,
    p_client_request_id, p_salesman_user_id, p_reference_number, p_notes, p_target_sale_id
  );
end;
$$;

alter function api.submit_dcr(uuid, uuid, date, numeric, uuid, text) set schema private;
alter function private.submit_dcr(uuid, uuid, date, numeric, uuid, text) rename to submit_dcr_authorized_core;
revoke all on function private.submit_dcr_authorized_core(uuid, uuid, date, numeric, uuid, text) from public, anon, authenticated;

create function api.submit_dcr(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_report_date date,
  p_actual_cash_remittance numeric,
  p_client_request_id uuid,
  p_explanation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    private.has_org_role(p_organization_id, array['owner_admin'])
    or (v_actor = p_salesman_user_id and private.has_org_role(p_organization_id, array['salesman']))
  ) then
    raise exception 'Not authorized to submit this DCR' using errcode = '42501';
  end if;
  return private.submit_dcr_authorized_core(
    p_organization_id, p_salesman_user_id, p_report_date,
    p_actual_cash_remittance, p_client_request_id, p_explanation
  );
end;
$$;

revoke all on function api.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) from public, anon;
revoke all on function api.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) from public, anon;
revoke all on function api.submit_dcr(uuid, uuid, date, numeric, uuid, text) from public, anon;
grant execute on function api.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) to authenticated;
grant execute on function api.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) to authenticated;
grant execute on function api.submit_dcr(uuid, uuid, date, numeric, uuid, text) to authenticated;

-- Recompile the public wrappers against the corrected API functions.
create or replace function public.create_stock_trip(
  p_organization_id uuid,
  p_plant_id uuid,
  p_trip_date date,
  p_lines jsonb,
  p_client_request_id uuid,
  p_reference_number text default null,
  p_delivery_note text default null,
  p_notes text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select api.create_stock_trip($1, $2, $3, $4, $5, $6, $7, $8) $$;

create or replace function public.record_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_client_request_id uuid,
  p_salesman_user_id uuid default null,
  p_reference_number text default null,
  p_notes text default null,
  p_target_sale_id uuid default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select api.record_payment($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) $$;

create or replace function public.submit_dcr(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_report_date date,
  p_actual_cash_remittance numeric,
  p_client_request_id uuid,
  p_explanation text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select api.submit_dcr($1, $2, $3, $4, $5, $6) $$;

revoke all on function public.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) from public, anon;
revoke all on function public.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) from public, anon;
revoke all on function public.submit_dcr(uuid, uuid, date, numeric, uuid, text) from public, anon;
grant execute on function public.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) to authenticated;
grant execute on function public.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.submit_dcr(uuid, uuid, date, numeric, uuid, text) to authenticated;

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for all to authenticated
using (private.has_org_role(organization_id, array['owner_admin']))
with check (private.has_org_role(organization_id, array['owner_admin']));

drop policy if exists customer_prices_write on public.customer_prices;
create policy customer_prices_write on public.customer_prices for all to authenticated
using (exists (
  select 1 from public.customers c
  where c.id = customer_id and private.has_org_role(c.organization_id, array['owner_admin'])
))
with check (exists (
  select 1 from public.customers c
  where c.id = customer_id and private.has_org_role(c.organization_id, array['owner_admin'])
));

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin'])
  or (salesman_user_id = auth.uid() and private.has_org_role(organization_id, array['salesman']))
);

drop policy if exists sale_lines_select on public.sale_lines;
create policy sale_lines_select on public.sale_lines for select to authenticated
using (exists (
  select 1 from public.sales s
  where s.id = sale_id and (
    private.has_org_role(s.organization_id, array['owner_admin'])
    or (s.salesman_user_id = auth.uid() and private.has_org_role(s.organization_id, array['salesman']))
  )
));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin'])
  or (salesman_user_id = auth.uid() and private.has_org_role(organization_id, array['salesman']))
);

drop policy if exists payment_allocations_select on public.payment_allocations;
create policy payment_allocations_select on public.payment_allocations for select to authenticated
using (exists (
  select 1 from public.payments p
  where p.id = payment_id and (
    private.has_org_role(p.organization_id, array['owner_admin'])
    or (p.salesman_user_id = auth.uid() and private.has_org_role(p.organization_id, array['salesman']))
  )
));

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin'])
  or (salesman_user_id = auth.uid() and private.has_org_role(organization_id, array['salesman']))
);

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
with check (
  created_by = auth.uid() and (
    private.has_org_role(organization_id, array['owner_admin'])
    or (salesman_user_id = auth.uid() and private.has_org_role(organization_id, array['salesman']))
  )
);

drop policy if exists expenses_admin_update on public.expenses;
create policy expenses_admin_update on public.expenses for update to authenticated
using (private.has_org_role(organization_id, array['owner_admin']))
with check (private.has_org_role(organization_id, array['owner_admin']));

drop policy if exists dcr_select on public.daily_cash_reports;
create policy dcr_select on public.daily_cash_reports for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin'])
  or (salesman_user_id = auth.uid() and private.has_org_role(organization_id, array['salesman']))
);

drop policy if exists discrepancies_select on public.discrepancies;
create policy discrepancies_select on public.discrepancies for select to authenticated
using (
  private.has_org_role(organization_id, array['owner_admin'])
  or (salesman_user_id = auth.uid() and private.has_org_role(organization_id, array['salesman']))
);
