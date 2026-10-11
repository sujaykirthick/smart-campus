-- 013_club_exclusivity_and_scanner_access.sql
-- 1. Enforce strict club & department exclusivity on events (insert & update)
-- 2. Reject standalone events with organization_id set
-- 3. Restrict approvers from changing organization_id / organizer_type
-- 4. Provide security definer get_scanner_event_data for accepted volunteers

-- 1. Ensure is_org_member function is robust and handles case/trimming
create or replace function public.is_org_member(p_org_id uuid, p_email text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_org_type text;
  v_org_name text;
  v_user_role user_role;
  v_roll_no text;
  v_dept text;
  v_course_code text;
  v_mapped_org_id uuid;
begin
  v_email := lower(trim(coalesce(p_email, auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_email is null or v_email = '' or p_org_id is null then
    return false;
  end if;

  select type, name into v_org_type, v_org_name
  from public.organizations
  where id = p_org_id;

  if not found then
    return false;
  end if;

  if v_org_type = 'club' then
    return exists (
      select 1 from public.organization_members
      where organization_id = p_org_id
        and lower(trim(email)) = v_email
    );
  elsif v_org_type = 'department' then
    select role, roll_no, department into v_user_role, v_roll_no, v_dept
    from public.allowed_users
    where lower(trim(email)) = v_email;

    if not found then
      return false;
    end if;

    -- If caller is student: check parse_course_code(roll_no) -> course_code_departments
    if v_user_role = 'student' and v_roll_no is not null then
      v_course_code := public.parse_course_code(v_roll_no);
      if v_course_code is not null then
        select organization_id into v_mapped_org_id
        from public.course_code_departments
        where lower(trim(course_code)) = lower(trim(v_course_code));

        if v_mapped_org_id is not null and v_mapped_org_id = p_org_id then
          return true;
        end if;
      end if;
    end if;

    -- If caller is faculty: check allowed_users.department matches org name
    if v_user_role = 'faculty' and v_dept is not null then
      if lower(trim(v_dept)) = lower(trim(v_org_name)) then
        return true;
      end if;
    end if;

    return false;
  end if;

  return false;
end;
$$;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.is_org_member(p_org_id, null);
end;
$$;

grant execute on function public.is_org_member(uuid, text) to authenticated, anon;
grant execute on function public.is_org_member(uuid) to authenticated, anon;


-- 2. Strict BEFORE INSERT OR UPDATE trigger on events
create or replace function public.check_event_org_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_org_type text;
begin
  -- Service role bypass for background admin tasks
  if auth.role() = 'service_role' then
    return new;
  end if;

  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));

  -- Look up caller role
  if v_caller_email is not null and v_caller_email <> '' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;
  end if;

  -- Default null organizer_type to standalone
  if new.organizer_type is null then
    new.organizer_type := 'standalone';
  end if;

  -- Approver roles (student_affairs, event_office, cd) moving an event through the approval chain
  if v_caller_role is not null 
     and v_caller_role::text in ('student_affairs', 'event_office', 'cd') 
     and lower(trim(coalesce(new.organizer_email, ''))) <> v_caller_email then
    -- Approvers moving event cannot change organization_id or organizer_type
    if tg_op = 'UPDATE' then
      if new.organization_id is distinct from old.organization_id or new.organizer_type is distinct from old.organizer_type then
        raise exception 'Approvers cannot change event organization.';
      end if;
    end if;
    return new;
  end if;

  -- Non-approver proposers must set organizer_email to their own email
  if v_caller_email is not null and v_caller_email <> '' then
    if lower(trim(coalesce(new.organizer_email, ''))) <> v_caller_email then
      raise exception 'You can only propose events for yourself.';
    end if;
  end if;

  -- Rule 1: Standalone requires organization_id is null
  if new.organizer_type = 'standalone' then
    if new.organization_id is not null then
      raise exception 'Standalone events cannot have an organization assigned.';
    end if;
    return new;
  end if;

  -- Rule 2: Club or department organizer types
  if new.organizer_type in ('club', 'department') then
    if new.organization_id is null then
      raise exception 'You are not authorized to host events for this club. Ask Student Affairs to add you.';
    end if;

    select type into v_org_type
    from public.organizations
    where id = new.organization_id;

    if not found or v_org_type <> new.organizer_type then
      raise exception 'You are not authorized to host events for this club. Ask Student Affairs to add you.';
    end if;

    -- The caller must be an authorized member of the organization
    if not public.is_org_member(new.organization_id, v_caller_email) then
      raise exception 'You are not authorized to host events for this club. Ask Student Affairs to add you.';
    end if;
  else
    raise exception 'Invalid organizer type: %', new.organizer_type;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_event_org_membership on public.events;
create trigger enforce_event_org_membership
before insert or update on public.events
for each row
execute function public.check_event_org_membership();


-- 3. Security Definer can_scan function
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

grant execute on function public.can_scan(uuid) to authenticated, anon;


-- 4. Security Definer get_scanner_event_data for scanner page
-- Loads only what the scanner needs: title, times, counters, and checked-in list (name & roll_no).
-- Does NOT expose attendee emails, un-checked-in attendees, or OD download to volunteers.
create or replace function public.get_scanner_event_data(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_event record;
  v_hall_name text;
  v_hall_cap int;
  v_is_owner boolean;
  v_total_registered int;
  v_total_checked_in int;
  v_checked_in_list jsonb;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated';
  end if;

  if not public.can_scan(p_event_id) then
    raise exception 'Unauthorized: You are not an organizer or accepted volunteer for this event.';
  end if;

  select e.*, h.name as h_name, h.capacity as h_cap
  into v_event
  from public.events e
  left join public.halls h on h.id = e.hall_id
  where e.id = p_event_id;

  if v_event is null then
    raise exception 'Event not found';
  end if;

  v_is_owner := (lower(trim(v_event.organizer_email)) = v_caller_email);

  -- Count total confirmed registrations
  select count(*) into v_total_registered
  from public.registrations
  where event_id = p_event_id and status = 'confirmed';

  -- Count checked in attendees
  select count(*) into v_total_checked_in
  from public.registrations
  where event_id = p_event_id and checked_in_at is not null;

  -- Build sanitized checked-in list (name, roll_no, checked_in_at only)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roll_no', r.roll_no,
        'student_name', coalesce(u.name, split_part(r.student_email, '@', 1)),
        'checked_in_at', r.checked_in_at
      ) order by r.checked_in_at desc
    ),
    '[]'::jsonb
  ) into v_checked_in_list
  from public.registrations r
  left join public.allowed_users u on lower(trim(u.email)) = lower(trim(r.student_email))
  where r.event_id = p_event_id
    and r.checked_in_at is not null;

  return jsonb_build_object(
    'event_id', v_event.id,
    'title', v_event.title,
    'description', v_event.description,
    'start_time', v_event.start_time,
    'end_time', v_event.end_time,
    'status', v_event.status,
    'hall_name', coalesce(v_event.h_name, 'Campus Venue'),
    'hall_capacity', v_event.h_cap,
    'organizer_email', v_event.organizer_email,
    'is_owner', v_is_owner,
    'registered_count', v_total_registered,
    'checked_in_count', v_total_checked_in,
    'checked_in_list', v_checked_in_list
  );
end;
$$;

grant execute on function public.get_scanner_event_data(uuid) to authenticated, anon;


-- 5. Security Definer scan_checkin
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

grant execute on function public.scan_checkin(text) to authenticated, anon;


-- 6. Security Definer decide_volunteer functions
create or replace function public.decide_volunteer(p_volunteer_id uuid, p_decision text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_vol record;
  v_event record;
  v_accepted_count integer;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated.';
  end if;

  select * into v_vol from public.volunteers where id = p_volunteer_id;
  if v_vol is null then
    raise exception 'Volunteer application not found.';
  end if;

  select * into v_event from public.events where id = v_vol.event_id;
  if v_event is null then
    raise exception 'Event not found.';
  end if;

  if lower(trim(v_event.organizer_email)) <> v_caller_email and auth.role() <> 'service_role' then
    raise exception 'Access denied: Only the event host can decide volunteer applications.';
  end if;

  if p_decision not in ('accepted', 'rejected', 'pending') then
    raise exception 'Invalid decision. Must be accepted, rejected, or pending.';
  end if;

  update public.volunteers
  set status = p_decision,
      decided_at = case when p_decision = 'pending' then null else now() end,
      decided_by = case when p_decision = 'pending' then null else v_caller_email end
  where id = p_volunteer_id;

  select count(*) into v_accepted_count
  from public.volunteers
  where event_id = v_vol.event_id and status = 'accepted';

  return v_accepted_count;
end;
$$;

create or replace function public.decide_volunteer(p_event_id uuid, p_student_email text, p_decision text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id uuid;
begin
  select id into v_vol_id
  from public.volunteers
  where event_id = p_event_id and lower(trim(student_email)) = lower(trim(p_student_email));

  if v_vol_id is null then
    raise exception 'Volunteer application not found for this student and event.';
  end if;

  return public.decide_volunteer(v_vol_id, p_decision);
end;
$$;

grant execute on function public.decide_volunteer(uuid, text) to authenticated, anon;
grant execute on function public.decide_volunteer(uuid, text, text) to authenticated, anon;

