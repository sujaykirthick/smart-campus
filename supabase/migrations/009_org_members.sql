-- 009_org_members.sql
-- Organization membership, department mappings, and organization-level insights

-- 1. Add faculty_coordinator to organizations
alter table if exists public.organizations
  add column if not exists faculty_coordinator text null;

-- 2. Course Code to Department mapping table
create table if not exists public.course_code_departments (
  course_code text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 3. SQL function to parse course code from a student roll number
-- Format: 'cb.ps.i5das24049' -> 3rd part 'i5das24049' -> strip trailing 5 digits -> 'i5das'
create or replace function public.parse_course_code(roll_no text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
  part3 text;
begin
  if roll_no is null or trim(roll_no) = '' then
    return null;
  end if;

  parts := string_to_array(trim(lower(roll_no)), '.');
  if array_length(parts, 1) < 3 then
    return null;
  end if;

  part3 := parts[3];
  if part3 ~ '^[a-z0-9]+[0-9]{5}$' then
    return substring(part3 from 1 for length(part3) - 5);
  end if;

  return null;
end;
$$;

-- 4. Organization Members table (used for CLUBS only)
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  member_role text not null check (member_role in ('lead', 'member')) default 'member',
  added_by text null,
  created_at timestamptz not null default now(),
  primary key (organization_id, email)
);

-- 5. SQL function is_org_member(org_id uuid, p_email text)
create or replace function public.is_org_member(p_org_id uuid, p_email text default null)
returns boolean
language plpgsql
security definer
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

-- 6. RLS Policies on organization_members and course_code_departments
alter table public.organization_members enable row level security;
alter table public.course_code_departments enable row level security;

-- organization_members policies:
drop policy if exists "organization_members_select" on public.organization_members;
create policy "organization_members_select" on public.organization_members
for select using (
  (auth.jwt()->>'email' is not null and public.is_org_member(organization_id, auth.jwt()->>'email'))
  or exists (
    select 1 from public.allowed_users
    where lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
      and role in ('student_affairs', 'affairs', 'event_office', 'cd')
  )
  or auth.role() = 'service_role'
);

drop policy if exists "organization_members_modify" on public.organization_members;
create policy "organization_members_modify" on public.organization_members
for all using (
  exists (
    select 1 from public.allowed_users
    where lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
      and role in ('student_affairs', 'affairs')
  )
  or auth.role() = 'service_role'
);

-- course_code_departments policies:
drop policy if exists "course_code_departments_select" on public.course_code_departments;
create policy "course_code_departments_select" on public.course_code_departments
for select using (true);

drop policy if exists "course_code_departments_modify" on public.course_code_departments;
create policy "course_code_departments_modify" on public.course_code_departments
for all using (
  exists (
    select 1 from public.allowed_users
    where lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
      and role in ('student_affairs', 'affairs')
  )
  or auth.role() = 'service_role'
);

-- 7. Trigger to enforce organization membership when proposing an event
create or replace function public.check_event_org_membership()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.organizer_type in ('club', 'department') then
    if new.organization_id is null then
      raise exception 'An organization must be selected when proposing for a club or department.';
    end if;

    if not public.is_org_member(new.organization_id, new.organizer_email) then
      raise exception 'Access denied: You are not an authorized member/student/faculty of this organization.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_event_org_membership on public.events;
create trigger enforce_event_org_membership
before insert or update of organizer_type, organization_id, organizer_email on public.events
for each row
execute function public.check_event_org_membership();

-- 8. Anonymized Public Reviews View update
-- Readable by: event owner, any is_org_member of event's organization, and approvers
create or replace view public.event_reviews_public as
  select r.id, r.event_id, r.rating, r.comment, r.created_at
  from public.reviews r
  join public.events e on e.id = r.event_id
  where e.organizer_email = (auth.jwt() ->> 'email')
     or (e.organization_id is not null and public.is_org_member(e.organization_id, auth.jwt() ->> 'email'))
     or exists (
       select 1 from public.allowed_users
       where lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
         and role in ('student_affairs', 'affairs', 'event_office', 'cd')
     )
     or r.student_email = (auth.jwt() ->> 'email')
     or auth.role() = 'service_role';

grant select on public.event_reviews_public to authenticated, anon;

-- 9. Event AI Summaries RLS update
drop policy if exists "ai_summaries_select" on public.event_ai_summaries;
create policy "ai_summaries_select"
  on public.event_ai_summaries for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_ai_summaries.event_id
        and (
          e.organizer_email = (auth.jwt() ->> 'email')
          or (e.organization_id is not null and public.is_org_member(e.organization_id, auth.jwt() ->> 'email'))
          or exists (
            select 1 from public.allowed_users
            where lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
              and role in ('student_affairs', 'affairs', 'event_office', 'cd')
          )
        )
    )
    or auth.role() = 'service_role'
  );

-- 10. Organization Level AI Advice Table (cached advice per organization)
create table if not exists public.organization_ai_advice (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  advice jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.organization_ai_advice enable row level security;

drop policy if exists "org_advice_select" on public.organization_ai_advice;
create policy "org_advice_select"
  on public.organization_ai_advice for select
  to authenticated
  using (
    public.is_org_member(organization_id, auth.jwt() ->> 'email')
    or exists (
      select 1 from public.allowed_users
      where lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
        and role in ('student_affairs', 'affairs', 'event_office', 'cd')
    )
    or auth.role() = 'service_role'
  );

drop policy if exists "org_advice_write" on public.organization_ai_advice;
create policy "org_advice_write"
  on public.organization_ai_advice for all
  to authenticated
  using (
    public.is_org_member(organization_id, auth.jwt() ->> 'email')
    or exists (
      select 1 from public.allowed_users
      where lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
        and role in ('student_affairs', 'affairs', 'event_office', 'cd')
    )
    or auth.role() = 'service_role'
  );

-- 11. Helper SQL Function to compute organization-level aggregates
create or replace function public.get_organization_event_stats(p_org_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_past_events_count int := 0;
  v_total_registered int := 0;
  v_total_attended int := 0;
  v_no_show_rate int := 0;
  v_avg_rating numeric := 0;
begin
  select count(*) into v_past_events_count
  from public.events
  where organization_id = p_org_id
    and status = 'approved'
    and end_time < now();

  select
    coalesce(count(*), 0),
    coalesce(count(*) filter (where r.checked_in_at is not null), 0)
  into v_total_registered, v_total_attended
  from public.registrations r
  join public.events e on e.id = r.event_id
  where e.organization_id = p_org_id
    and e.status = 'approved'
    and e.end_time < now()
    and r.status = 'confirmed';

  if v_total_registered > 0 then
    v_no_show_rate := round(((v_total_registered - v_total_attended)::numeric / v_total_registered::numeric) * 100);
  end if;

  select coalesce(avg(rv.rating), 0)
  into v_avg_rating
  from public.reviews rv
  join public.events e on e.id = rv.event_id
  where e.organization_id = p_org_id
    and e.status = 'approved'
    and e.end_time < now();

  return jsonb_build_object(
    'total_events', v_past_events_count,
    'total_registered', v_total_registered,
    'total_attended', v_total_attended,
    'no_show_rate', v_no_show_rate,
    'average_rating', round(v_avg_rating, 2)
  );
end;
$$;

-- 12. Initial seed mappings for course_code_departments
do $$
declare
  v_ds_id uuid;
  v_cse_id uuid;
  v_ece_id uuid;
begin
  select id into v_ds_id from public.organizations where name = 'Data Science & AI' limit 1;
  select id into v_cse_id from public.organizations where name = 'Computer Science and Engineering' limit 1;
  select id into v_ece_id from public.organizations where name = 'Electronics & Communication Engineering' limit 1;

  if v_ds_id is not null then
    insert into public.course_code_departments (course_code, organization_id)
    values ('i5das', v_ds_id)
    on conflict (course_code) do update set organization_id = excluded.organization_id;

    insert into public.course_code_departments (course_code, organization_id)
    values ('u4aie', v_ds_id)
    on conflict (course_code) do update set organization_id = excluded.organization_id;
  end if;

  if v_cse_id is not null then
    insert into public.course_code_departments (course_code, organization_id)
    values ('u4cse', v_cse_id)
    on conflict (course_code) do update set organization_id = excluded.organization_id;

    insert into public.course_code_departments (course_code, organization_id)
    values ('cse', v_cse_id)
    on conflict (course_code) do update set organization_id = excluded.organization_id;
  end if;

  if v_ece_id is not null then
    insert into public.course_code_departments (course_code, organization_id)
    values ('u4ece', v_ece_id)
    on conflict (course_code) do update set organization_id = excluded.organization_id;
  end if;
end $$;

-- 13. RPC Functions for Student Affairs Club Member Management
create or replace function public.add_club_member(
  p_club_id uuid,
  p_email text,
  p_role text default 'member'
)
returns void
language plpgsql
security definer
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_email text;
  v_org_type text;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if auth.role() <> 'service_role' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;

    if v_caller_role is null or v_caller_role not in ('student_affairs', 'affairs') then
      raise exception 'Access denied: Only Student Affairs can add club members.';
    end if;
  end if;

  select type into v_org_type
  from public.organizations
  where id = p_club_id;

  if v_org_type is null or v_org_type <> 'club' then
    raise exception 'Invalid organization or organization is not a club.';
  end if;

  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'Email cannot be empty.';
  end if;

  if not exists (select 1 from public.allowed_users where lower(trim(email)) = v_email) then
    raise exception 'User with email "%" is not authorized in the allowed_users whitelist.', v_email;
  end if;

  if p_role not in ('lead', 'member') then
    raise exception 'Role must be either "lead" or "member".';
  end if;

  insert into public.organization_members (organization_id, email, member_role, added_by)
  values (p_club_id, v_email, p_role, v_caller_email)
  on conflict (organization_id, email) do update
  set member_role = excluded.member_role;
end;
$$;

create or replace function public.remove_club_member(
  p_club_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_email text;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if auth.role() <> 'service_role' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;

    if v_caller_role is null or v_caller_role not in ('student_affairs', 'affairs') then
      raise exception 'Access denied: Only Student Affairs can remove club members.';
    end if;
  end if;

  v_email := lower(trim(p_email));
  delete from public.organization_members
  where organization_id = p_club_id
    and lower(trim(email)) = v_email;
end;
$$;

create or replace function public.set_club_member_role(
  p_club_id uuid,
  p_email text,
  p_role text
)
returns void
language plpgsql
security definer
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_email text;
begin
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if auth.role() <> 'service_role' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;

    if v_caller_role is null or v_caller_role not in ('student_affairs', 'affairs') then
      raise exception 'Access denied: Only Student Affairs can update club member roles.';
    end if;
  end if;

  if p_role not in ('lead', 'member') then
    raise exception 'Role must be either "lead" or "member".';
  end if;

  v_email := lower(trim(p_email));
  update public.organization_members
  set member_role = p_role
  where organization_id = p_club_id
    and lower(trim(email)) = v_email;
end;
$$;

grant execute on function public.add_club_member(uuid, text, text) to authenticated, anon;
grant execute on function public.remove_club_member(uuid, text) to authenticated, anon;
grant execute on function public.set_club_member_role(uuid, text, text) to authenticated, anon;

