-- 005b_scan_window.sql
-- Migration: Extended Scan Check-in Window & Mutual Exclusion (Volunteer vs Participant)

-- 1. MUTUAL EXCLUSION: PREVENT STUDENT FROM BEING BOTH PARTICIPANT AND VOLUNTEER

-- Update handle_registration_before_insert to reject if student already applied as volunteer
create or replace function handle_registration_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_roll text;
  ev_status event_status;
  ev_start timestamptz;
  ev_end timestamptz;
  ev_hall_id uuid;
  hall_cap int;
  curr_confirmed_count int;
begin
  -- Mutual exclusion check: cannot register if already applied/enrolled as a volunteer
  if exists (
    select 1 from public.volunteers
    where event_id = new.event_id
      and student_email = new.student_email
  ) then
    raise exception 'You cannot register as a participant because you have applied or served as a volunteer for this event.';
  end if;

  -- Look up student's roll_no from allowed_users (ignore any client supplied value)
  select roll_no into student_roll from public.allowed_users where email = new.student_email;
  new.roll_no := student_roll;

  -- Look up event status, timing, and hall venue
  select status, start_time, end_time, hall_id
  into ev_status, ev_start, ev_end, ev_hall_id
  from public.events
  where id = new.event_id;

  if ev_status is null then
    raise exception 'Event does not exist.';
  end if;

  if ev_status != 'approved' then
    raise exception 'Only approved events accept registrations.';
  end if;

  if now() > ev_end then
    raise exception 'Registration is closed because the event has already ended.';
  end if;

  -- Capacity check: count confirmed registrations
  select capacity into hall_cap from public.halls where id = ev_hall_id;
  select count(*) into curr_confirmed_count
  from public.registrations
  where event_id = new.event_id and status = 'confirmed';

  -- If full, put on waitlist instead of raising exception
  if hall_cap is not null and curr_confirmed_count >= hall_cap then
    new.status := 'waitlisted';
    new.waitlisted_at := coalesce(new.waitlisted_at, now());
  else
    new.status := 'confirmed';
    new.waitlisted_at := null;
  end if;

  return new;
end;
$$;

-- Trigger to reject volunteer application if student already registered as participant
create or replace function handle_volunteer_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mutual exclusion check: cannot apply as volunteer if already a participant
  if exists (
    select 1 from public.registrations
    where event_id = new.event_id
      and student_email = new.student_email
  ) then
    raise exception 'You cannot apply as a volunteer because you are already registered as a participant for this event.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_volunteers_before_insert on public.volunteers;
create trigger trg_volunteers_before_insert
before insert on public.volunteers
for each row
execute function handle_volunteer_before_insert();


-- 2. UPDATE SCAN_CHECKIN WITH EXTENDED SCANNING WINDOW (30 MIN BEFORE START UNTIL 30 MIN AFTER END)
create or replace function scan_checkin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  caller_role user_role;
  v_reg record;
  v_event record;
  v_student_name text;
  v_is_accepted_volunteer boolean := false;
begin
  caller_email := auth.jwt() ->> 'email';
  caller_role := current_user_role();

  if caller_email is null then
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

  -- Check if caller is an accepted volunteer for this event
  select exists (
    select 1 from public.volunteers v
    where v.event_id = v_event.id
      and v.student_email = caller_email
      and v.status = 'accepted'
  ) into v_is_accepted_volunteer;

  -- Authorization check: Caller must be the event organizer, affairs, OR an accepted volunteer
  if v_event.organizer_email <> caller_email and caller_role <> 'affairs' and not v_is_accepted_volunteer then
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
  select name into v_student_name from public.allowed_users where email = v_reg.student_email;
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

grant execute on function scan_checkin(text) to authenticated;
