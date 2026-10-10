-- 004_registrations.sql
-- Migration: Event Registrations, QR Check-in & OD Attendance System

-- 1. Create registrations table
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  student_email text not null,
  roll_no text,
  qr_token text unique not null default encode(gen_random_bytes(24), 'hex'),
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz null,
  checked_in_by text null,
  unique (event_id, student_email)
);

-- 2. BEFORE INSERT Trigger: enforce roll_no from allowed_users, event approved status & hall capacity
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
  curr_count int;
begin
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

  -- Capacity check: count for event >= hall's capacity
  select capacity into hall_cap from public.halls where id = ev_hall_id;
  select count(*) into curr_count from public.registrations where event_id = new.event_id;

  if hall_cap is not null and curr_count >= hall_cap then
    raise exception 'Event is full';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_registrations_before_insert on registrations;
create trigger trg_registrations_before_insert
before insert on registrations
for each row
execute function handle_registration_before_insert();

-- 3. Row Level Security (RLS) for registrations
alter table registrations enable row level security;

-- SELECT policies:
-- Students can select only their own registrations
create policy "registrations_select_student_own"
  on registrations for select
  to authenticated
  using (
    student_email = (auth.jwt() ->> 'email')
  );

-- Event organizers can select registrations for their own events
create policy "registrations_select_organizer_event"
  on registrations for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = registrations.event_id
        and e.organizer_email = (auth.jwt() ->> 'email')
    )
  );

-- Affairs can select all registrations
create policy "registrations_select_affairs_all"
  on registrations for select
  to authenticated
  using (
    current_user_role() = 'affairs'
    or auth.role() = 'service_role'
  );

-- INSERT policy:
-- Student can insert only their own row for approved events that have not ended
create policy "registrations_insert_student"
  on registrations for insert
  to authenticated
  with check (
    current_user_role() = 'student'
    and student_email = (auth.jwt() ->> 'email')
    and exists (
      select 1 from public.events e
      where e.id = registrations.event_id
        and e.status = 'approved'
        and now() <= e.end_time
    )
  );

-- DELETE policy:
-- Student can cancel registration only before the event starts
create policy "registrations_delete_student_before_start"
  on registrations for delete
  to authenticated
  using (
    current_user_role() = 'student'
    and student_email = (auth.jwt() ->> 'email')
    and exists (
      select 1 from public.events e
      where e.id = registrations.event_id
        and now() < e.start_time
    )
  );

-- 4. Function: scan_checkin (Security Definer)
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

  -- Look up event
  select * into v_event from public.events where id = v_reg.event_id;

  if v_event is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Event not found.');
  end if;

  -- Authorization check: Caller must be the event organizer (or affairs role)
  if v_event.organizer_email <> caller_email and caller_role <> 'affairs' then
    return jsonb_build_object('status', 'invalid', 'message', 'Unauthorized: You are not the organizer of this event.');
  end if;

  -- Timing check: allow check-in from 30 min before start until end
  if now() < (v_event.start_time - interval '30 minutes') then
    return jsonb_build_object('status', 'invalid', 'message', 'Check-in window is not open yet. (Opens 30 mins before event start)');
  end if;

  if now() > v_event.end_time then
    return jsonb_build_object('status', 'invalid', 'message', 'Check-in is closed because the event has already ended.');
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

-- 5. Helper view for seat availability counts
create or replace view event_registration_counts as
  select event_id, count(*)::int as registered_count
  from public.registrations
  group by event_id;

grant select on event_registration_counts to authenticated, anon;
grant execute on function scan_checkin(text) to authenticated;
