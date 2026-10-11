-- 011_volunteers_flow.sql
-- End-to-end Volunteers Flow: Security Definer RPC functions, RLS & scanning permissions

-- 1. Update public.volunteers schema
alter table public.volunteers
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by text;

-- Update status check constraint to include 'withdrawn'
alter table public.volunteers drop constraint if exists volunteers_status_check;
alter table public.volunteers add constraint volunteers_status_check
  check (status in ('pending', 'accepted', 'rejected', 'withdrawn'));

-- 2. Clean up old volunteer RLS policies (removing old roles 'club', 'department', 'affairs')
drop policy if exists "volunteers_select_student_own" on public.volunteers;
drop policy if exists "volunteers_select_organizer_event" on public.volunteers;
drop policy if exists "volunteers_select_affairs_all" on public.volunteers;
drop policy if exists "volunteers_insert_student" on public.volunteers;
drop policy if exists "volunteers_update_organizer" on public.volunteers;
drop policy if exists "volunteers_select_own" on public.volunteers;

-- RLS: Students can SELECT only their own rows (or service role)
-- Nobody can insert, update, or delete directly from client (only via security definer RPC functions)
alter table public.volunteers enable row level security;

create policy "volunteers_select_student_own"
  on public.volunteers for select
  to authenticated
  using (
    student_email = lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))))
    or auth.role() = 'service_role'
  );

-- 3. Function: apply_volunteer(p_event_id uuid)
-- Caller must be role 'student'
-- Event must be 'approved', not ended, volunteers_needed > 0
-- Caller must not be the event's owner
-- Re-applying after 'withdrawn' reopens as 'pending'
-- A 'rejected' student cannot re-apply
create or replace function public.apply_volunteer(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_event record;
  v_existing record;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated.';
  end if;

  -- Verify caller role is student
  select role into v_caller_role
  from public.allowed_users
  where lower(trim(email)) = v_caller_email;

  if v_caller_role is null or v_caller_role::text <> 'student' then
    raise exception 'Only students can apply as volunteers.';
  end if;

  -- Look up event
  select * into v_event
  from public.events
  where id = p_event_id;

  if v_event is null then
    raise exception 'Event not found.';
  end if;

  if v_event.status <> 'approved' then
    raise exception 'Volunteer applications are only accepted for approved events.';
  end if;

  if now() > v_event.end_time then
    raise exception 'This event has already ended.';
  end if;

  if coalesce(v_event.volunteers_needed, 0) <= 0 then
    raise exception 'This event does not require volunteers.';
  end if;

  if lower(trim(v_event.organizer_email)) = v_caller_email then
    raise exception 'You cannot apply to volunteer for your own event.';
  end if;

  -- Mutual exclusion: cannot apply if registered as participant
  if exists (
    select 1 from public.registrations
    where event_id = p_event_id
      and lower(trim(student_email)) = v_caller_email
  ) then
    raise exception 'You cannot volunteer because you are already registered as a participant for this event.';
  end if;

  -- Check existing volunteer application
  select * into v_existing
  from public.volunteers
  where event_id = p_event_id
    and lower(trim(student_email)) = v_caller_email;

  if v_existing is not null then
    if v_existing.status = 'rejected' then
      raise exception 'Your volunteer application for this event was rejected and cannot be resubmitted.';
    elsif v_existing.status = 'pending' then
      raise exception 'You already have a pending volunteer application for this event.';
    elsif v_existing.status = 'accepted' then
      raise exception 'You are already an accepted volunteer for this event.';
    elsif v_existing.status = 'withdrawn' then
      -- Re-applying after 'withdrawn' reopens as 'pending'
      update public.volunteers
      set status = 'pending',
          applied_at = now(),
          decided_at = null,
          decided_by = null
      where id = v_existing.id;

      return jsonb_build_object('success', true, 'status', 'pending');
    end if;
  end if;

  insert into public.volunteers (event_id, student_email, status, applied_at)
  values (p_event_id, v_caller_email, 'pending', now());

  return jsonb_build_object('success', true, 'status', 'pending');
end;
$$;

-- 4. Function: withdraw_volunteer(p_event_id uuid)
-- Caller withdraws their own application
create or replace function public.withdraw_volunteer(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_existing record;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated.';
  end if;

  select * into v_existing
  from public.volunteers
  where event_id = p_event_id
    and lower(trim(student_email)) = v_caller_email;

  if v_existing is null then
    raise exception 'No volunteer application found for this event.';
  end if;

  if v_existing.status = 'withdrawn' then
    raise exception 'Application is already withdrawn.';
  end if;

  update public.volunteers
  set status = 'withdrawn',
      decided_at = now(),
      decided_by = v_caller_email
  where id = v_existing.id;

  return jsonb_build_object('success', true, 'status', 'withdrawn');
end;
$$;

-- 5. Function: list_event_volunteers(p_event_id uuid)
-- Caller must be the event owner (or role student_affairs/event_office/cd)
-- Returns volunteer id, student name, roll_no, email, status, applied_at
create or replace function public.list_event_volunteers(p_event_id uuid)
returns table (
  id uuid,
  name text,
  roll_no text,
  email text,
  status text,
  applied_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_event record;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated.';
  end if;

  select * into v_event from public.events where events.id = p_event_id;
  if v_event is null then
    raise exception 'Event not found.';
  end if;

  select role into v_caller_role
  from public.allowed_users
  where lower(trim(allowed_users.email)) = v_caller_email;

  if lower(trim(v_event.organizer_email)) <> v_caller_email
     and (v_caller_role is null or v_caller_role::text not in ('student_affairs', 'event_office', 'cd'))
     and auth.role() <> 'service_role' then
    raise exception 'Access denied: Only the event organizer or approval authorities can view volunteers.';
  end if;

  return query
  select
    v.id,
    coalesce(u.name, split_part(v.student_email, '@', 1)) as name,
    u.roll_no,
    v.student_email as email,
    v.status,
    v.applied_at
  from public.volunteers v
  left join public.allowed_users u on lower(trim(u.email)) = lower(trim(v.student_email))
  where v.event_id = p_event_id
  order by v.applied_at asc;
end;
$$;

-- 6. Function: decide_volunteer(p_volunteer_id uuid, p_decision text)
-- Caller must be the owner of that volunteer's event
-- Sets status, decided_at, decided_by; allowed until event ends
-- Returns new accepted count
create or replace function public.decide_volunteer(p_volunteer_id uuid, p_decision text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_vol record;
  v_event record;
  v_accepted_count integer;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated.';
  end if;

  if p_decision not in ('accepted', 'rejected', 'pending') then
    raise exception 'Invalid decision. Must be "accepted", "rejected", or "pending".';
  end if;

  select * into v_vol from public.volunteers where id = p_volunteer_id;
  if v_vol is null then
    raise exception 'Volunteer application not found.';
  end if;

  select * into v_event from public.events where id = v_vol.event_id;
  if v_event is null then
    raise exception 'Event not found.';
  end if;

  select role into v_caller_role
  from public.allowed_users
  where lower(trim(email)) = v_caller_email;

  -- Only event owner (or service role / approvers if needed) can decide
  if lower(trim(v_event.organizer_email)) <> v_caller_email
     and auth.role() <> 'service_role' then
    raise exception 'Access denied: Only the event owner can manage volunteer applications.';
  end if;

  if now() > v_event.end_time then
    raise exception 'Cannot modify volunteers for an event that has already ended.';
  end if;

  update public.volunteers
  set status = p_decision,
      decided_at = now(),
      decided_by = v_caller_email
  where id = p_volunteer_id;

  select count(*)::integer into v_accepted_count
  from public.volunteers
  where event_id = v_vol.event_id
    and status = 'accepted';

  return v_accepted_count;
end;
$$;

-- 7. Function: can_scan(p_event_id uuid)
-- Returns true if caller is event owner, accepted volunteer, or approver
create or replace function public.can_scan(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_event record;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    return false;
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event is null then
    return false;
  end if;

  -- 1. Event owner
  if lower(trim(v_event.organizer_email)) = v_caller_email then
    return true;
  end if;

  -- 2. Approver roles
  select role into v_caller_role
  from public.allowed_users
  where lower(trim(email)) = v_caller_email;

  if v_caller_role is not null and v_caller_role::text in ('student_affairs', 'event_office', 'cd') then
    return true;
  end if;

  -- 3. Accepted volunteer
  return exists (
    select 1 from public.volunteers
    where event_id = p_event_id
      and lower(trim(student_email)) = v_caller_email
      and status = 'accepted'
  );
end;
$$;

-- 8. Function: scan_checkin(p_token text)
-- Authorization uses can_scan, keeping scanning time window and existing behavior
create or replace function public.scan_checkin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  v_reg record;
  v_event record;
  v_student_name text;
  v_can_scan boolean;
begin
  caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if caller_email is null or caller_email = '' then
    return jsonb_build_object('status', 'invalid', 'message', 'Unauthenticated user.');
  end if;

  -- Look up registration by token
  select * into v_reg from public.registrations where qr_token = trim(p_token);
  if v_reg is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Invalid QR code token.');
  end if;

  -- Reject waitlisted tickets as invalid
  if v_reg.status != 'confirmed' then
    return jsonb_build_object('status', 'invalid', 'message', 'This pass is on the waitlist and not confirmed.');
  end if;

  -- Look up event
  select * into v_event from public.events where id = v_reg.event_id;
  if v_event is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Event not found.');
  end if;

  -- Authorization check: Caller must have scan permission (owner, accepted volunteer, approver)
  v_can_scan := public.can_scan(v_event.id);
  if not v_can_scan then
    return jsonb_build_object('status', 'invalid', 'message', 'Unauthorized: You are not an organizer or accepted volunteer for this event.');
  end if;

  -- Timing check: allowed check-in window is from 30 min before start until 30 min AFTER event end
  if now() < (v_event.start_time - interval '30 minutes') or now() > (v_event.end_time + interval '30 minutes') then
    return jsonb_build_object(
      'status', 'outside_window',
      'message', 'Scanning opens 30 min before start and closes 30 min after the event ends.'
    );
  end if;

  -- Student name resolution
  select name into v_student_name
  from public.allowed_users
  where lower(trim(email)) = lower(trim(v_reg.student_email));

  if v_student_name is null or v_student_name = '' then
    v_student_name := split_part(v_reg.student_email, '@', 1);
  end if;

  -- If already checked in
  if v_reg.checked_in_at is not null then
    return jsonb_build_object(
      'status', 'already_scanned',
      'checked_in_at', v_reg.checked_in_at,
      'roll_no', v_reg.roll_no,
      'student_name', v_student_name,
      'student_email', v_reg.student_email,
      'event_title', v_event.title
    );
  end if;

  -- Set check-in timestamp and caller
  update public.registrations
  set checked_in_at = now(),
      checked_in_by = caller_email
  where id = v_reg.id;

  return jsonb_build_object(
    'status', 'ok',
    'roll_no', v_reg.roll_no,
    'student_name', v_student_name,
    'student_email', v_reg.student_email,
    'event_title', v_event.title,
    'checked_in_at', now()
  );
end;
$$;

-- 9. Grants
grant execute on function public.apply_volunteer(uuid) to authenticated, anon;
grant execute on function public.withdraw_volunteer(uuid) to authenticated, anon;
grant execute on function public.list_event_volunteers(uuid) to authenticated, anon;
grant execute on function public.decide_volunteer(uuid, text) to authenticated, anon;
grant execute on function public.can_scan(uuid) to authenticated, anon;
grant execute on function public.scan_checkin(text) to authenticated, anon;
