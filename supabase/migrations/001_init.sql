-- 001_init.sql
-- Migration: Campus Events Platform Database Foundation

-- 1. Enable btree_gist extension for exclusion constraints
create extension if not exists btree_gist;

-- 2. Create Enums
create type user_role as enum ('student', 'club', 'department', 'affairs');
create type event_status as enum ('draft', 'submitted', 'approved', 'rejected');

-- 3. Create allowed_users (Whitelist table)
create table allowed_users (
  email text primary key,
  role user_role not null,
  name text,
  club_name text,
  department text,
  roll_no text,
  created_at timestamptz not null default now()
);

-- 4. Create current_user_role() helper function
create or replace function current_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.allowed_users where email = (auth.jwt() ->> 'email');
$$;

-- 5. Create halls table
create table halls (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity int not null check (capacity > 0),
  location text,
  created_at timestamptz not null default now()
);

-- 6. Create events table
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  organizer_email text not null,
  club_or_dept text,
  hall_id uuid not null references halls(id) on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status event_status not null default 'draft',
  rejection_reason text,
  registration_link text,
  poster_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_end_after_start check (end_time > start_time)
);

-- 7. Clash blocking exclusion constraint
-- Exclude overlapping time intervals for the same hall when status is 'submitted' or 'approved'
alter table events
add constraint events_hall_time_no_overlap
exclude using gist (
  hall_id with =,
  tstzrange(start_time, end_time) with &&
) where (status in ('submitted', 'approved'));

-- 8. BEFORE UPDATE Trigger function on events
create or replace function handle_event_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  u_role user_role;
begin
  -- Always refresh updated_at
  new.updated_at := now();

  user_email := auth.jwt() ->> 'email';
  u_role := current_user_role();

  -- If modified by service_role or outside auth context (e.g. admin seeds/migrations)
  if auth.role() = 'service_role' or user_email is null then
    return new;
  end if;

  -- Rule 1: If old.status = 'approved' and hall_id, start_time or end_time changed, set status = 'submitted' (re-approval)
  if old.status = 'approved' and (
    old.hall_id is distinct from new.hall_id or
    old.start_time is distinct from new.start_time or
    old.end_time is distinct from new.end_time
  ) then
    new.status := 'submitted';
  end if;

  -- Rule 2: Enforce transitions by role
  if u_role = 'affairs' then
    -- Only affairs may set status to approved or rejected
    if new.status = 'rejected' then
      if new.rejection_reason is null or trim(new.rejection_reason) = '' then
        raise exception 'A non-empty rejection reason is required when rejecting an event.';
      end if;
    end if;
    return new;

  elsif u_role in ('club', 'department') then
    -- Organizer can only edit their own event
    if old.organizer_email <> user_email then
      raise exception 'You do not have permission to modify events created by another organizer.';
    end if;

    -- Organizer cannot change organizer_email
    if new.organizer_email <> old.organizer_email then
      raise exception 'Organizer email cannot be changed.';
    end if;

    -- Organizer cannot set status directly to 'approved' or 'rejected'
    if (new.status = 'approved' and old.status <> 'approved') or (new.status = 'rejected') then
      raise exception 'Only the affairs role can approve or reject events.';
    end if;

    -- If rejected -> submitted, clear rejection_reason
    if old.status = 'rejected' and new.status = 'submitted' then
      new.rejection_reason := null;
    end if;

    -- Validate organizer status transitions
    if new.status not in ('draft', 'submitted', 'approved') then
      raise exception 'Invalid event status transition for organizer.';
    end if;

    return new;
  else
    raise exception 'You do not have permission to update events.';
  end if;
end;
$$;

create trigger trg_events_before_update
before update on events
for each row
execute function handle_event_update();

-- 9. Public Hall Bookings View
create or replace view public_hall_bookings
with (security_invoker = false)
as
select
  e.hall_id,
  h.name as hall_name,
  e.title,
  e.start_time,
  e.end_time,
  e.status
from events e
join halls h on h.id = e.hall_id
where e.status in ('submitted', 'approved');

-- 10. Grant permissions
grant select on halls to anon, authenticated;
grant select on public_hall_bookings to anon, authenticated;

-- 11. Row Level Security (RLS)
alter table halls enable row level security;
alter table allowed_users enable row level security;
alter table events enable row level security;

-- RLS: halls
create policy "halls_select_all"
  on halls for select
  using (true);

-- RLS: allowed_users
create policy "allowed_users_select_own"
  on allowed_users for select
  to authenticated
  using (email = (auth.jwt() ->> 'email'));

-- RLS: events
-- Select policies
create policy "events_select_organizer_own"
  on events for select
  to authenticated
  using (organizer_email = (auth.jwt() ->> 'email'));

create policy "events_select_affairs_non_draft"
  on events for select
  to authenticated
  using (current_user_role() = 'affairs' and status != 'draft');

create policy "events_select_approved_all"
  on events for select
  using (status = 'approved');

-- Insert policy
create policy "events_insert_organizer"
  on events for insert
  to authenticated
  with check (
    current_user_role() in ('club', 'department')
    and organizer_email = (auth.jwt() ->> 'email')
    and status in ('draft', 'submitted')
  );

-- Update policies
create policy "events_update_organizer_own"
  on events for update
  to authenticated
  using (organizer_email = (auth.jwt() ->> 'email'))
  with check (organizer_email = (auth.jwt() ->> 'email'));

create policy "events_update_affairs"
  on events for update
  to authenticated
  using (current_user_role() = 'affairs' and status != 'draft')
  with check (current_user_role() = 'affairs');
