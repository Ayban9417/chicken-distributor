-- PostgREST exposes public by default. These thin wrappers keep the validated
-- transaction logic in api while providing authenticated browser RPC endpoints.
create function public.create_stock_trip(
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

create function public.transfer_warehouse_to_salesman(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_effective_date date,
  p_lines jsonb,
  p_client_request_id uuid,
  p_notes text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select api.transfer_warehouse_to_salesman($1, $2, $3, $4, $5, $6) $$;

create function public.transfer_salesman_to_salesman(
  p_organization_id uuid,
  p_from_salesman_user_id uuid,
  p_to_salesman_user_id uuid,
  p_effective_date date,
  p_lines jsonb,
  p_client_request_id uuid,
  p_notes text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select api.transfer_salesman_to_salesman($1, $2, $3, $4, $5, $6, $7) $$;

create function public.create_sale(
  p_organization_id uuid,
  p_customer_id uuid,
  p_salesman_user_id uuid,
  p_sale_date date,
  p_trust_receipt_number text,
  p_lines jsonb,
  p_client_request_id uuid,
  p_sales_deductions numeric default 0,
  p_notes text default null,
  p_initial_payment jsonb default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select api.create_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) $$;

create function public.record_payment(
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

create function public.submit_dcr(
  p_organization_id uuid,
  p_salesman_user_id uuid,
  p_report_date date,
  p_actual_cash_remittance numeric,
  p_client_request_id uuid,
  p_explanation text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select api.submit_dcr($1, $2, $3, $4, $5, $6) $$;

revoke all on function public.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) from public, anon;
revoke all on function public.transfer_warehouse_to_salesman(uuid, uuid, date, jsonb, uuid, text) from public, anon;
revoke all on function public.transfer_salesman_to_salesman(uuid, uuid, uuid, date, jsonb, uuid, text) from public, anon;
revoke all on function public.create_sale(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb) from public, anon;
revoke all on function public.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) from public, anon;
revoke all on function public.submit_dcr(uuid, uuid, date, numeric, uuid, text) from public, anon;

grant execute on function public.create_stock_trip(uuid, uuid, date, jsonb, uuid, text, text, text) to authenticated;
grant execute on function public.transfer_warehouse_to_salesman(uuid, uuid, date, jsonb, uuid, text) to authenticated;
grant execute on function public.transfer_salesman_to_salesman(uuid, uuid, uuid, date, jsonb, uuid, text) to authenticated;
grant execute on function public.create_sale(uuid, uuid, uuid, date, text, jsonb, uuid, numeric, text, jsonb) to authenticated;
grant execute on function public.record_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.submit_dcr(uuid, uuid, date, numeric, uuid, text) to authenticated;
