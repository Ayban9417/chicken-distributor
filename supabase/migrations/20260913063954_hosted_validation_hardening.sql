-- Hosted validation found that fresh Supabase projects retain default table privileges.
-- Remove those defaults, then restore only the Phase 1 client permissions.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

grant select on all tables in schema public to authenticated;
grant insert, update on public.organizations, public.profiles, public.organization_memberships,
  public.plants, public.products, public.plant_products, public.plant_product_codes,
  public.plant_product_class_types, public.customers, public.customer_prices,
  public.expenses, public.trucks, public.truck_renewals, public.truck_maintenance,
  public.time_entries, public.payroll_periods, public.payroll_entries to authenticated;
