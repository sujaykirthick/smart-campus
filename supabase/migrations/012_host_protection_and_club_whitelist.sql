-- 012_host_protection_and_club_whitelist.sql
-- 1. Prevent event owner from registering for their own event (trigger on registrations)
-- 2. Enforce club and department whitelist authorization (trigger on events)
-- 3. Security definer is_org_member function

-- 1. Ensure course_code_departments table exists
create table if not exists public.course_code_departments (
  course_code text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. Ensure parse_course_code function exists
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

-- 3. Ensure organization_members table exists
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  member_role text not null check (member_role in ('lead', 'member')) default 'member',
  added_by text null,
  created_at timestamptz not null default now(),
  primary key (organization_id, email)
);

-- 4. is_org_member: security definer function to check club/department membership
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

-- Overload for single parameter signature is_org_member(p_org_id uuid)
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

-- 5. BEFORE INSERT trigger on registrations: Host cannot register for their own event
create or replace function public.prevent_owner_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_email text;
begin
  select lower(trim(organizer_email)) into v_organizer_email
  from public.events
  where id = new.event_id;

  if v_organizer_email is not null and lower(trim(new.student_email)) = v_organizer_email then
    raise exception 'You are hosting this event and cannot register for it';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_owner_registration on public.registrations;
create trigger trg_prevent_owner_registration
before insert on public.registrations
for each row
execute function public.prevent_owner_registration();

-- 6. BEFORE INSERT OR UPDATE trigger on events: Club Whitelist Enforcement
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
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));

  -- Service role bypass
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Approvers moving the event through the approval chain or editing venue/status bypass this check
  if v_caller_email is not null and v_caller_email <> '' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;

    if v_caller_role is not null 
       and v_caller_role::text in ('student_affairs', 'event_office', 'cd') 
       and lower(trim(coalesce(new.organizer_email, ''))) <> v_caller_email then
      return new;
    end if;
  end if;

  -- Enforce for club or department organizer types
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

    -- Proposer must be a verified member of the club / mapped department
    if not public.is_org_member(new.organization_id, coalesce(new.organizer_email, v_caller_email)) then
      raise exception 'You are not authorized to host events for this club. Ask Student Affairs to add you.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_event_org_membership on public.events;
create trigger enforce_event_org_membership
before insert or update of organizer_type, organization_id, organizer_email, status on public.events
for each row
execute function public.check_event_org_membership();

-- 7. Ensure RLS on events does not allow arbitrary student updates
alter table public.events enable row level security;

-- 8. Clean up any existing registrations where student_email = event.organizer_email
delete from public.registrations r
using public.events e
where r.event_id = e.id
  and lower(trim(r.student_email)) = lower(trim(e.organizer_email));
