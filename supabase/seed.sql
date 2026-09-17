-- DEVELOPMENT ONLY. `supabase db reset` loads this file; production deployment
-- must use `supabase db push` and the approved import process instead.
-- Minimal demo master data only. No operational stock, Sales, Payments, or DCRs.
insert into public.organizations (id, name, slug)
values ('10000000-0000-4000-8000-000000000001', 'Chicken Distributor Demo', 'chicken-distributor-demo')
on conflict (id) do nothing;

insert into public.plants (id, organization_id, name, short_code, accent)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Fkidz', 'FKIDZ', '#c2410c'
)
on conflict (id) do nothing;

insert into public.products (id, organization_id, name, category) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Whole Dressed Chicken', 'whole_chicken'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Head', 'by_product'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Feet', 'by_product'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Liver', 'by_product'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Gizzard', 'by_product'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'Small Intestine', 'by_product'),
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'Large Intestine', 'by_product')
on conflict (id) do nothing;

insert into public.plant_products (
  id, plant_id, product_id, uses_size_codes, uses_class_types,
  uses_bags, uses_head_count, allows_free_from_plant
) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', true, false, true, false, true),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', false, false, true, true, true),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', false, false, false, false, true),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', false, false, false, false, true),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', false, false, false, false, true),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', false, false, false, false, true),
  ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000007', false, false, false, false, true)
on conflict (id) do nothing;

insert into public.plant_product_codes (id, plant_product_id, code, display_name) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'C1', 'Cat1'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'H', 'Happy Dog'),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'I', 'India'),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'CB', 'Class B')
on conflict (id) do nothing;
