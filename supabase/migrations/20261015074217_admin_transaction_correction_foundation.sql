-- Phase 1 only: correction evidence and guards. No operational write path is added.
create table public.transaction_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  module text not null check (length(btrim(module)) between 2 and 80),
  transaction_id uuid not null,
  transaction_reference text not null check (length(btrim(transaction_reference)) between 1 and 160),
  correction_action text not null check (length(btrim(correction_action)) between 2 and 80),
  admin_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 10 and 500),
  original_values jsonb not null default '{}'::jsonb check (jsonb_typeof(original_values) = 'object'),
  proposed_values jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed_values) = 'object'),
  applied_values jsonb not null default '{}'::jsonb check (jsonb_typeof(applied_values) = 'object'),
  affected_record_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(affected_record_ids) = 'array'),
  inventory_adjustments jsonb not null default '[]'::jsonb check (jsonb_typeof(inventory_adjustments) = 'array'),
  financial_adjustments jsonb not null default '[]'::jsonb check (jsonb_typeof(financial_adjustments) = 'array'),
  status text not null check (status in ('applied', 'rejected')),
  version_token text not null check (length(btrim(version_token)) > 0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint transaction_corrections_org_request_key unique (organization_id, request_id)
);

create index transaction_corrections_org_date_idx on public.transaction_corrections (organization_id, created_at desc);
create index transaction_corrections_org_module_date_idx on public.transaction_corrections (organization_id, module, created_at desc);
create index transaction_corrections_org_transaction_idx on public.transaction_corrections (organization_id, transaction_id, created_at desc);

create function private.assert_correction_actor(p_organization_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p
    join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id and p.active
      and m.organization_id = p_organization_id
      and m.role = 'owner_admin' and m.active
  ) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
end;
$$;

-- Future domain RPCs must compute current_version from locked database rows,
-- never from another client-supplied argument. The unique key closes races.
create function private.assert_correction_request(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid,
  p_expected_version text,
  p_current_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_correction_actor(p_organization_id, p_actor_user_id);
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'A correction reason of 10 to 500 characters is required' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'A correction request ID is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_expected_version, ''))) = 0
     or length(btrim(coalesce(p_current_version, ''))) = 0
     or p_expected_version <> p_current_version then
    raise exception 'The transaction changed. Refresh the preview before correcting it' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.transaction_corrections c
    where c.organization_id = p_organization_id and c.request_id = p_request_id
  ) then
    raise exception 'Correction request was already used' using errcode = '23505';
  end if;
end;
$$;

create function private.redact_correction_json(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_value is null then return null; end if;
  if jsonb_typeof(p_value) = 'object' then
    select coalesce(jsonb_object_agg(
      key,
      case when key ~* '(password|passphrase|token|secret|authorization|api.?key|credential|session)'
        then to_jsonb('[REDACTED]'::text)
        else private.redact_correction_json(value)
      end
    ), '{}'::jsonb) into v_result
    from jsonb_each(p_value);
    return v_result;
  end if;
  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(private.redact_correction_json(value) order by ordinality), '[]'::jsonb)
    into v_result
    from jsonb_array_elements(p_value) with ordinality;
    return v_result;
  end if;
  return p_value;
end;
$$;

create function private.prepare_transaction_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_correction_actor(new.organization_id, new.admin_user_id);
  new.original_values := private.redact_correction_json(new.original_values);
  new.proposed_values := private.redact_correction_json(new.proposed_values);
  new.applied_values := private.redact_correction_json(new.applied_values);
  new.affected_record_ids := private.redact_correction_json(new.affected_record_ids);
  new.inventory_adjustments := private.redact_correction_json(new.inventory_adjustments);
  new.financial_adjustments := private.redact_correction_json(new.financial_adjustments);
  return new;
end;
$$;

create function private.reject_transaction_correction_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Transaction correction history is append-only' using errcode = '55000';
end;
$$;

create trigger transaction_correction_prepare
before insert on public.transaction_corrections
for each row execute function private.prepare_transaction_correction();

create trigger transaction_correction_immutable
before update or delete on public.transaction_corrections
for each row execute function private.reject_transaction_correction_change();

alter table public.transaction_corrections enable row level security;
create policy transaction_corrections_owner_select on public.transaction_corrections
for select to authenticated
using (private.has_org_role(organization_id, array['owner_admin']));

revoke all on public.transaction_corrections from public, anon, authenticated, service_role;
grant select on public.transaction_corrections to authenticated;
grant select, insert on public.transaction_corrections to service_role;
revoke all on function private.assert_correction_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function private.assert_correction_request(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function private.redact_correction_json(jsonb) from public, anon, authenticated;
revoke all on function private.prepare_transaction_correction() from public, anon, authenticated;
revoke all on function private.reject_transaction_correction_change() from public, anon, authenticated;
grant execute on function private.assert_correction_actor(uuid, uuid) to service_role;
grant execute on function private.assert_correction_request(uuid, uuid, text, uuid, text, text) to service_role;

comment on table public.transaction_corrections is 'Append-only evidence for Admin corrections. No transaction correction operation exists in Phase 1.';
