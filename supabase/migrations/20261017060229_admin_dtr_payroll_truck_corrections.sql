-- Phase 7 development migration. Apply only after isolated Auth/Edge/RPC verification.
alter table public.time_entries
  alter column time_in drop not null,
  add column attendance_status text not null default 'present'
    check (attendance_status in ('present', 'late', 'absent', 'leave')),
  add column attendance_notes text;
alter table public.time_entries add constraint time_entries_attendance_shape_check
  check ((attendance_status in ('absent', 'leave') and time_in is null and time_out is null and break_minutes = 0)
    or (attendance_status in ('present', 'late') and time_in is not null));

-- Absence/leave rows are historical attendance, not unfinished clock sessions.
create or replace function api.time_in_now(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_now timestamptz := clock_timestamp();
  v_local timestamp := timezone('Asia/Manila', v_now); v_entry public.time_entries%rowtype;
begin
  if v_actor is null or not private.has_org_role(p_organization_id,array['salesman']) then
    raise exception 'Only an active Salesman can Time In' using errcode='42501'; end if;
  select * into v_entry from public.time_entries where organization_id=p_organization_id
    and user_id=v_actor and work_date=v_local::date;
  if found then
    if v_entry.attendance_status in ('absent','leave') then
      raise exception 'Attendance was marked absent or on leave; contact an administrator' using errcode='P0001'; end if;
    return to_jsonb(v_entry)||jsonb_build_object('server_recorded_at',v_now,'idempotent_replay',true);
  end if;
  if exists (select 1 from public.time_entries where organization_id=p_organization_id
    and user_id=v_actor and time_in is not null and time_out is null) then
    raise exception 'Complete the active attendance entry before timing in again' using errcode='P0001'; end if;
  insert into public.time_entries (organization_id,user_id,work_date,time_in,break_minutes)
  values (p_organization_id,v_actor,v_local::date,v_local::time,0) returning * into v_entry;
  return to_jsonb(v_entry)||jsonb_build_object('server_recorded_at',v_now,'idempotent_replay',false);
end;
$$;

create or replace function api.time_out_now(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_now timestamptz := clock_timestamp();
  v_local timestamp := timezone('Asia/Manila', v_now); v_entry public.time_entries%rowtype;
begin
  if v_actor is null or not private.has_org_role(p_organization_id,array['salesman']) then
    raise exception 'Only an active Salesman can Time Out' using errcode='42501'; end if;
  select * into v_entry from public.time_entries where organization_id=p_organization_id
    and user_id=v_actor and work_date=v_local::date for update;
  if not found or v_entry.time_in is null then
    raise exception 'Time In is required before Time Out' using errcode='P0001'; end if;
  if v_entry.time_out is not null then
    return to_jsonb(v_entry)||jsonb_build_object('server_recorded_at',v_now,'idempotent_replay',true); end if;
  update public.time_entries set time_out=greatest(v_local::time,time_in),updated_at=v_now
    where id=v_entry.id returning * into v_entry;
  return to_jsonb(v_entry)||jsonb_build_object('server_recorded_at',v_now,'idempotent_replay',false);
end;
$$;

alter table public.payroll_entries
  add column hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  add column overtime_rate numeric(12,2) not null default 0 check (overtime_rate >= 0),
  add column notes text;
update public.payroll_entries set
  hourly_rate = case when regular_minutes > 0 then round(base_pay * 60 / regular_minutes, 2) else 0 end,
  overtime_rate = case when overtime_minutes > 0 then round(overtime_pay * 60 / overtime_minutes, 2) else 0 end;

-- A historical correction must go through password reauthentication and a locked RPC.
revoke update, delete on public.time_entries, public.payroll_entries, public.payroll_periods,
  public.trucks, public.truck_renewals, public.truck_maintenance from authenticated;
drop policy if exists time_entries_update on public.time_entries;
drop policy if exists payroll_entries_write on public.payroll_entries;
create policy payroll_entries_insert on public.payroll_entries for insert to authenticated
  with check (exists (select 1 from public.payroll_periods pp where pp.id = payroll_period_id
    and pp.status = 'draft' and private.has_org_role(pp.organization_id, array['owner_admin', 'payroll_admin'])));
drop policy if exists payroll_periods_write on public.payroll_periods;
create policy payroll_periods_insert on public.payroll_periods for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner_admin', 'payroll_admin']) and status = 'draft');
drop policy if exists trucks_write on public.trucks;
create policy trucks_insert on public.trucks for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner_admin', 'warehouse']));
drop policy if exists truck_renewals_write on public.truck_renewals;
create policy truck_renewals_insert on public.truck_renewals for insert to authenticated
  with check (exists (select 1 from public.trucks t where t.id = truck_id
    and private.has_org_role(t.organization_id, array['owner_admin', 'warehouse'])));
drop policy if exists truck_maintenance_write on public.truck_maintenance;
create policy truck_maintenance_insert on public.truck_maintenance for insert to authenticated
  with check (exists (select 1 from public.trucks t where t.id = truck_id
    and private.has_org_role(t.organization_id, array['owner_admin', 'warehouse'])));

create function private.phase7_version(p_organization_id uuid, p_module text, p_id uuid, p_state jsonb)
returns text language sql stable set search_path = '' as $$
  select md5(jsonb_build_object('organization', p_organization_id,
    'module', p_module, 'id', p_id, 'state', p_state)::text)
$$;

create function private.phase7_evidence(p_organization_id uuid, p_actor uuid,
  p_module text, p_id uuid, p_action text, p_reason text, p_request uuid,
  p_version text, p_preview jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.transaction_corrections (id, organization_id, module, transaction_id,
    transaction_reference, correction_action, admin_user_id, reason, original_values,
    proposed_values, applied_values, affected_record_ids, inventory_adjustments,
    financial_adjustments, status, version_token, request_id)
  values (v_id, p_organization_id, p_module, p_id, p_id::text, p_action, p_actor,
    btrim(p_reason), p_preview->'originalValues', p_preview->'proposedValues',
    p_preview->'proposedValues', p_preview->'affectedRecords', '[]'::jsonb,
    coalesce(p_preview->'expectedFinancialChanges', '[]'::jsonb), 'applied', p_version, p_request);
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (p_organization_id, p_actor, p_module, p_id, upper(p_action),
    p_preview->'originalValues', jsonb_build_object('correctionId', v_id,
      'applied', p_preview->'proposedValues'));
  return v_id;
end;
$$;

-- The old attendance trigger uses auth.uid(), which is absent in the service-role
-- transaction. The correction ledger/audit event is written by the RPC instead.
create or replace function private.audit_time_entry_correction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.phase7_dtr_correction', true) = new.id::text then return new; end if;
  if auth.uid() = new.user_id and private.has_org_role(new.organization_id, array['salesman'])
    and old.time_out is null and new.time_out is not null
    and new.organization_id = old.organization_id and new.user_id = old.user_id
    and new.work_date = old.work_date and new.time_in = old.time_in
    and new.break_minutes = old.break_minutes then return new; end if;
  if nullif(btrim(new.correction_reason), '') is null then
    raise exception 'A correction reason is required when editing attendance' using errcode = '22023';
  end if;
  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data)
  values (new.organization_id, auth.uid(), 'time_entry', new.id, 'corrected', to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

create function private.inspect_dtr_correction(p_org uuid, p_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.time_entries%rowtype; v_new jsonb; v_block jsonb := '[]'::jsonb;
  v_date date; v_in time; v_out time; v_break integer; v_status text; v_notes text;
  v_periods jsonb; v_signature jsonb;
begin
  if jsonb_typeof(p_changes) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k(key)
      where k.key not in ('workDate', 'timeIn', 'timeOut', 'breakMinutes', 'attendanceStatus', 'attendanceNotes'))
    or p_changes->>'workDate' is null
    or p_changes->>'workDate' !~ '^\d{4}-\d{2}-\d{2}$'
    or p_changes->>'attendanceStatus' is null
    or p_changes->>'attendanceStatus' not in ('present', 'late', 'absent', 'leave') then
    raise exception 'Invalid DTR correction fields' using errcode = '22023';
  end if;
  v_date := (p_changes->>'workDate')::date;
  v_in := nullif(p_changes->>'timeIn', '')::time;
  v_out := nullif(p_changes->>'timeOut', '')::time;
  v_break := (p_changes->>'breakMinutes')::integer;
  v_status := p_changes->>'attendanceStatus';
  v_notes := nullif(btrim(p_changes->>'attendanceNotes'), '');
  if v_date > (now() at time zone 'Asia/Manila')::date or v_date < date '2000-01-01'
    or v_break is null or v_break < 0 or length(coalesce(v_notes, '')) > 2000
    or (v_status in ('absent', 'leave') and (v_in is not null or v_out is not null or v_break <> 0))
    or (v_status in ('present', 'late') and v_in is null)
    or (v_out is not null and (v_in is null or v_out <= v_in
      or v_break >= extract(epoch from (v_out - v_in)) / 60)) then
    raise exception 'Invalid attendance date, status or time range' using errcode = '22023';
  end if;
  select * into v_old from public.time_entries where id = p_id and organization_id = p_org;
  if not found then raise exception 'DTR entry not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.time_entries e where e.organization_id = p_org
    and e.user_id = v_old.user_id and e.work_date = v_date and e.id <> p_id) then
    v_block := v_block || jsonb_build_array('Another attendance entry exists for that employee and date.');
  end if;
  if v_old.work_date = (now() at time zone 'Asia/Manila')::date
    and v_old.time_in is not null and v_old.time_out is null then
    v_block := v_block || jsonb_build_array('A currently active shift must be completed before historical correction.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('period', to_jsonb(pp), 'entry', to_jsonb(pe)) order by pp.id), '[]'::jsonb)
    into v_periods from public.payroll_periods pp
    left join public.payroll_entries pe on pe.payroll_period_id = pp.id and pe.user_id = v_old.user_id
    where pp.organization_id = p_org and pp.status <> 'voided'
      and (v_old.work_date between pp.period_start and pp.period_end
        or v_date between pp.period_start and pp.period_end);
  if exists (select 1 from public.payroll_periods pp where pp.organization_id = p_org
    and pp.status in ('reviewed', 'paid') and (v_old.work_date between pp.period_start and pp.period_end
      or v_date between pp.period_start and pp.period_end)) then
    v_block := v_block || jsonb_build_array('Reviewed or paid payroll depends on this DTR; use a separately approved adjustment.');
  end if;
  v_new := jsonb_build_object('workDate', v_date, 'timeIn', v_in, 'timeOut', v_out,
    'breakMinutes', v_break, 'attendanceStatus', v_status, 'attendanceNotes', v_notes);
  v_signature := jsonb_build_object('dtr', to_jsonb(v_old), 'periods', v_periods);
  if jsonb_build_object('workDate', v_old.work_date, 'timeIn', v_old.time_in,
    'timeOut', v_old.time_out, 'breakMinutes', v_old.break_minutes,
    'attendanceStatus', v_old.attendance_status, 'attendanceNotes', v_old.attendance_notes) = v_new then
    v_block := v_block || jsonb_build_array('Make at least one change.');
  end if;
  return jsonb_build_object('originalValues', jsonb_build_object('workDate', v_old.work_date,
      'timeIn', v_old.time_in, 'timeOut', v_old.time_out, 'breakMinutes', v_old.break_minutes,
      'attendanceStatus', v_old.attendance_status, 'attendanceNotes', v_old.attendance_notes),
    'proposedValues', v_new, 'affectedRecords', jsonb_build_array(jsonb_build_object('type','time_entry','id',p_id)),
    'payrollDependencies', v_periods, 'expectedInventoryChanges', '[]'::jsonb,
    'expectedFinancialChanges', '[]'::jsonb, 'blockedReasons', v_block,
    'eligible', jsonb_array_length(v_block) = 0,
    'versionToken', private.phase7_version(p_org, 'dtr', p_id, v_signature));
end;
$$;

create function public.preview_dtr_correction(p_organization_id uuid, p_dtr_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id, array['owner_admin']) then
    raise exception 'Owner/Admin access required' using errcode = '42501'; end if;
  return private.inspect_dtr_correction(p_organization_id, p_dtr_id, p_changes);
end;
$$;

create function public.apply_dtr_correction(p_organization_id uuid, p_dtr_id uuid,
  p_actor_user_id uuid, p_reason text, p_request_id uuid, p_expected_version text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.time_entries%rowtype; v_preview jsonb; v_id uuid;
  v_period public.payroll_periods%rowtype; v_pay public.payroll_entries%rowtype;
  v_minutes integer; v_base numeric; v_gross numeric;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id = p.id
    where p.id = p_actor_user_id and p.active and m.organization_id = p_organization_id
      and m.role = 'owner_admin' and m.active for share of p, m;
  if not found then raise exception 'Owner/Admin access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 17001));
  select * into v_old from public.time_entries where id = p_dtr_id and organization_id = p_organization_id for update;
  if not found then raise exception 'DTR entry not found' using errcode = 'P0002'; end if;
  perform 1 from public.payroll_periods pp where pp.organization_id = p_organization_id
    and (v_old.work_date between pp.period_start and pp.period_end
      or (p_changes->>'workDate')::date between pp.period_start and pp.period_end)
    order by pp.id for update;
  perform 1 from public.payroll_entries pe join public.payroll_periods pp on pp.id = pe.payroll_period_id
    where pp.organization_id = p_organization_id and pe.user_id = v_old.user_id
      and (v_old.work_date between pp.period_start and pp.period_end
        or (p_changes->>'workDate')::date between pp.period_start and pp.period_end)
    order by pe.id for update of pe;
  v_preview := private.inspect_dtr_correction(p_organization_id, p_dtr_id, p_changes);
  perform private.assert_correction_request(p_organization_id, p_actor_user_id, p_reason,
    p_request_id, p_expected_version, v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception 'DTR correction is blocked: %', v_preview->'blockedReasons' using errcode = '55000'; end if;
  perform set_config('app.phase7_dtr_correction', p_dtr_id::text, true);
  update public.time_entries set work_date = (v_preview->'proposedValues'->>'workDate')::date,
    time_in = (v_preview->'proposedValues'->>'timeIn')::time,
    time_out = (v_preview->'proposedValues'->>'timeOut')::time,
    break_minutes = (v_preview->'proposedValues'->>'breakMinutes')::integer,
    attendance_status = v_preview->'proposedValues'->>'attendanceStatus',
    attendance_notes = v_preview->'proposedValues'->>'attendanceNotes',
    correction_reason = btrim(p_reason) where id = p_dtr_id;
  perform set_config('app.phase7_dtr_correction', '', true);
  for v_period in select * from public.payroll_periods pp where pp.organization_id = p_organization_id
    and pp.status = 'draft' and (v_old.work_date between pp.period_start and pp.period_end
      or (p_changes->>'workDate')::date between pp.period_start and pp.period_end) order by pp.id loop
    select * into v_pay from public.payroll_entries where payroll_period_id = v_period.id
      and user_id = v_old.user_id;
    if found then
      select coalesce(sum(total_minutes), 0)::integer into v_minutes from public.time_entries
        where organization_id = p_organization_id and user_id = v_old.user_id
          and work_date between v_period.period_start and v_period.period_end;
      v_base := round(v_minutes::numeric / 60 * v_pay.hourly_rate, 2);
      v_gross := v_base + v_pay.overtime_pay + v_pay.allowances;
      if v_gross < v_pay.deductions then
        raise exception 'DTR correction would make draft payroll net pay negative' using errcode = '55000'; end if;
      update public.payroll_entries set regular_minutes = v_minutes, base_pay = v_base,
        gross_pay = v_gross, net_pay = v_gross - v_pay.deductions where id = v_pay.id;
    end if;
  end loop;
  v_id := private.phase7_evidence(p_organization_id, p_actor_user_id, 'dtr', p_dtr_id,
    'correct_dtr', p_reason, p_request_id, p_expected_version, v_preview);
  return jsonb_build_object('correctionId', v_id, 'dtrId', p_dtr_id);
end;
$$;

-- Adjustment requests never overwrite a reviewed or paid payroll snapshot.
-- Approval is a second append-only fact; paid requests require a different Admin.
create table public.payroll_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payroll_entry_id uuid not null references public.payroll_entries(id) on delete restrict,
  period_status text not null check (period_status in ('reviewed','paid')),
  gross_delta numeric(16,2) not null,
  net_delta numeric(16,2) not null,
  notes text not null check (length(btrim(notes)) between 1 and 2000),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  correction_id uuid not null unique references public.transaction_corrections(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (gross_delta <> 0 or net_delta <> 0)
);
create table public.payroll_adjustment_approvals (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null unique references public.payroll_adjustment_requests(id) on delete restrict,
  approved_by uuid not null references public.profiles(id) on delete restrict,
  correction_id uuid not null unique references public.transaction_corrections(id) on delete restrict,
  created_at timestamptz not null default now()
);
create trigger payroll_adjustment_requests_immutable before update or delete
  on public.payroll_adjustment_requests for each row execute function private.reject_transaction_correction_change();
create trigger payroll_adjustment_approvals_immutable before update or delete
  on public.payroll_adjustment_approvals for each row execute function private.reject_transaction_correction_change();
alter table public.payroll_adjustment_requests enable row level security;
alter table public.payroll_adjustment_approvals enable row level security;
create policy payroll_adjustment_requests_owner_select on public.payroll_adjustment_requests
  for select to authenticated using (private.has_org_role(organization_id,array['owner_admin']));
create policy payroll_adjustment_approvals_owner_select on public.payroll_adjustment_approvals
  for select to authenticated using (exists (select 1 from public.payroll_adjustment_requests r
    where r.id=adjustment_id and private.has_org_role(r.organization_id,array['owner_admin'])));
revoke all on public.payroll_adjustment_requests, public.payroll_adjustment_approvals
  from public,anon,authenticated,service_role;
grant select on public.payroll_adjustment_requests,public.payroll_adjustment_approvals to authenticated;
grant select,insert on public.payroll_adjustment_requests,public.payroll_adjustment_approvals to service_role;

create function private.inspect_payroll_correction(p_org uuid, p_id uuid, p_kind text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entry public.payroll_entries%rowtype; v_period public.payroll_periods%rowtype;
  v_adjustment public.payroll_adjustment_requests%rowtype;
  v_old jsonb; v_new jsonb; v_block jsonb := '[]'::jsonb; v_state jsonb;
  v_minutes integer; v_overtime integer; v_base numeric; v_ot_pay numeric;
  v_rate numeric; v_ot_rate numeric; v_allow numeric; v_deduct numeric; v_gross numeric;
  v_notes text; v_status text; v_approved_net numeric;
begin
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'Invalid Payroll correction' using errcode = '22023'; end if;
  if p_kind = 'entry' then
    if exists (select 1 from jsonb_object_keys(p_changes) k(key) where k.key not in
      ('hourlyRate','overtimeHours','overtimeRate','allowances','deductions','notes')) then
      raise exception 'Invalid Payroll entry fields' using errcode = '22023'; end if;
    select * into v_entry from public.payroll_entries where id = p_id;
    if not found then raise exception 'Payroll entry not found' using errcode = 'P0002'; end if;
    select * into v_period from public.payroll_periods where id = v_entry.payroll_period_id
      and organization_id = p_org;
    if not found then raise exception 'Payroll period not found' using errcode = 'P0002'; end if;
    v_rate := (p_changes->>'hourlyRate')::numeric;
    v_ot_rate := (p_changes->>'overtimeRate')::numeric;
    v_overtime := round((p_changes->>'overtimeHours')::numeric * 60)::integer;
    v_allow := (p_changes->>'allowances')::numeric;
    v_deduct := (p_changes->>'deductions')::numeric;
    v_notes := nullif(btrim(p_changes->>'notes'), '');
    if v_rate is null or v_ot_rate is null or v_overtime is null
      or v_allow is null or v_deduct is null or least(v_rate,v_ot_rate,v_overtime,v_allow,v_deduct) < 0
      or v_rate > 1000000 or v_ot_rate > 1000000 or v_overtime > 1000000
      or v_allow > 100000000 or v_deduct > 100000000
      or v_rate<>round(v_rate,2) or v_ot_rate<>round(v_ot_rate,2)
      or v_allow<>round(v_allow,2) or v_deduct<>round(v_deduct,2)
      or length(coalesce(v_notes,'')) > 2000 then
      raise exception 'Invalid Payroll rate, hours, amounts or notes' using errcode = '22023'; end if;
    select coalesce(sum(total_minutes),0)::integer into v_minutes from public.time_entries
      where organization_id = p_org and user_id = v_entry.user_id
        and work_date between v_period.period_start and v_period.period_end;
    v_base := round(v_minutes::numeric / 60 * v_rate, 2);
    v_ot_pay := round(v_overtime::numeric / 60 * v_ot_rate, 2);
    v_gross := v_base + v_ot_pay + v_allow;
    if v_deduct > v_gross then raise exception 'Deductions exceed gross pay' using errcode = '22023'; end if;
    v_old := jsonb_build_object('hourlyRate',v_entry.hourly_rate,
      'overtimeHours',round(v_entry.overtime_minutes::numeric / 60,2),
      'overtimeRate',v_entry.overtime_rate,'allowances',v_entry.allowances,
      'deductions',v_entry.deductions,'notes',v_entry.notes,
      'regularMinutes',v_entry.regular_minutes,'overtimeMinutes',v_entry.overtime_minutes,
      'basePay',v_entry.base_pay,'overtimePay',v_entry.overtime_pay,
      'grossPay',v_entry.gross_pay,'netPay',v_entry.net_pay);
    v_new := jsonb_build_object('hourlyRate',v_rate,'overtimeHours',round(v_overtime::numeric/60,2),
      'overtimeRate',v_ot_rate,'allowances',v_allow,'deductions',v_deduct,'notes',v_notes,
      'regularMinutes',v_minutes,'overtimeMinutes',v_overtime,
      'basePay',v_base,'overtimePay',v_ot_pay,'grossPay',v_gross,'netPay',v_gross-v_deduct);
    if v_period.status <> 'draft' or v_entry.status <> 'draft' then
      v_block := v_block || jsonb_build_array('Reviewed or paid payroll cannot be rewritten; request a separately approved adjustment.'); end if;
    v_state := jsonb_build_object('entry',to_jsonb(v_entry),'period',to_jsonb(v_period),
      'attendance',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)
        from public.time_entries t where t.organization_id=p_org and t.user_id=v_entry.user_id
          and t.work_date between v_period.period_start and v_period.period_end));
  elsif p_kind = 'adjustment' then
    if exists (select 1 from jsonb_object_keys(p_changes) k(key)
      where k.key not in ('grossDelta','netDelta','notes')) then
      raise exception 'Invalid adjustment fields' using errcode='22023'; end if;
    select * into v_entry from public.payroll_entries where id=p_id;
    if not found then raise exception 'Payroll entry not found' using errcode='P0002'; end if;
    select * into v_period from public.payroll_periods where id=v_entry.payroll_period_id
      and organization_id=p_org;
    if not found then raise exception 'Payroll period not found' using errcode='P0002'; end if;
    v_allow := (p_changes->>'grossDelta')::numeric;
    v_deduct := (p_changes->>'netDelta')::numeric;
    v_notes := btrim(coalesce(p_changes->>'notes',''));
    if v_allow is null or v_deduct is null or (v_allow=0 and v_deduct=0)
      or abs(v_allow)>100000000 or abs(v_deduct)>100000000
      or v_allow<>round(v_allow,2) or v_deduct<>round(v_deduct,2)
      or length(v_notes) not between 1 and 2000 then
      raise exception 'Invalid adjustment amounts or notes' using errcode='22023'; end if;
    if v_period.status not in ('reviewed','paid') or v_entry.status<>v_period.status then
      v_block:=v_block||jsonb_build_array('Adjustments require matching Reviewed or Paid payroll.'); end if;
    if v_period.status='paid' and (v_allow<0 or v_deduct<0) then
      v_block:=v_block||jsonb_build_array('Paid payroll recovery needs a separate settlement workflow; only positive supplements are supported.'); end if;
    if v_entry.net_pay+v_deduct<0 or v_entry.gross_pay+v_allow<0 then
      v_block:=v_block||jsonb_build_array('Adjustment would make a payroll total negative.'); end if;
    select coalesce(sum(r.net_delta),0) into v_approved_net
      from public.payroll_adjustment_requests r
      join public.payroll_adjustment_approvals a on a.adjustment_id=r.id
      where r.payroll_entry_id=p_id;
    if v_entry.net_pay+v_approved_net+v_deduct<0 then
      v_block:=v_block||jsonb_build_array('Cumulative approved adjustments would make net pay negative.'); end if;
    v_old:=jsonb_build_object('grossPay',v_entry.gross_pay,'netPay',v_entry.net_pay,
      'status',v_period.status);
    v_new:=jsonb_build_object('grossDelta',v_allow,'netDelta',v_deduct,'notes',v_notes,
      'grossAfter',v_entry.gross_pay+v_allow,'netAfter',v_entry.net_pay+v_deduct,
      'status',v_period.status);
    v_state:=jsonb_build_object('entry',to_jsonb(v_entry),'period',to_jsonb(v_period),
      'adjustments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)
        from public.payroll_adjustment_requests r where r.payroll_entry_id=p_id));
  elsif p_kind = 'approval' then
    if p_changes <> '{}'::jsonb then raise exception 'Invalid approval fields' using errcode='22023'; end if;
    select * into v_adjustment from public.payroll_adjustment_requests
      where id=p_id and organization_id=p_org;
    if not found then raise exception 'Payroll adjustment not found' using errcode='P0002'; end if;
    select * into v_entry from public.payroll_entries where id=v_adjustment.payroll_entry_id;
    select * into v_period from public.payroll_periods where id=v_entry.payroll_period_id
      and organization_id=p_org;
    if v_period.status<>v_adjustment.period_status then
      v_block:=v_block||jsonb_build_array('Payroll status changed since the adjustment request.'); end if;
    if exists (select 1 from public.payroll_adjustment_approvals where adjustment_id=p_id) then
      v_block:=v_block||jsonb_build_array('Adjustment was already approved.'); end if;
    select coalesce(sum(r.net_delta),0) into v_approved_net
      from public.payroll_adjustment_requests r
      join public.payroll_adjustment_approvals a on a.adjustment_id=r.id
      where r.payroll_entry_id=v_entry.id;
    if v_entry.net_pay+v_approved_net+v_adjustment.net_delta<0 then
      v_block:=v_block||jsonb_build_array('Approval would make cumulative net pay negative.'); end if;
    if v_adjustment.period_status='paid' and auth.uid()=v_adjustment.requested_by then
      v_block:=v_block||jsonb_build_array('Paid adjustment needs approval from a different Owner/Admin.'); end if;
    v_old:=jsonb_build_object('status','pending','grossDelta',v_adjustment.gross_delta,
      'netDelta',v_adjustment.net_delta,'requestedBy',v_adjustment.requested_by);
    v_new:=jsonb_build_object('status','approved','grossDelta',v_adjustment.gross_delta,
      'netDelta',v_adjustment.net_delta,'requestedBy',v_adjustment.requested_by);
    v_state:=jsonb_build_object('request',to_jsonb(v_adjustment),'entry',to_jsonb(v_entry),
      'period',to_jsonb(v_period),'approval',
      (select to_jsonb(a) from public.payroll_adjustment_approvals a where a.adjustment_id=p_id));
  elsif p_kind = 'period' then
    if exists (select 1 from jsonb_object_keys(p_changes) k(key) where k.key <> 'status') then
      raise exception 'Invalid Payroll period fields' using errcode = '22023'; end if;
    select * into v_period from public.payroll_periods where id = p_id and organization_id = p_org;
    if not found then raise exception 'Payroll period not found' using errcode = 'P0002'; end if;
    v_status := p_changes->>'status';
    if v_status is null or (v_period.status = 'draft' and v_status <> 'reviewed')
      or (v_period.status = 'reviewed' and v_status <> 'paid')
      or v_period.status in ('paid','voided') then
      v_block := v_block || jsonb_build_array('Only Draft to Reviewed or Reviewed to Paid is permitted.'); end if;
    if not exists (select 1 from public.payroll_entries where payroll_period_id = p_id) then
      v_block := v_block || jsonb_build_array('A pay period needs at least one entry.'); end if;
    if exists (select 1 from public.payroll_entries where payroll_period_id = p_id
      and status <> v_period.status) then
      v_block := v_block || jsonb_build_array('Entry statuses do not match the period.'); end if;
    if exists (select 1 from public.payroll_adjustment_requests r
      join public.payroll_entries e on e.id=r.payroll_entry_id
      where e.payroll_period_id=p_id and not exists
        (select 1 from public.payroll_adjustment_approvals a where a.adjustment_id=r.id)) then
      v_block:=v_block||jsonb_build_array('Approve pending payroll adjustments before finalizing the period.'); end if;
    v_old := jsonb_build_object('status',v_period.status,'periodStart',v_period.period_start,
      'periodEnd',v_period.period_end);
    v_new := jsonb_build_object('status',v_status,'periodStart',v_period.period_start,
      'periodEnd',v_period.period_end);
    v_state := jsonb_build_object('period',to_jsonb(v_period),'entries',
      (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)
        from public.payroll_entries e where e.payroll_period_id=p_id));
  else raise exception 'Invalid Payroll correction type' using errcode = '22023'; end if;
  if v_old = v_new then v_block := v_block || jsonb_build_array('Make at least one change.'); end if;
  return jsonb_build_object('originalValues',v_old,'proposedValues',v_new,
    'affectedRecords',jsonb_build_array(jsonb_build_object('type',
      case when p_kind in ('entry','adjustment') then 'payroll_entry'
        when p_kind='approval' then 'payroll_adjustment' else 'payroll_period' end,'id',p_id)),
    'expectedInventoryChanges','[]'::jsonb,
    'expectedFinancialChanges',case when p_kind='entry' then jsonb_build_array(
      jsonb_build_object('type','net_pay','before',v_entry.net_pay,'after',v_gross-v_deduct,
        'delta',v_gross-v_deduct-v_entry.net_pay))
      when p_kind='adjustment' then jsonb_build_array(jsonb_build_object('type','payroll_adjustment',
        'before',v_entry.net_pay,'after',v_entry.net_pay+v_deduct,'delta',v_deduct))
      else '[]'::jsonb end,
    'blockedReasons',v_block,'eligible',jsonb_array_length(v_block)=0,
    'versionToken',private.phase7_version(p_org,'payroll_'||p_kind,p_id,v_state));
end;
$$;

create function public.preview_payroll_correction(p_organization_id uuid, p_payroll_id uuid,
  p_kind text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id,array['owner_admin']) then
    raise exception 'Owner/Admin access required' using errcode = '42501'; end if;
  return private.inspect_payroll_correction(p_organization_id,p_payroll_id,p_kind,p_changes);
end;
$$;

create function public.apply_payroll_correction(p_organization_id uuid, p_payroll_id uuid,
  p_kind text, p_actor_user_id uuid, p_reason text, p_request_id uuid,
  p_expected_version text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_preview jsonb; v_period_id uuid; v_id uuid; v_new jsonb;
  v_adjustment public.payroll_adjustment_requests%rowtype;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id=p.id
    where p.id=p_actor_user_id and p.active and m.organization_id=p_organization_id
      and m.role='owner_admin' and m.active for share of p,m;
  if not found then raise exception 'Owner/Admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,17001));
  if p_kind in ('entry','adjustment') then
    select payroll_period_id into v_period_id from public.payroll_entries where id=p_payroll_id;
  elsif p_kind='period' then v_period_id := p_payroll_id;
  elsif p_kind='approval' then
    select * into v_adjustment from public.payroll_adjustment_requests
      where id=p_payroll_id and organization_id=p_organization_id for update;
    if not found then raise exception 'Payroll adjustment not found' using errcode='P0002'; end if;
    select payroll_period_id into v_period_id from public.payroll_entries
      where id=v_adjustment.payroll_entry_id;
    if v_adjustment.period_status='paid' and v_adjustment.requested_by=p_actor_user_id then
      raise exception 'A second Owner/Admin must approve paid payroll adjustments' using errcode='42501'; end if;
  else raise exception 'Invalid Payroll correction type' using errcode='22023'; end if;
  perform 1 from public.payroll_periods where id=v_period_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Payroll period not found' using errcode='P0002'; end if;
  perform 1 from public.payroll_entries where payroll_period_id=v_period_id order by id for update;
  perform 1 from public.time_entries t join public.payroll_periods pp on pp.id=v_period_id
    where t.organization_id=p_organization_id and t.work_date between pp.period_start and pp.period_end
    order by t.id for share of t;
  v_preview := private.inspect_payroll_correction(p_organization_id,p_payroll_id,p_kind,p_changes);
  perform private.assert_correction_request(p_organization_id,p_actor_user_id,p_reason,
    p_request_id,p_expected_version,v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception 'Payroll correction blocked: %',v_preview->'blockedReasons' using errcode='55000'; end if;
  v_new := v_preview->'proposedValues';
  if p_kind='entry' then
    update public.payroll_entries set hourly_rate=(v_new->>'hourlyRate')::numeric,
      overtime_rate=(v_new->>'overtimeRate')::numeric,
      regular_minutes=(v_new->>'regularMinutes')::integer,
      overtime_minutes=(v_new->>'overtimeMinutes')::integer,
      base_pay=(v_new->>'basePay')::numeric,
      overtime_pay=(v_new->>'overtimePay')::numeric,
      allowances=(v_new->>'allowances')::numeric,deductions=(v_new->>'deductions')::numeric,
      gross_pay=(v_new->>'grossPay')::numeric,net_pay=(v_new->>'netPay')::numeric,
      notes=v_new->>'notes' where id=p_payroll_id;
  elsif p_kind='period' then
    update public.payroll_entries set status=v_new->>'status' where payroll_period_id=v_period_id;
    update public.payroll_periods set status=v_new->>'status' where id=v_period_id;
  end if;
  v_id := private.phase7_evidence(p_organization_id,p_actor_user_id,'payroll',
    case when p_kind='approval' then v_adjustment.payroll_entry_id else p_payroll_id end,
    case when p_kind='period' then 'finalize_period'
      when p_kind='adjustment' then 'request_adjustment'
      when p_kind='approval' then 'approve_adjustment' else 'correct_draft_entry' end,
    p_reason,p_request_id,p_expected_version,v_preview);
  if p_kind='adjustment' then
    insert into public.payroll_adjustment_requests (organization_id,payroll_entry_id,
      period_status,gross_delta,net_delta,notes,requested_by,correction_id)
    values (p_organization_id,p_payroll_id,v_new->>'status',
      (v_new->>'grossDelta')::numeric,(v_new->>'netDelta')::numeric,
      v_new->>'notes',p_actor_user_id,v_id);
  elsif p_kind='approval' then
    insert into public.payroll_adjustment_approvals (adjustment_id,approved_by,correction_id)
    values (p_payroll_id,p_actor_user_id,v_id);
  end if;
  return jsonb_build_object('correctionId',v_id,'payrollId',p_payroll_id);
end;
$$;

-- New maintenance remains an ordinary creation workflow, but mileage and the
-- maintenance row now commit together rather than two independent REST writes.
create function private.record_truck_mileage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_truck public.trucks%rowtype;
begin
  select * into v_truck from public.trucks where id=new.truck_id for update;
  if new.mileage < v_truck.current_mileage then
    raise exception 'Maintenance mileage cannot move backwards' using errcode='22023'; end if;
  update public.trucks set current_mileage=new.mileage where id=new.truck_id;
  return new;
end;
$$;
create trigger truck_maintenance_update_mileage
before insert on public.truck_maintenance for each row execute function private.record_truck_mileage();

create function private.guard_phase7_attendance_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,17001));
  if exists (select 1 from public.payroll_periods pp where pp.organization_id=new.organization_id
    and pp.status in ('reviewed','paid')
    and new.work_date between pp.period_start and pp.period_end) then
    raise exception 'Attendance for reviewed or paid payroll requires a separate adjustment' using errcode='55000'; end if;
  return new;
end;
$$;
create trigger phase7_attendance_insert_guard before insert on public.time_entries
  for each row execute function private.guard_phase7_attendance_insert();

create function private.guard_phase7_payroll_entry_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_period public.payroll_periods%rowtype;
begin
  select * into v_period from public.payroll_periods where id=new.payroll_period_id;
  perform pg_advisory_xact_lock(hashtextextended(v_period.organization_id::text,17001));
  if v_period.status <> 'draft' then
    raise exception 'Only Draft payroll can receive new entries' using errcode='55000'; end if;
  return new;
end;
$$;
create trigger phase7_payroll_entry_insert_guard before insert on public.payroll_entries
  for each row execute function private.guard_phase7_payroll_entry_insert();

create function private.inspect_truck_correction(p_org uuid, p_id uuid, p_kind text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_truck public.trucks%rowtype; v_renew public.truck_renewals%rowtype;
  v_maint public.truck_maintenance%rowtype; v_old jsonb; v_new jsonb;
  v_block jsonb := '[]'::jsonb; v_state jsonb; v_date date; v_mileage numeric;
  v_due_date date; v_due_mileage numeric; v_notes text; v_other_max numeric;
begin
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'Invalid Truck correction' using errcode='22023'; end if;
  if p_kind='truck' then
    if exists (select 1 from jsonb_object_keys(p_changes) k(key) where k.key not in
      ('unitName','plateNumber','makeModel','mileage','ltoExpiry','active')) then
      raise exception 'Invalid Truck fields' using errcode='22023'; end if;
    select * into v_truck from public.trucks where id=p_id and organization_id=p_org;
    if not found then raise exception 'Truck not found' using errcode='P0002'; end if;
    v_mileage := (p_changes->>'mileage')::numeric;
    v_due_date := nullif(p_changes->>'ltoExpiry','')::date;
    if length(btrim(coalesce(p_changes->>'unitName',''))) not between 1 and 160
      or length(btrim(coalesce(p_changes->>'plateNumber',''))) not between 1 and 40
      or length(btrim(coalesce(p_changes->>'makeModel',''))) not between 1 and 160
      or v_mileage is null or v_mileage < 0 or v_mileage > 99999999999.9
      or v_mileage <> round(v_mileage,1)
      or jsonb_typeof(p_changes->'active') is distinct from 'boolean' then
      raise exception 'Invalid Truck details or mileage' using errcode='22023'; end if;
    if v_mileage < v_truck.current_mileage then
      v_block := v_block || jsonb_build_array('Odometer corrections cannot lower the current mileage below its prior value.'); end if;
    if exists (select 1 from public.truck_maintenance m where m.truck_id=p_id and m.mileage>v_mileage) then
      v_block := v_block || jsonb_build_array('Mileage cannot be less than recorded maintenance.'); end if;
    if exists (select 1 from public.trucks t where t.organization_id=p_org and t.id<>p_id
      and lower(regexp_replace(t.plate_number,'\s+','','g'))=
        lower(regexp_replace(p_changes->>'plateNumber','\s+','','g'))) then
      v_block := v_block || jsonb_build_array('Plate number is already used by another truck.'); end if;
    v_old := jsonb_build_object('unitName',v_truck.unit_name,'plateNumber',v_truck.plate_number,
      'makeModel',v_truck.make_model,'mileage',v_truck.current_mileage,
      'ltoExpiry',v_truck.lto_registration_expiry,'active',v_truck.active);
    v_new := jsonb_build_object('unitName',btrim(p_changes->>'unitName'),
      'plateNumber',upper(btrim(p_changes->>'plateNumber')),
      'makeModel',btrim(p_changes->>'makeModel'),'mileage',v_mileage,
      'ltoExpiry',v_due_date,'active',(p_changes->>'active')::boolean);
  elsif p_kind='renewal' then
    if exists (select 1 from jsonb_object_keys(p_changes) k(key) where k.key not in ('date','notes')) then
      raise exception 'Invalid renewal fields' using errcode='22023'; end if;
    select * into v_renew from public.truck_renewals where id=p_id;
    if not found then raise exception 'Renewal not found' using errcode='P0002'; end if;
    select * into v_truck from public.trucks where id=v_renew.truck_id and organization_id=p_org;
    if not found then raise exception 'Truck not found' using errcode='P0002'; end if;
    v_date := (p_changes->>'date')::date;
    v_notes := nullif(btrim(p_changes->>'notes'),'');
    if v_date is null or v_date > (now() at time zone 'Asia/Manila')::date
      or v_date < date '2000-01-01' or length(coalesce(v_notes,''))>2000 then
      raise exception 'Invalid renewal date or notes' using errcode='22023'; end if;
    if exists (select 1 from public.truck_renewals r where r.truck_id=v_truck.id
      and r.id<>p_id and r.renewal_date=v_date) then
      v_block := v_block || jsonb_build_array('A renewal already exists on that date.'); end if;
    if exists (select 1 from public.truck_renewals r where r.truck_id=v_truck.id and r.id<>p_id
      and ((r.renewal_date<v_renew.renewal_date and r.renewal_date>=v_date)
        or (r.renewal_date>v_renew.renewal_date and r.renewal_date<=v_date))) then
      v_block := v_block || jsonb_build_array('Renewal chronology cannot cross another record.'); end if;
    v_old := jsonb_build_object('date',v_renew.renewal_date,
      'nextDate',v_renew.next_renewal_date,'notes',v_renew.notes);
    v_new := jsonb_build_object('date',v_date,'nextDate',(v_date+interval '3 months')::date,'notes',v_notes);
  elsif p_kind='maintenance' then
    if exists (select 1 from jsonb_object_keys(p_changes) k(key) where k.key not in
      ('type','date','mileage','nextDueDate','nextDueMileage','notes')) then
      raise exception 'Invalid maintenance fields' using errcode='22023'; end if;
    select * into v_maint from public.truck_maintenance where id=p_id;
    if not found then raise exception 'Maintenance not found' using errcode='P0002'; end if;
    select * into v_truck from public.trucks where id=v_maint.truck_id and organization_id=p_org;
    if not found then raise exception 'Truck not found' using errcode='P0002'; end if;
    v_date := (p_changes->>'date')::date;
    v_mileage := (p_changes->>'mileage')::numeric;
    v_due_date := nullif(p_changes->>'nextDueDate','')::date;
    v_due_mileage := nullif(p_changes->>'nextDueMileage','')::numeric;
    v_notes := nullif(btrim(p_changes->>'notes'),'');
    if length(btrim(coalesce(p_changes->>'type',''))) not between 1 and 160
      or v_date is null or v_date > (now() at time zone 'Asia/Manila')::date
      or v_date < date '2000-01-01' or v_mileage is null or v_mileage<0
      or v_mileage<>round(v_mileage,1) or v_mileage>99999999999.9
      or (v_due_date is not null and v_due_date<v_date)
      or (v_due_mileage is not null and (v_due_mileage<v_mileage
        or v_due_mileage>99999999999.9 or v_due_mileage<>round(v_due_mileage,1)))
      or length(coalesce(v_notes,''))>2000 then
      raise exception 'Invalid maintenance date, mileage or notes' using errcode='22023'; end if;
    select coalesce(max(m.mileage),0) into v_other_max from public.truck_maintenance m
      where m.truck_id=v_truck.id and m.id<>p_id;
    if v_mileage<v_other_max and v_maint.mileage>=v_other_max then
      v_block := v_block || jsonb_build_array('Corrected mileage cannot move behind later maintenance.'); end if;
    if exists (select 1 from public.truck_maintenance m where m.truck_id=v_truck.id and m.id<>p_id
      and ((m.service_date<v_maint.service_date and m.service_date>=v_date and m.mileage>v_mileage)
        or (m.service_date>v_maint.service_date and m.service_date<=v_date and m.mileage<v_mileage)
        or (m.service_date<v_date and m.mileage>v_mileage)
        or (m.service_date>v_date and m.mileage<v_mileage))) then
      v_block := v_block || jsonb_build_array('Maintenance date and mileage must remain chronological.'); end if;
    v_old := jsonb_build_object('type',v_maint.maintenance_type,'date',v_maint.service_date,
      'mileage',v_maint.mileage,'nextDueDate',v_maint.next_due_date,
      'nextDueMileage',v_maint.next_due_mileage,'notes',v_maint.notes);
    v_new := jsonb_build_object('type',btrim(p_changes->>'type'),'date',v_date,
      'mileage',v_mileage,'nextDueDate',v_due_date,'nextDueMileage',v_due_mileage,'notes',v_notes);
  else raise exception 'Invalid Truck correction type' using errcode='22023'; end if;
  v_state := jsonb_build_object('truck',to_jsonb(v_truck),'renewals',
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)
      from public.truck_renewals r where r.truck_id=v_truck.id),
    'maintenance',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb)
      from public.truck_maintenance m where m.truck_id=v_truck.id));
  if v_old=v_new then v_block := v_block || jsonb_build_array('Make at least one change.'); end if;
  return jsonb_build_object('originalValues',v_old,'proposedValues',v_new,
    'affectedRecords',jsonb_build_array(jsonb_build_object('type','truck_'||p_kind,'id',p_id),
      jsonb_build_object('type','truck','id',v_truck.id)),
    'expectedInventoryChanges','[]'::jsonb,'expectedFinancialChanges','[]'::jsonb,
    'blockedReasons',v_block,'eligible',jsonb_array_length(v_block)=0,
    'versionToken',private.phase7_version(p_org,'truck_'||p_kind,p_id,v_state));
end;
$$;

create function public.preview_truck_correction(p_organization_id uuid,p_truck_record_id uuid,
  p_kind text,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id,array['owner_admin']) then
    raise exception 'Owner/Admin access required' using errcode='42501'; end if;
  return private.inspect_truck_correction(p_organization_id,p_truck_record_id,p_kind,p_changes);
end;
$$;

create function public.apply_truck_correction(p_organization_id uuid,p_truck_record_id uuid,
  p_kind text,p_actor_user_id uuid,p_reason text,p_request_id uuid,
  p_expected_version text,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_truck_id uuid; v_preview jsonb; v_new jsonb; v_id uuid;
  v_old_mileage numeric; v_current numeric;
begin
  perform 1 from public.profiles p join public.organization_memberships m on m.user_id=p.id
    where p.id=p_actor_user_id and p.active and m.organization_id=p_organization_id
      and m.role='owner_admin' and m.active for share of p,m;
  if not found then raise exception 'Owner/Admin access required' using errcode='42501'; end if;
  if p_kind='truck' then v_truck_id:=p_truck_record_id;
  elsif p_kind='renewal' then select truck_id into v_truck_id from public.truck_renewals where id=p_truck_record_id;
  elsif p_kind='maintenance' then select truck_id into v_truck_id from public.truck_maintenance where id=p_truck_record_id;
  else raise exception 'Invalid Truck correction type' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,17003));
  select current_mileage into v_current from public.trucks
    where id=v_truck_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Truck not found' using errcode='P0002'; end if;
  perform 1 from public.truck_renewals where truck_id=v_truck_id order by id for update;
  perform 1 from public.truck_maintenance where truck_id=v_truck_id order by id for update;
  v_preview:=private.inspect_truck_correction(p_organization_id,p_truck_record_id,p_kind,p_changes);
  perform private.assert_correction_request(p_organization_id,p_actor_user_id,p_reason,
    p_request_id,p_expected_version,v_preview->>'versionToken');
  if not (v_preview->>'eligible')::boolean then
    raise exception 'Truck correction blocked: %',v_preview->'blockedReasons' using errcode='55000'; end if;
  v_new:=v_preview->'proposedValues';
  if p_kind='truck' then
    update public.trucks set unit_name=v_new->>'unitName',plate_number=v_new->>'plateNumber',
      make_model=v_new->>'makeModel',current_mileage=(v_new->>'mileage')::numeric,
      lto_registration_expiry=(v_new->>'ltoExpiry')::date,
      active=(v_new->>'active')::boolean where id=v_truck_id;
  elsif p_kind='renewal' then
    update public.truck_renewals set renewal_date=(v_new->>'date')::date,
      next_renewal_date=(v_new->>'nextDate')::date,notes=v_new->>'notes'
      where id=p_truck_record_id;
  else
    select mileage into v_old_mileage from public.truck_maintenance where id=p_truck_record_id;
    update public.truck_maintenance set maintenance_type=v_new->>'type',
      service_date=(v_new->>'date')::date,mileage=(v_new->>'mileage')::numeric,
      next_due_date=(v_new->>'nextDueDate')::date,
      next_due_mileage=(v_new->>'nextDueMileage')::numeric,
      notes=v_new->>'notes' where id=p_truck_record_id;
    if v_current=v_old_mileage then
      update public.trucks set current_mileage=(select greatest(coalesce(max(mileage),0),0)
        from public.truck_maintenance where truck_id=v_truck_id) where id=v_truck_id;
    elsif (v_new->>'mileage')::numeric>v_current then
      update public.trucks set current_mileage=(v_new->>'mileage')::numeric where id=v_truck_id;
    end if;
  end if;
  v_id:=private.phase7_evidence(p_organization_id,p_actor_user_id,'truck',p_truck_record_id,
    'correct_'||p_kind,p_reason,p_request_id,p_expected_version,v_preview);
  return jsonb_build_object('correctionId',v_id,'truckRecordId',p_truck_record_id);
end;
$$;

-- The Edge Function alone holds the service credential; direct mutation RPCs
-- are not available to browser roles.
revoke all on function private.phase7_version(uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.phase7_evidence(uuid,uuid,text,uuid,text,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function private.inspect_dtr_correction(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.inspect_payroll_correction(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function private.inspect_truck_correction(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function private.record_truck_mileage() from public,anon,authenticated;
revoke all on function private.guard_phase7_attendance_insert(),
  private.guard_phase7_payroll_entry_insert() from public,anon,authenticated;
revoke all on function public.preview_dtr_correction(uuid,uuid,jsonb),
  public.preview_payroll_correction(uuid,uuid,text,jsonb),
  public.preview_truck_correction(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.preview_dtr_correction(uuid,uuid,jsonb),
  public.preview_payroll_correction(uuid,uuid,text,jsonb),
  public.preview_truck_correction(uuid,uuid,text,jsonb) to authenticated;
revoke all on function public.apply_dtr_correction(uuid,uuid,uuid,text,uuid,text,jsonb),
  public.apply_payroll_correction(uuid,uuid,text,uuid,text,uuid,text,jsonb),
  public.apply_truck_correction(uuid,uuid,text,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_dtr_correction(uuid,uuid,uuid,text,uuid,text,jsonb),
  public.apply_payroll_correction(uuid,uuid,text,uuid,text,uuid,text,jsonb),
  public.apply_truck_correction(uuid,uuid,text,uuid,text,uuid,text,jsonb) to service_role;
