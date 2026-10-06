-- Keep direct customer DELETE closed. Only the password-verified admin Edge
-- Function can invoke this atomic, audited operation with the service role.
create function private.delete_unused_customer(
  p_organization_id uuid,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_replay jsonb;
  v_price_count integer;
  v_summary jsonb;
begin
  perform private.assert_protected_delete_actor(p_organization_id, p_actor_user_id);
  if p_request_id is null then
    raise exception 'Deletion request ID is required' using errcode = '22023';
  end if;

  select ae.after_data into v_replay
  from public.audit_events ae
  where ae.organization_id = p_organization_id
    and ae.actor_user_id = p_actor_user_id
    and ae.entity_type = 'customer'
    and ae.entity_id = p_customer_id
    and ae.action = 'DELETE_UNUSED_CUSTOMER'
    and ae.after_data->>'request_id' = p_request_id::text
  order by ae.created_at desc
  limit 1;
  if found then
    return v_replay || jsonb_build_object('idempotent_replay', true);
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Customer not found or already deleted' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.sales where customer_id = p_customer_id)
    or exists (select 1 from public.payments where customer_id = p_customer_id) then
    raise exception 'Historical transactions exist. Deactivate this customer instead.' using errcode = '55000';
  end if;

  select count(*) into v_price_count
  from public.customer_prices where customer_id = p_customer_id;
  v_summary := jsonb_build_object(
    'request_id', p_request_id,
    'customer_id', p_customer_id,
    'customer_name', v_customer.name,
    'deleted_prices', v_price_count,
    'reason', nullif(btrim(coalesce(p_reason, '')), ''),
    'idempotent_replay', false
  );

  delete from public.customer_prices where customer_id = p_customer_id;
  begin
    delete from public.customers where id = p_customer_id;
  exception when foreign_key_violation then
    raise exception 'Historical transactions exist. Deactivate this customer instead.' using errcode = '55000';
  end;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'customer', p_customer_id, 'DELETE_UNUSED_CUSTOMER',
    jsonb_build_object('name', v_customer.name, 'active', v_customer.active, 'price_count', v_price_count),
    v_summary
  );
  return v_summary;
end;
$$;

create function public.delete_unused_customer(
  p_organization_id uuid,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.delete_unused_customer($1, $2, $3, $4, $5) $$;

revoke all on function private.delete_unused_customer(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_unused_customer(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.delete_unused_customer(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.delete_unused_customer(uuid, uuid, uuid, text, uuid) to service_role;
