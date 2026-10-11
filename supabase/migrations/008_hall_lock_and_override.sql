-- 008_hall_lock_and_override.sql
-- Migration: Multi-Stage Approval Chain, Hall Locking, and Event Office Venue Override

-- 1. Ensure User Roles Enum includes all approval and proposer roles
alter type user_role add value if not exists 'student';
alter type user_role add value if not exists 'faculty';
alter type user_role add value if not exists 'student_affairs';
alter type user_role add value if not exists 'event_office';
alter type user_role add value if not exists 'cd';

-- 2. Create organizations table and add organization fields to events table
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('club', 'department')),
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;
drop policy if exists "organizations_select_all" on organizations;
create policy "organizations_select_all"
  on organizations for select
  to anon, authenticated
  using (true);

grant select on organizations to anon, authenticated;

-- Insert default organizations
insert into organizations (name, type)
values
  ('Coding Club', 'club'),
  ('Robotics & Automation Club', 'club'),
  ('Spic Macay & Cultural Club', 'club'),
  ('ACM Student Chapter', 'club'),
  ('Computer Science and Engineering', 'department'),
  ('Data Science & AI', 'department'),
  ('Electronics & Communication Engineering', 'department')
on conflict (name) do nothing;

alter table events
add column if not exists approval_stage text default 'student_affairs' check (
  approval_stage in ('student_affairs', 'event_office', 'cd')
);

alter table events
add column if not exists requested_hall_id uuid references halls(id) on delete restrict;

alter table events
add column if not exists organizer_type text default 'standalone' check (
  organizer_type in ('standalone', 'club', 'department')
);

alter table events
add column if not exists organization_id uuid references organizations(id) on delete set null;

-- Backfill existing rows
update events
set approval_stage = case
  when status = 'approved' then 'cd'
  else 'student_affairs'
end
where approval_stage is null;

update events
set requested_hall_id = hall_id
where requested_hall_id is null;

update events e
set
  organization_id = o.id,
  organizer_type = o.type
from organizations o
where e.club_or_dept = o.name and e.organization_id is null;

update events
set organizer_type = 'standalone'
where organizer_type is null;

-- 3. Create event_approvals audit & history table
create table if not exists event_approvals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  stage text not null, -- 'student_affairs', 'event_office', 'cd'
  approver_email text not null,
  decision text not null check (decision in ('approved', 'rejected', 'venue_changed')),
  reason text,
  created_at timestamptz not null default now()
);

alter table event_approvals enable row level security;

drop policy if exists "event_approvals_select" on event_approvals;
create policy "event_approvals_select"
  on event_approvals for select
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = event_approvals.event_id
        and (
          e.organizer_email = (auth.jwt() ->> 'email')
          or current_user_role()::text in ('student_affairs', 'affairs', 'event_office', 'cd')
        )
    )
  );

grant select on event_approvals to authenticated;

-- 4. Recreate Hall Clash Exclusion Constraint
-- Holds the hall from the moment Event Office approves it (approval_stage = 'cd') until approved or rejected
alter table events drop constraint if exists events_hall_time_no_overlap;

alter table events
add constraint events_hall_time_no_overlap
exclude using gist (
  hall_id with =,
  tstzrange(start_time, end_time) with &&
) where (status = 'approved' or (status = 'submitted' and approval_stage = 'cd'));

-- 5. Helper Function: Check Hall Overlap with currently locked events
create or replace function check_hall_locked(
  p_event_id uuid,
  p_hall_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from events e
    where (p_event_id is null or e.id <> p_event_id)
      and (e.status = 'approved' or (e.status = 'submitted' and e.approval_stage = 'cd'))
      and e.hall_id = p_hall_id
      and tstzrange(e.start_time, e.end_time) && tstzrange(p_start, p_end)
  );
$$;

-- 6. Trigger: Validate Event Submissions and Edits
create or replace function handle_event_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  u_role text;
begin
  -- Always refresh updated_at
  new.updated_at := now();

  user_email := auth.jwt() ->> 'email';
  u_role := current_user_role()::text;

  -- If modified by service_role or outside auth context (e.g. admin seeds/migrations)
  if auth.role() = 'service_role' or user_email is null then
    return new;
  end if;

  -- Proposers (student, faculty, and legacy club/department)
  if u_role in ('student', 'faculty', 'club', 'department') then
    -- Organizer can only edit their own event
    if old.organizer_email <> user_email then
      raise exception 'You do not have permission to modify events created by another organizer.';
    end if;

    -- Organizer cannot change organizer_email
    if new.organizer_email <> old.organizer_email then
      raise exception 'Organizer email cannot be changed.';
    end if;

    -- Block proposers from editing a submitted event at all
    if old.status = 'submitted' and new.status = 'submitted' then
      raise exception 'Cannot edit an event that is currently submitted for approval.';
    end if;

    -- Organizer cannot set status directly to 'approved' or 'rejected'
    if (new.status = 'approved' and old.status <> 'approved') or (new.status = 'rejected') then
      raise exception 'Only authorized approval roles can approve or reject events.';
    end if;

    -- Transition from draft/rejected -> submitted
    if old.status in ('draft', 'rejected') and new.status = 'submitted' then
      -- Check if requested hall is already locked
      if check_hall_locked(new.id, new.hall_id, new.start_time, new.end_time) then
        raise exception 'Another event has booked this hall for that time. Please choose a different hall or time.';
      end if;

      new.requested_hall_id := new.hall_id;
      new.approval_stage := 'student_affairs';
      new.rejection_reason := null;
    end if;

    -- If APPROVED event changes venue or timing, restart approval chain at student_affairs
    if old.status = 'approved' and (
      old.hall_id is distinct from new.hall_id or
      old.start_time is distinct from new.start_time or
      old.end_time is distinct from new.end_time
    ) then
      -- Check if new hall is already locked
      if check_hall_locked(new.id, new.hall_id, new.start_time, new.end_time) then
        raise exception 'Another event has booked this hall for that time. Please choose a different hall or time.';
      end if;

      new.status := 'submitted';
      new.approval_stage := 'student_affairs';
      new.requested_hall_id := new.hall_id;
      new.rejection_reason := null;
    end if;

    return new;
  end if;

  -- Approver roles (student_affairs, affairs, event_office, cd)
  if u_role in ('student_affairs', 'affairs', 'event_office', 'cd') then
    -- If event_office changes hall_id directly during submitted stage, ensure requested_hall_id is unchanged
    if u_role = 'event_office' and old.status = 'submitted' and old.approval_stage = 'event_office' then
      if old.hall_id is distinct from new.hall_id then
        -- Preserve requested_hall_id and approval_stage
        new.requested_hall_id := old.requested_hall_id;
        new.approval_stage := 'event_office';
        new.status := 'submitted';
      end if;
      return new;
    end if;

    -- Block any other role from changing hall_id on a submitted event
    if old.status = 'submitted' and old.hall_id is distinct from new.hall_id then
      raise exception 'Only the Event Office can change the venue of a submitted event.';
    end if;

    return new;
  end if;

  raise exception 'You do not have permission to update events.';
end;
$$;

-- Trigger for INSERT on events
create or replace function handle_event_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u_role text;
begin
  u_role := current_user_role()::text;

  -- Set requested_hall_id to hall_id on creation
  if new.requested_hall_id is null then
    new.requested_hall_id := new.hall_id;
  end if;

  if new.status = 'submitted' then
    new.approval_stage := 'student_affairs';

    -- Check overlap with locked events
    if check_hall_locked(new.id, new.hall_id, new.start_time, new.end_time) then
      raise exception 'Another event has booked this hall for that time. Please choose a different hall or time.';
    end if;
  else
    new.approval_stage := coalesce(new.approval_stage, 'student_affairs');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_events_before_insert on events;
create trigger trg_events_before_insert
before insert on events
for each row
execute function handle_event_insert();

-- 7. Function: set_event_venue (Security Definer Event Office Override)
create or replace function set_event_venue(
  p_event_id uuid,
  p_hall_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role text;
  v_event record;
  v_old_hall record;
  v_new_hall record;
  v_reason text;
begin
  v_caller_email := auth.jwt() ->> 'email';
  v_caller_role := current_user_role()::text;

  if v_caller_role is distinct from 'event_office' and auth.role() <> 'service_role' then
    raise exception 'Only the event_office role can change event venues.';
  end if;

  select * into v_event from events where id = p_event_id;
  if not found then
    raise exception 'Event not found.';
  end if;

  if v_event.status <> 'submitted' or v_event.approval_stage <> 'event_office' then
    raise exception 'Venue can only be changed while the event is submitted and at the event_office approval stage.';
  end if;

  if v_event.hall_id = p_hall_id then
    return;
  end if;

  select * into v_old_hall from halls where id = v_event.hall_id;
  select * into v_new_hall from halls where id = p_hall_id;

  if not found then
    raise exception 'Target hall does not exist.';
  end if;

  -- Construct description
  v_reason := 'Venue changed from ' || coalesce(v_old_hall.name, 'Previous Hall') || ' to ' || v_new_hall.name;
  if p_note is not null and trim(p_note) <> '' then
    v_reason := v_reason || ' (' || trim(p_note) || ')';
  end if;

  -- Update event hall_id without changing stage or status
  update events
  set hall_id = p_hall_id,
      updated_at = now()
  where id = p_event_id;

  -- Insert event_approvals audit entry
  insert into event_approvals (
    event_id,
    stage,
    approver_email,
    decision,
    reason
  ) values (
    p_event_id,
    'event_office',
    coalesce(v_caller_email, 'eventoffice@demo.edu'),
    'venue_changed',
    v_reason
  );
end;
$$;

grant execute on function set_event_venue to authenticated;

-- 8. Function: decide_event (Security Definer Approval Chain Handler)
create or replace function decide_event(
  p_event_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role text;
  v_event record;
  v_current_stage text;
  v_next_stage text;
begin
  v_caller_email := auth.jwt() ->> 'email';
  v_caller_role := current_user_role()::text;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be either "approved" or "rejected".';
  end if;

  select * into v_event from events where id = p_event_id;
  if not found then
    raise exception 'Event not found.';
  end if;

  if v_event.status <> 'submitted' then
    raise exception 'Only submitted events can be decided.';
  end if;

  v_current_stage := coalesce(v_event.approval_stage, 'student_affairs');

  -- Authorization check per stage
  if v_current_stage = 'student_affairs' then
    if v_caller_role not in ('affairs', 'student_affairs') and auth.role() <> 'service_role' then
      raise exception 'Only Student Welfare / Affairs can review events at the student_affairs stage.';
    end if;
  elsif v_current_stage = 'event_office' then
    if v_caller_role <> 'event_office' and auth.role() <> 'service_role' then
      raise exception 'Only the Event Office can review events at the event_office stage.';
    end if;
  elsif v_current_stage = 'cd' then
    if v_caller_role <> 'cd' and auth.role() <> 'service_role' then
      raise exception 'Only the Campus Director (CD) can review events at the cd stage.';
    end if;
  else
    raise exception 'Invalid approval stage: %', v_current_stage;
  end if;

  -- Handle REJECTION
  if p_decision = 'rejected' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'A non-empty rejection reason is required when rejecting an event.';
    end if;

    update events
    set status = 'rejected',
        rejection_reason = trim(p_reason),
        updated_at = now()
    where id = p_event_id;

    insert into event_approvals (
      event_id,
      stage,
      approver_email,
      decision,
      reason
    ) values (
      p_event_id,
      v_current_stage,
      coalesce(v_caller_email, 'approver@demo.edu'),
      'rejected',
      trim(p_reason)
    );

    return jsonb_build_object(
      'status', 'rejected',
      'stage', v_current_stage,
      'message', 'Event rejected.'
    );
  end if;

  -- Handle APPROVAL at each stage
  if v_current_stage = 'student_affairs' then
    v_next_stage := 'event_office';

    update events
    set approval_stage = v_next_stage,
        updated_at = now()
    where id = p_event_id;

    insert into event_approvals (
      event_id,
      stage,
      approver_email,
      decision,
      reason
    ) values (
      p_event_id,
      'student_affairs',
      coalesce(v_caller_email, 'affairs@demo.edu'),
      'approved',
      p_reason
    );

    return jsonb_build_object(
      'status', 'submitted',
      'stage', v_next_stage,
      'message', 'Approved by Student Welfare. Forwarded to Event Office.'
    );

  elsif v_current_stage = 'event_office' then
    v_next_stage := 'cd';

    -- Advancing to 'cd' stage activates the hall exclusion constraint lock!
    begin
      update events
      set approval_stage = v_next_stage,
          updated_at = now()
      where id = p_event_id;
    exception
      when exclusion_violation then
        raise exception 'This hall is already booked for that time by another event. Please change the venue and approve again.';
    end;

    insert into event_approvals (
      event_id,
      stage,
      approver_email,
      decision,
      reason
    ) values (
      p_event_id,
      'event_office',
      coalesce(v_caller_email, 'eventoffice@demo.edu'),
      'approved',
      p_reason
    );

    return jsonb_build_object(
      'status', 'submitted',
      'stage', v_next_stage,
      'message', 'Approved by Event Office. Hall reserved and forwarded to Campus Director.'
    );

  elsif v_current_stage = 'cd' then
    -- Final approval by CD: status becomes 'approved'
    update events
    set status = 'approved',
        rejection_reason = null,
        updated_at = now()
    where id = p_event_id;

    insert into event_approvals (
      event_id,
      stage,
      approver_email,
      decision,
      reason
    ) values (
      p_event_id,
      'cd',
      coalesce(v_caller_email, 'cd@demo.edu'),
      'approved',
      p_reason
    );

    return jsonb_build_object(
      'status', 'approved',
      'stage', 'cd',
      'message', 'Final approval granted by Campus Director. Event is now live.'
    );
  end if;

  raise exception 'Unhandled approval stage: %', v_current_stage;
end;
$$;

grant execute on function decide_event to authenticated;

-- 9. Update public_hall_bookings view
-- Locked events (approved, or submitted at stage 'cd') appear as 'booked'.
-- Pending-stage events (student_affairs or event_office) appear as 'pending'.
-- Locked events appear as "Booked: another event" with title only if status = 'approved'.
-- Pending-stage events show title as "Pending request".
drop view if exists public_hall_bookings cascade;

create view public_hall_bookings
with (security_invoker = false)
as
select
  e.hall_id,
  h.name as hall_name,
  case
    when e.status = 'approved' then e.title
    when e.status = 'submitted' and e.approval_stage = 'cd' then 'Booked: another event'
    else 'Pending request'
  end as title,
  e.start_time,
  e.end_time,
  case
    when e.status = 'approved' or (e.status = 'submitted' and e.approval_stage = 'cd') then 'booked'
    else 'pending'
  end as status,
  e.approval_stage,
  e.id as event_id
from events e
join halls h on h.id = e.hall_id
where e.status in ('submitted', 'approved');

grant select on public_hall_bookings to anon, authenticated;

-- 10. Update RLS policies for events, fests, registrations, volunteers, and storage
drop policy if exists "events_select_affairs_non_draft" on events;
drop policy if exists "events_select_approvers_non_draft" on events;
create policy "events_select_approvers_non_draft"
  on events for select
  to authenticated
  using (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
    and status != 'draft'
  );

drop policy if exists "events_update_affairs" on events;
drop policy if exists "events_update_approvers" on events;
create policy "events_update_approvers"
  on events for update
  to authenticated
  using (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
    and status != 'draft'
  )
  with check (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
  );

-- Event Insert/Update for Proposers (student and faculty)
drop policy if exists "events_insert_organizer" on events;
drop policy if exists "events_insert_proposer" on events;
create policy "events_insert_proposer"
  on events for insert
  to authenticated
  with check (
    current_user_role()::text in ('student', 'faculty', 'club', 'department')
    and organizer_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "events_update_organizer_own" on events;
drop policy if exists "events_update_proposer_own" on events;
create policy "events_update_proposer_own"
  on events for update
  to authenticated
  using (
    organizer_email = (auth.jwt() ->> 'email')
  )
  with check (
    organizer_email = (auth.jwt() ->> 'email')
  );

-- Approver policies for registrations and volunteers
drop policy if exists "registrations_select_affairs_all" on registrations;
create policy "registrations_select_affairs_all"
  on registrations for select
  to authenticated
  using (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
  );

drop policy if exists "volunteers_select_affairs_all" on volunteers;
create policy "volunteers_select_affairs_all"
  on volunteers for select
  to authenticated
  using (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
  );

-- Approver policies for fests
drop policy if exists "fests_insert_affairs" on fests;
create policy "fests_insert_affairs"
  on fests for insert
  to authenticated
  with check (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
  );

drop policy if exists "fests_update_affairs" on fests;
create policy "fests_update_affairs"
  on fests for update
  to authenticated
  using (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
  )
  with check (
    current_user_role()::text in ('affairs', 'student_affairs', 'event_office', 'cd')
  );

-- Storage policies for Event Posters (Student & Faculty proposers)
drop policy if exists "Organizers Can Upload Event Posters" on storage.objects;
create policy "Organizers Can Upload Event Posters"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'event-posters' and
    current_user_role()::text in ('student', 'faculty', 'club', 'department')
);

drop policy if exists "Organizers Can Update Event Posters" on storage.objects;
create policy "Organizers Can Update Event Posters"
on storage.objects for update
to authenticated
using (
    bucket_id = 'event-posters' and
    current_user_role()::text in ('student', 'faculty', 'club', 'department')
);

drop policy if exists "Organizers Can Delete Event Posters" on storage.objects;
create policy "Organizers Can Delete Event Posters"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'event-posters' and
    current_user_role()::text in ('student', 'faculty', 'club', 'department')
);
