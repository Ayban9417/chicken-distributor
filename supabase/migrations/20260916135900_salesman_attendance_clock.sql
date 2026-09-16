alter table public.time_entries
  add column if not exists correction_reason text;

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert to authenticated
with check (private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']));

drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries for update to authenticated
using (private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']))
with check (private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']));

create or replace function private.audit_time_entry_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = new.user_id
    and private.has_org_role(new.organization_id, array['salesman'])
    and old.time_out is null
    and new.time_out is not null
    and new.organization_id = old.organization_id
    and new.user_id = old.user_id
    and new.work_date = old.work_date
    and new.time_in = old.time_in
    and new.break_minutes = old.break_minutes then
    return new;
  end if;

  if nullif(btrim(new.correction_reason), '') is null then
    raise exception 'A correction reason is required when editing attendance' using errcode = '22023';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    new.organization_id,
    auth.uid(),
    'time_entry',
    new.id,
    'corrected',
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists time_entries_correction_audit on public.time_entries;
create trigger time_entries_correction_audit
before update on public.time_entries
for each row execute function private.audit_time_entry_correction();

create or replace function api.time_in_now(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_local timestamp := timezone('Asia/Manila', v_now);
  v_entry public.time_entries%rowtype;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['salesman']) then
    raise exception 'Only an active Salesman can Time In' using errcode = '42501';
  end if;

  select * into v_entry
  from public.time_entries
  where organization_id = p_organization_id
    and user_id = v_actor
    and work_date = v_local::date;

  if found then
    return to_jsonb(v_entry) || jsonb_build_object('server_recorded_at', v_now, 'idempotent_replay', true);
  end if;

  if exists (
    select 1 from public.time_entries
    where organization_id = p_organization_id and user_id = v_actor and time_out is null
  ) then
    raise exception 'Complete the active attendance entry before timing in again' using errcode = 'P0001';
  end if;

  insert into public.time_entries (organization_id, user_id, work_date, time_in, break_minutes)
  values (p_organization_id, v_actor, v_local::date, v_local::time, 0)
  returning * into v_entry;

  return to_jsonb(v_entry) || jsonb_build_object('server_recorded_at', v_now, 'idempotent_replay', false);
end;
$$;

create or replace function api.time_out_now(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_local timestamp := timezone('Asia/Manila', v_now);
  v_entry public.time_entries%rowtype;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['salesman']) then
    raise exception 'Only an active Salesman can Time Out' using errcode = '42501';
  end if;

  select * into v_entry
  from public.time_entries
  where organization_id = p_organization_id
    and user_id = v_actor
    and work_date = v_local::date
  for update;

  if not found then
    raise exception 'Time In is required before Time Out' using errcode = 'P0001';
  end if;

  if v_entry.time_out is not null then
    return to_jsonb(v_entry) || jsonb_build_object('server_recorded_at', v_now, 'idempotent_replay', true);
  end if;

  update public.time_entries
  set time_out = greatest(v_local::time, time_in), updated_at = v_now
  where id = v_entry.id
  returning * into v_entry;

  return to_jsonb(v_entry) || jsonb_build_object('server_recorded_at', v_now, 'idempotent_replay', false);
end;
$$;

create or replace function public.time_in_now(p_organization_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select api.time_in_now($1) $$;

create or replace function public.time_out_now(p_organization_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select api.time_out_now($1) $$;

revoke all on function api.time_in_now(uuid) from public, anon;
revoke all on function api.time_out_now(uuid) from public, anon;
revoke all on function public.time_in_now(uuid) from public, anon;
revoke all on function public.time_out_now(uuid) from public, anon;
grant execute on function api.time_in_now(uuid) to authenticated;
grant execute on function api.time_out_now(uuid) to authenticated;
grant execute on function public.time_in_now(uuid) to authenticated;
grant execute on function public.time_out_now(uuid) to authenticated;

comment on function public.time_in_now(uuid) is
  'Records the authenticated Salesman Time In using the database clock in Asia/Manila; repeated calls are idempotent.';
comment on function public.time_out_now(uuid) is
  'Records the authenticated Salesman Time Out using the database clock in Asia/Manila; repeated calls are idempotent.';
