-- Chicken Distributor backend foundation: normalized records and immutable ledgers.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
create schema if not exists api;
revoke all on schema private from public, anon, authenticated;
revoke all on schema api from public, anon;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_key unique (slug)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('owner_admin', 'salesman', 'cashier', 'warehouse', 'payroll_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_org_user_key unique (organization_id, user_id)
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  short_code text not null check (length(btrim(short_code)) > 0),
  accent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plants_org_name_key on public.plants (organization_id, lower(name));
create unique index plants_org_short_code_key on public.plants (organization_id, lower(short_code));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  category text not null check (category in ('whole_chicken', 'by_product', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_org_name_key on public.products (organization_id, lower(name));

create table public.plant_products (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  uses_size_codes boolean not null default false,
  uses_class_types boolean not null default false,
  uses_bags boolean not null default false,
  uses_head_count boolean not null default false,
  allows_free_from_plant boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plant_products_plant_product_key unique (plant_id, product_id)
);

create table public.plant_product_codes (
  id uuid primary key default gen_random_uuid(),
  plant_product_id uuid not null references public.plant_products(id) on delete restrict,
  code text not null check (length(btrim(code)) > 0),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plant_product_codes_value_key on public.plant_product_codes (plant_product_id, lower(code));

create table public.plant_product_class_types (
  id uuid primary key default gen_random_uuid(),
  plant_product_id uuid not null references public.plant_products(id) on delete restrict,
  class_type text not null check (length(btrim(class_type)) > 0),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plant_product_class_types_value_key on public.plant_product_class_types (plant_product_id, lower(class_type));

create table public.stock_trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plant_id uuid not null references public.plants(id) on delete restrict,
  trip_number text not null check (length(btrim(trip_number)) > 0),
  trip_date date not null,
  reference_number text,
  delivery_note text,
  notes text,
  status text not null default 'received' check (status in ('draft', 'received', 'cancelled')),
  client_request_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_trips_org_trip_number_key unique (organization_id, trip_number),
  constraint stock_trips_org_client_request_key unique (organization_id, client_request_id)
);

create table public.stock_trip_lines (
  id uuid primary key default gen_random_uuid(),
  stock_trip_id uuid not null references public.stock_trips(id) on delete restrict,
  plant_product_id uuid not null references public.plant_products(id) on delete restrict,
  code_id uuid references public.plant_product_codes(id) on delete restrict,
  class_type_id uuid references public.plant_product_class_types(id) on delete restrict,
  bags integer check (bags is null or bags >= 0),
  head_count integer check (head_count is null or head_count >= 0),
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  acquisition_type text not null check (acquisition_type in ('purchased', 'free_from_plant')),
  cost_per_kg numeric(14,2) not null check (cost_per_kg >= 0),
  total_acquisition_cost numeric(16,2) generated always as (round(quantity_kg * cost_per_kg, 2)) stored,
  created_at timestamptz not null default now(),
  constraint stock_trip_lines_acquisition_cost_check check (
    (acquisition_type = 'free_from_plant' and cost_per_kg = 0)
    or (acquisition_type = 'purchased' and cost_per_kg > 0)
  )
);
create unique index stock_trip_lines_identity_key on public.stock_trip_lines
  (stock_trip_id, plant_product_id, coalesce(code_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(class_type_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  stock_trip_line_id uuid not null references public.stock_trip_lines(id) on delete restrict,
  plant_id uuid not null references public.plants(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  code_id uuid references public.plant_product_codes(id) on delete restrict,
  class_type_id uuid references public.plant_product_class_types(id) on delete restrict,
  cost_per_kg numeric(14,2) not null check (cost_per_kg >= 0),
  original_quantity_kg numeric(14,3) not null check (original_quantity_kg > 0),
  created_at timestamptz not null default now(),
  constraint inventory_lots_stock_trip_line_key unique (stock_trip_line_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  inventory_lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  movement_type text not null check (movement_type in ('stock_in', 'warehouse_to_salesman', 'salesman_to_salesman', 'sale', 'adjustment_in', 'adjustment_out', 'void_reversal')),
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  from_location_type text not null check (from_location_type in ('plant', 'warehouse', 'salesman', 'customer', 'adjustment')),
  from_salesman_user_id uuid references public.profiles(id) on delete restrict,
  to_location_type text not null check (to_location_type in ('plant', 'warehouse', 'salesman', 'customer', 'adjustment')),
  to_salesman_user_id uuid references public.profiles(id) on delete restrict,
  reference_type text not null,
  reference_id uuid not null,
  reference_line_id uuid not null,
  effective_date date not null,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movements_from_salesman_check check ((from_location_type = 'salesman') = (from_salesman_user_id is not null)),
  constraint inventory_movements_to_salesman_check check ((to_location_type = 'salesman') = (to_salesman_user_id is not null)),
  constraint inventory_movements_distinct_custody_check check (
    from_location_type <> to_location_type
    or coalesce(from_salesman_user_id::text, '') <> coalesce(to_salesman_user_id::text, '')
  ),
  constraint inventory_movements_reference_line_key unique (organization_id, movement_type, reference_line_id)
);

create table private.document_sequences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_type text not null check (document_type in ('ST', 'RR', 'TF', 'PAY')),
  last_value bigint not null default 0 check (last_value >= 0),
  primary key (organization_id, document_type)
);

create table public.receiving_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  receipt_number text not null,
  salesman_user_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  notes text,
  constraint receiving_receipts_org_number_key unique (organization_id, receipt_number),
  constraint receiving_receipts_org_request_key unique (organization_id, client_request_id)
);

create table public.receiving_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receiving_receipts(id) on delete restrict,
  inventory_lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  bags integer check (bags is null or bags >= 0),
  head_count integer check (head_count is null or head_count >= 0),
  created_at timestamptz not null default now(),
  constraint receiving_receipt_lines_lot_key unique (receipt_id, inventory_lot_id)
);

create table public.transfer_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  receipt_number text not null,
  from_salesman_user_id uuid not null references public.profiles(id) on delete restrict,
  to_salesman_user_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  notes text,
  constraint transfer_receipts_different_salesmen_check check (from_salesman_user_id <> to_salesman_user_id),
  constraint transfer_receipts_org_number_key unique (organization_id, receipt_number),
  constraint transfer_receipts_org_request_key unique (organization_id, client_request_id)
);

create table public.transfer_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.transfer_receipts(id) on delete restrict,
  inventory_lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  bags integer check (bags is null or bags >= 0),
  head_count integer check (head_count is null or head_count >= 0),
  created_at timestamptz not null default now(),
  constraint transfer_receipt_lines_lot_key unique (receipt_id, inventory_lot_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  contact_person text,
  mobile text,
  address text,
  customer_type text not null default 'other',
  payment_type text not null default 'cash' check (payment_type in ('cash', 'credit', 'cash_credit')),
  credit_limit numeric(16,2) check (credit_limit is null or credit_limit >= 0),
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_prices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  code_id uuid references public.plant_product_codes(id) on delete restrict,
  class_type_id uuid references public.plant_product_class_types(id) on delete restrict,
  selling_price_per_kg numeric(14,2) not null check (selling_price_per_kg >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_prices_active_identity_key on public.customer_prices
  (customer_id, product_id, coalesce(code_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(class_type_id, '00000000-0000-0000-0000-000000000000'::uuid)) where active;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  trust_receipt_number text not null check (length(btrim(trust_receipt_number)) > 0),
  customer_id uuid not null references public.customers(id) on delete restrict,
  salesman_user_id uuid not null references public.profiles(id) on delete restrict,
  sale_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'partially_paid', 'paid', 'voided')),
  subtotal numeric(16,2) not null check (subtotal >= 0),
  gross_sales numeric(16,2) not null check (gross_sales >= 0),
  sales_deductions numeric(16,2) not null default 0 check (sales_deductions >= 0),
  net_sales numeric(16,2) not null check (net_sales >= 0),
  total_cogs numeric(16,2) not null check (total_cogs >= 0),
  gross_profit numeric(16,2) generated always as (net_sales - total_cogs) stored,
  notes text,
  client_request_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_amounts_reconcile_check check (gross_sales = subtotal and net_sales = gross_sales - sales_deductions),
  constraint sales_org_request_key unique (organization_id, client_request_id)
);
create unique index sales_org_trust_receipt_key on public.sales (organization_id, lower(btrim(trust_receipt_number)));

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  inventory_lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  code_id uuid references public.plant_product_codes(id) on delete restrict,
  class_type_id uuid references public.plant_product_class_types(id) on delete restrict,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  selling_price_per_kg numeric(14,2) not null check (selling_price_per_kg >= 0),
  acquisition_cost_per_kg numeric(14,2) not null check (acquisition_cost_per_kg >= 0),
  line_sales numeric(16,2) not null check (line_sales >= 0),
  line_cogs numeric(16,2) not null check (line_cogs >= 0),
  line_gross_profit numeric(16,2) generated always as (line_sales - line_cogs) stored,
  price_override boolean not null default false,
  default_price numeric(14,2) check (default_price is null or default_price >= 0),
  created_at timestamptz not null default now(),
  constraint sale_lines_lot_key unique (sale_id, inventory_lot_id),
  constraint sale_lines_sales_check check (line_sales = round(quantity_kg * selling_price_per_kg, 2)),
  constraint sale_lines_cogs_check check (line_cogs = round(quantity_kg * acquisition_cost_per_kg, 2))
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_number text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  salesman_user_id uuid references public.profiles(id) on delete restrict,
  payment_date date not null,
  amount numeric(16,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'gcash', 'bank')),
  reference_number text,
  notes text,
  verification_status text not null check (verification_status in ('not_required', 'pending', 'verified', 'rejected')),
  client_request_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete restrict,
  void_reason text,
  constraint payments_electronic_reference_check check (method = 'cash' or length(btrim(coalesce(reference_number, ''))) > 0),
  constraint payments_void_metadata_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and length(btrim(coalesce(void_reason, ''))) > 0)
  ),
  constraint payments_org_number_key unique (organization_id, payment_number),
  constraint payments_org_request_key unique (organization_id, client_request_id)
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint payment_allocations_payment_sale_key unique (payment_id, sale_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  salesman_user_id uuid references public.profiles(id) on delete restrict,
  expense_date date not null,
  category text not null check (length(btrim(category)) > 0),
  amount numeric(16,2) not null check (amount > 0),
  payment_source text not null check (payment_source in ('cash_collection', 'personal_cash', 'other')),
  description text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'voided')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_cash_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  salesman_user_id uuid not null references public.profiles(id) on delete restrict,
  report_date date not null,
  status text not null default 'locked' check (status in ('locked', 'reopened')),
  cash_collected numeric(16,2) not null check (cash_collected >= 0),
  gcash_collected numeric(16,2) not null check (gcash_collected >= 0),
  bank_collected numeric(16,2) not null check (bank_collected >= 0),
  cash_paid_expenses numeric(16,2) not null check (cash_paid_expenses >= 0),
  expected_cash_remittance numeric(16,2) not null,
  actual_cash_remittance numeric(16,2) not null check (actual_cash_remittance >= 0),
  difference numeric(16,2) not null,
  explanation text,
  source_snapshot jsonb not null,
  client_request_id uuid not null,
  submitted_at timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint daily_cash_reports_org_salesman_date_key unique (organization_id, salesman_user_id, report_date),
  constraint daily_cash_reports_org_request_key unique (organization_id, client_request_id),
  constraint daily_cash_reports_difference_check check (difference = actual_cash_remittance - expected_cash_remittance),
  constraint daily_cash_reports_explanation_check check (difference = 0 or length(btrim(coalesce(explanation, ''))) > 0)
);

create table public.discrepancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  type text not null check (type in ('cash_shortage', 'cash_overage', 'inventory_difference', 'payment_verification', 'price_override', 'post_dcr_adjustment')),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  related_entity_type text,
  related_entity_id uuid,
  salesman_user_id uuid references public.profiles(id) on delete restrict,
  amount_difference numeric(16,2),
  quantity_difference numeric(14,3),
  description text not null check (length(btrim(description)) > 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  entity_type text not null check (length(btrim(entity_type)) > 0),
  entity_id uuid,
  action text not null check (length(btrim(action)) > 0),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_name text not null check (length(btrim(unit_name)) > 0),
  plate_number text not null check (length(btrim(plate_number)) > 0),
  make_model text not null check (length(btrim(make_model)) > 0),
  current_mileage numeric(12,1) not null default 0 check (current_mileage >= 0),
  lto_registration_expiry date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index trucks_org_plate_key on public.trucks (organization_id, lower(regexp_replace(plate_number, '\s+', '', 'g')));

create table public.truck_renewals (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete restrict,
  renewal_date date not null,
  next_renewal_date date not null,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint truck_renewals_three_month_check check (next_renewal_date = (renewal_date + interval '3 months')::date),
  constraint truck_renewals_truck_date_key unique (truck_id, renewal_date)
);

create table public.truck_maintenance (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete restrict,
  maintenance_type text not null check (length(btrim(maintenance_type)) > 0),
  service_date date not null,
  mileage numeric(12,1) not null check (mileage >= 0),
  next_due_date date,
  next_due_mileage numeric(12,1) check (next_due_mileage is null or next_due_mileage >= mileage),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  time_in time not null,
  time_out time,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  total_minutes integer generated always as (
    case when time_out is null then null else greatest(0, floor(extract(epoch from (time_out - time_in)) / 60)::integer - break_minutes) end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_same_day_check check (time_out is null or time_out >= time_in),
  constraint time_entries_org_user_date_key unique (organization_id, user_id, work_date)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'paid', 'voided')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_periods_dates_check check (period_end >= period_start),
  constraint payroll_periods_org_dates_key unique (organization_id, period_start, period_end)
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  base_pay numeric(16,2) not null default 0 check (base_pay >= 0),
  regular_minutes integer not null default 0 check (regular_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  overtime_pay numeric(16,2) not null default 0 check (overtime_pay >= 0),
  allowances numeric(16,2) not null default 0 check (allowances >= 0),
  deductions numeric(16,2) not null default 0 check (deductions >= 0),
  gross_pay numeric(16,2) not null check (gross_pay >= 0),
  net_pay numeric(16,2) not null check (net_pay >= 0),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'paid', 'voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_entries_period_user_key unique (payroll_period_id, user_id),
  constraint payroll_entries_gross_check check (gross_pay = base_pay + overtime_pay + allowances),
  constraint payroll_entries_net_check check (net_pay = gross_pay - deductions)
);

comment on table public.inventory_movements is 'Immutable custody ledger. Balances are derived; rows are never edited in normal operation.';
comment on table public.sale_lines is 'Confirmed Sale snapshots tied to exact inventory lots and acquisition cost.';
comment on table public.daily_cash_reports is 'Locked DCR snapshots; later dated writes create post-DCR discrepancies instead of mutating totals.';
comment on table public.payroll_entries is 'Basic payroll foundation only; Philippine statutory contributions and tax are not implemented.';

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'profiles', 'organization_memberships', 'plants', 'products',
    'plant_products', 'plant_product_codes', 'plant_product_class_types', 'stock_trips',
    'customers', 'customer_prices', 'sales', 'expenses', 'trucks', 'time_entries',
    'payroll_periods', 'payroll_entries'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
end;
$$;

-- Foreign-key and policy predicate indexes.
create index organization_memberships_user_idx on public.organization_memberships (user_id, organization_id) where active;
create index plants_org_idx on public.plants (organization_id);
create index products_org_idx on public.products (organization_id);
create index plant_products_plant_idx on public.plant_products (plant_id);
create index plant_products_product_idx on public.plant_products (product_id);
create index plant_product_codes_parent_idx on public.plant_product_codes (plant_product_id);
create index plant_product_class_types_parent_idx on public.plant_product_class_types (plant_product_id);
create index stock_trips_org_date_idx on public.stock_trips (organization_id, trip_date desc);
create index stock_trips_plant_idx on public.stock_trips (plant_id);
create index stock_trip_lines_trip_idx on public.stock_trip_lines (stock_trip_id);
create index stock_trip_lines_config_idx on public.stock_trip_lines (plant_product_id, code_id, class_type_id);
create index inventory_lots_org_idx on public.inventory_lots (organization_id);
create index inventory_lots_product_idx on public.inventory_lots (product_id, code_id, class_type_id);
create index inventory_movements_lot_created_idx on public.inventory_movements (inventory_lot_id, created_at);
create index inventory_movements_org_date_idx on public.inventory_movements (organization_id, effective_date);
create index inventory_movements_from_salesman_idx on public.inventory_movements (from_salesman_user_id, inventory_lot_id) where from_salesman_user_id is not null;
create index inventory_movements_to_salesman_idx on public.inventory_movements (to_salesman_user_id, inventory_lot_id) where to_salesman_user_id is not null;
create index receiving_receipts_org_created_idx on public.receiving_receipts (organization_id, created_at desc);
create index receiving_receipt_lines_receipt_idx on public.receiving_receipt_lines (receipt_id);
create index transfer_receipts_org_created_idx on public.transfer_receipts (organization_id, created_at desc);
create index transfer_receipt_lines_receipt_idx on public.transfer_receipt_lines (receipt_id);
create index customers_org_name_idx on public.customers (organization_id, lower(name));
create index customer_prices_customer_idx on public.customer_prices (customer_id);
create index sales_org_date_idx on public.sales (organization_id, sale_date desc);
create index sales_customer_date_idx on public.sales (customer_id, sale_date, created_at);
create index sales_salesman_date_idx on public.sales (salesman_user_id, sale_date);
create index sale_lines_sale_idx on public.sale_lines (sale_id);
create index sale_lines_lot_idx on public.sale_lines (inventory_lot_id);
create index payments_org_date_idx on public.payments (organization_id, payment_date desc);
create index payments_customer_date_idx on public.payments (customer_id, payment_date, created_at);
create index payments_salesman_date_idx on public.payments (salesman_user_id, payment_date) where salesman_user_id is not null;
create index payment_allocations_sale_idx on public.payment_allocations (sale_id);
create index expenses_org_date_idx on public.expenses (organization_id, expense_date);
create index expenses_salesman_date_idx on public.expenses (salesman_user_id, expense_date) where salesman_user_id is not null;
create index daily_cash_reports_org_date_idx on public.daily_cash_reports (organization_id, report_date desc);
create index discrepancies_org_status_idx on public.discrepancies (organization_id, status, created_at desc);
create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);
create index trucks_org_idx on public.trucks (organization_id);
create index truck_renewals_truck_idx on public.truck_renewals (truck_id, renewal_date desc);
create index truck_maintenance_truck_idx on public.truck_maintenance (truck_id, service_date desc);
create index time_entries_org_date_idx on public.time_entries (organization_id, work_date);
create index payroll_periods_org_idx on public.payroll_periods (organization_id, period_start, period_end);
create index payroll_entries_user_idx on public.payroll_entries (user_id);
