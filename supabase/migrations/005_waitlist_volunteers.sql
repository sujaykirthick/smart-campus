-- 005_waitlist_volunteers.sql
-- Migration: Event Waitlist, Automatic Promotion, and Volunteer Management

-- 1. WAITLIST COLUMNS ON REGISTRATIONS
alter table public.registrations
  add column if not exists status text not null default 'confirmed' check (status in ('confirmed', 'waitlisted')),
  add column if not exists waitlisted_at timestamptz null;

-- Update any pre-existing rows to confirmed
update public.registrations
set status = 'confirmed'
where status is null;

-- 2. VOLUNTEERS SYSTEM
-- Add volunteers_needed to events
alter table public.events
  add column if not exists volunteers_needed int default 0;

-- Create volunteers table
create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  applied_at timestamptz not null default now(),
  unique (event_id, student_email)
);

-- Enable RLS on volunteers table
alter table public.volunteers enable row level security;

-- Policies for volunteers:
-- Students can select their own volunteer applications
create policy "volunteers_select_student_own"
  on public.volunteers for select
  to authenticated
  using (
    student_email = (auth.jwt() ->> 'email')
  );

-- Event owner can select volunteer applications for their events
create policy "volunteers_select_organizer_event"
  on public.volunteers for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = volunteers.event_id
        and e.organizer_email = (auth.jwt() ->> 'email')
    )
  );

-- Affairs can select all volunteer applications
create policy "volunteers_select_affairs_all"
  on public.volunteers for select
  to authenticated
  using (
    current_user_role() = 'affairs'
    or auth.role() = 'service_role'
  );

-- Students can insert their own application for approved events that have not ended and need volunteers
create policy "volunteers_insert_student"
  on public.volunteers for insert
  to authenticated
  with check (
    current_user_role() = 'student'
    and student_email = (auth.jwt() ->> 'email')
    and exists (
      select 1 from public.events e
      where e.id = volunteers.event_id
        and e.status = 'approved'
        and now() <= e.end_time
        and coalesce(e.volunteers_needed, 0) > 0
    )
  );

-- Event owner can update status (e.g. accept/reject) for applications on their events
create policy "volunteers_update_organizer"
  on public.volunteers for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = volunteers.event_id
        and e.organizer_email = (auth.jwt() ->> 'email')
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = volunteers.event_id
        and e.organizer_email = (auth.jwt() ->> 'email')
    )
  );

-- 3. REFINED REGISTRATION BEFORE INSERT TRIGGER (AUTO-WAITLIST)
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

-- 4. AFTER DELETE TRIGGER ON REGISTRATIONS: ATOMIC PROMOTION OF EARLIEST WAITLISTED STUDENT
create or replace function handle_registration_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev_start timestamptz;
  next_waitlisted_id uuid;
begin
  -- Only promote if a confirmed registration was deleted/cancelled
  if old.status = 'confirmed' then
    -- Atomically lock the event row to prevent race conditions during promotion
    select start_time into ev_start
    from public.events
    where id = old.event_id
    for update;

    -- Only promote if the event has not started yet
    if ev_start is not null and now() < ev_start then
      -- Select and lock the earliest waitlisted registration
      select id into next_waitlisted_id
      from public.registrations
      where event_id = old.event_id and status = 'waitlisted'
      order by waitlisted_at asc, registered_at asc
      limit 1
      for update;

      if next_waitlisted_id is not null then
        update public.registrations
        set status = 'confirmed',
            waitlisted_at = null
        where id = next_waitlisted_id;
      end if;
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_registrations_after_delete on public.registrations;
create trigger trg_registrations_after_delete
after delete on public.registrations
for each row
execute function handle_registration_after_delete();

-- 5. UPDATE SCAN_CHECKIN: SUPPORT VOLUNTEERS & ENFORCE CONFIRMED STATUS
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

grant execute on function scan_checkin(text) to authenticated;

-- 6. UPDATE EVENT_REGISTRATION_COUNTS VIEW (CONFIRMED VS WAITLISTED)
create or replace view public.event_registration_counts as
  select
    event_id,
    count(*) filter (where status = 'confirmed')::int as registered_count,
    count(*) filter (where status = 'waitlisted')::int as waitlist_count
  from public.registrations
  group by event_id;

grant select on public.event_registration_counts to authenticated, anon;
