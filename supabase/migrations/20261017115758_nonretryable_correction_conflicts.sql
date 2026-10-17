-- A stale preview is a business conflict, not a serialization failure. PostgREST
-- retries SQLSTATE 40001, which can leave an Edge request waiting indefinitely.
create or replace function private.assert_correction_request(
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
  if exists (
    select 1 from public.transaction_corrections c
    where c.organization_id = p_organization_id and c.request_id = p_request_id
  ) then
    raise exception 'Correction request was already used' using errcode = '23505';
  end if;
  if length(btrim(coalesce(p_expected_version, ''))) = 0
     or length(btrim(coalesce(p_current_version, ''))) = 0
     or p_expected_version <> p_current_version then
    raise exception 'The transaction changed. Refresh the preview before correcting it' using errcode = '55000';
  end if;
end;
$$;
