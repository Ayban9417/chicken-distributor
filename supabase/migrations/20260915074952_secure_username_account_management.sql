alter table public.profiles
  add column username text,
  add column must_change_password boolean not null default false;

with normalized as (
  select
    id,
    coalesce(
      nullif(trim(both '.' from regexp_replace(lower(btrim(full_name)), '[^a-z0-9]+', '.', 'g')), ''),
      'user'
    ) as base
  from public.profiles
)
update public.profiles p
set username = left(n.base, 48) || '.' || left(replace(p.id::text, '-', ''), 12)
from normalized n
where n.id = p.id;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format_check check (
    username = lower(btrim(username))
    and username ~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
  );

create unique index profiles_username_key on public.profiles (lower(username));

comment on column public.profiles.username is
  'Globally unique normalized operational login name. Supabase Auth email remains internal.';
comment on column public.profiles.must_change_password is
  'Forces the authenticated account through the in-app password change screen.';

drop policy if exists profiles_update_self on public.profiles;
revoke update on public.profiles from authenticated;

create or replace function public.provision_salesman_account(
  p_organization_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and role = 'owner_admin'
      and active
  ) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'Full name is required' using errcode = '22023';
  end if;
  if p_username is null
    or p_username <> lower(btrim(p_username))
    or p_username !~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
  then
    raise exception 'Username is invalid' using errcode = '22023';
  end if;

  insert into public.profiles (id, full_name, username, active, must_change_password)
  values (p_user_id, btrim(p_full_name), p_username, true, true);

  insert into public.organization_memberships (organization_id, user_id, role, active)
  values (p_organization_id, p_user_id, 'salesman', true);

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'salesman_account', p_user_id,
    'account_created', jsonb_build_object(
      'username', p_username,
      'full_name', btrim(p_full_name),
      'role', 'salesman',
      'active', true,
      'must_change_password', true
    )
  );

  return jsonb_build_object(
    'id', p_user_id,
    'username', p_username,
    'full_name', btrim(p_full_name),
    'role', 'salesman',
    'active', true,
    'must_change_password', true
  );
end;
$$;

create or replace function public.update_salesman_account(
  p_organization_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_active boolean,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.profiles%rowtype;
  v_membership public.organization_memberships%rowtype;
  v_action text;
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and role = 'owner_admin'
      and active
  ) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;

  select * into v_membership
  from public.organization_memberships
  where organization_id = p_organization_id and user_id = p_user_id;
  if not found or v_membership.role <> 'salesman' then
    raise exception 'Salesman account not found' using errcode = 'P0002';
  end if;

  select * into strict v_before from public.profiles where id = p_user_id;
  if length(btrim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'Full name is required' using errcode = '22023';
  end if;
  if p_username is null
    or p_username <> lower(btrim(p_username))
    or p_username !~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
  then
    raise exception 'Username is invalid' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name), username = p_username, active = p_active
  where id = p_user_id;
  update public.organization_memberships set active = p_active where id = v_membership.id;

  v_action := case
    when v_before.active and not p_active then 'account_deactivated'
    when not v_before.active and p_active then 'account_activated'
    else 'account_updated'
  end;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'salesman_account', p_user_id, v_action,
    jsonb_build_object('username', v_before.username, 'full_name', v_before.full_name, 'active', v_before.active),
    jsonb_build_object('username', p_username, 'full_name', btrim(p_full_name), 'active', p_active)
  );

  return jsonb_build_object(
    'id', p_user_id,
    'username', p_username,
    'full_name', btrim(p_full_name),
    'role', 'salesman',
    'active', p_active,
    'must_change_password', v_before.must_change_password
  );
end;
$$;

create or replace function public.mark_salesman_password_reset(
  p_organization_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and role = 'owner_admin'
      and active
  ) then
    raise exception 'Active Owner / Admin authorization is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_user_id and role = 'salesman'
  ) then
    raise exception 'Salesman account not found' using errcode = 'P0002';
  end if;

  update public.profiles set must_change_password = true where id = p_user_id;
  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, action, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'salesman_account', p_user_id,
    'password_reset', jsonb_build_object('must_change_password', true)
  );
  return true;
end;
$$;

create or replace function public.complete_own_password_change()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships where user_id = v_user_id and active
  ) then
    raise exception 'Active account access is required' using errcode = '42501';
  end if;

  update public.profiles set must_change_password = false where id = v_user_id and active;
  if not found then
    raise exception 'Active profile not found' using errcode = 'P0002';
  end if;

  for v_organization_id in
    select organization_id from public.organization_memberships where user_id = v_user_id and active
  loop
    insert into public.audit_events (
      organization_id, actor_user_id, entity_type, entity_id, action, after_data
    ) values (
      v_organization_id, v_user_id, 'account_security', v_user_id,
      'password_changed', jsonb_build_object('must_change_password', false)
    );
  end loop;
  return true;
end;
$$;

revoke all on function public.provision_salesman_account(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_salesman_account(uuid, uuid, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.mark_salesman_password_reset(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.provision_salesman_account(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.update_salesman_account(uuid, uuid, text, text, boolean, uuid) to service_role;
grant execute on function public.mark_salesman_password_reset(uuid, uuid, uuid) to service_role;

revoke all on function public.complete_own_password_change() from public, anon;
grant execute on function public.complete_own_password_change() to authenticated;
