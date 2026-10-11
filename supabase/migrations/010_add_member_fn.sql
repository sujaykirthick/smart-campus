-- 010_add_member_fn.sql
-- Security Definer RPC functions for Club Member Management by Student Affairs

-- Drop existing functions from 009 if they had conflicting parameter signatures
drop function if exists public.add_club_member(uuid, text, text);
drop function if exists public.remove_club_member(uuid, text);
drop function if exists public.set_club_member_role(uuid, text, text);

-- 1. add_club_member
create or replace function public.add_club_member(
  p_org_id uuid,
  p_email text,
  p_member_role text default 'member'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_target_email text;
  v_target_role user_role;
  v_org_type text;
begin
  -- Look up the caller with the function's own privileges
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated';
  end if;

  if auth.role() <> 'service_role' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;

    if v_caller_role is null or v_caller_role::text not in ('student_affairs', 'affairs') then
      raise exception 'Access denied: Only Student Affairs can manage club members.';
    end if;
  end if;

  -- Verify target organization exists and is a club
  select type into v_org_type
  from public.organizations
  where id = p_org_id;

  if v_org_type is null then
    raise exception 'Organization not found.';
  end if;

  if v_org_type <> 'club' then
    raise exception 'Organization is not a club. Department memberships are derived automatically from roll numbers.';
  end if;

  -- Validate role input
  if p_member_role not in ('lead', 'member') then
    raise exception 'Role must be either "lead" or "member".';
  end if;

  -- Sanitize target email
  v_target_email := lower(trim(p_email));
  if v_target_email is null or v_target_email = '' then
    raise exception 'Email cannot be empty.';
  end if;

  -- Look up target email in allowed_users using security definer privileges
  select role into v_target_role
  from public.allowed_users
  where lower(trim(email)) = v_target_email;

  if v_target_role is null then
    raise exception 'User with email "%" is not authorized in the allowed_users whitelist.', v_target_email;
  end if;

  -- Only allow roles 'student' or 'faculty'
  if v_target_role::text not in ('student', 'faculty') then
    raise exception 'Only students or faculty can be added as club members (user has role "%").', v_target_role;
  end if;

  -- Write to organization_members with added_by = caller email
  insert into public.organization_members (organization_id, email, member_role, added_by)
  values (p_org_id, v_target_email, p_member_role, v_caller_email)
  on conflict (organization_id, email) do update
  set member_role = excluded.member_role,
      added_by = excluded.added_by;
end;
$$;

-- 2. remove_club_member
create or replace function public.remove_club_member(
  p_org_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_target_email text;
begin
  -- Look up the caller with the function's own privileges
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated';
  end if;

  if auth.role() <> 'service_role' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;

    if v_caller_role is null or v_caller_role::text not in ('student_affairs', 'affairs') then
      raise exception 'Access denied: Only Student Affairs can manage club members.';
    end if;
  end if;

  v_target_email := lower(trim(p_email));
  if v_target_email is null or v_target_email = '' then
    raise exception 'Email cannot be empty.';
  end if;

  delete from public.organization_members
  where organization_id = p_org_id
    and lower(trim(email)) = v_target_email;
end;
$$;

-- 3. set_club_member_role
create or replace function public.set_club_member_role(
  p_org_id uuid,
  p_email text,
  p_member_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_caller_role user_role;
  v_target_email text;
  v_target_role user_role;
begin
  -- Look up the caller with the function's own privileges
  v_caller_email := lower(trim(coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.email', true))));
  if v_caller_email is null or v_caller_email = '' then
    raise exception 'Not authenticated';
  end if;

  if auth.role() <> 'service_role' then
    select role into v_caller_role
    from public.allowed_users
    where lower(trim(email)) = v_caller_email;

    if v_caller_role is null or v_caller_role::text not in ('student_affairs', 'affairs') then
      raise exception 'Access denied: Only Student Affairs can manage club members.';
    end if;
  end if;

  if p_member_role not in ('lead', 'member') then
    raise exception 'Role must be either "lead" or "member".';
  end if;

  v_target_email := lower(trim(p_email));
  if v_target_email is null or v_target_email = '' then
    raise exception 'Email cannot be empty.';
  end if;

  -- Verify target is in allowed_users with role 'student' or 'faculty'
  select role into v_target_role
  from public.allowed_users
  where lower(trim(email)) = v_target_email;

  if v_target_role is null then
    raise exception 'User with email "%" is not authorized in the allowed_users whitelist.', v_target_email;
  end if;

  if v_target_role::text not in ('student', 'faculty') then
    raise exception 'Only students or faculty can be club members (user has role "%").', v_target_role;
  end if;

  -- Ensure member exists in organization_members
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_org_id
      and lower(trim(email)) = v_target_email
  ) then
    raise exception 'Member not found in this club.';
  end if;

  update public.organization_members
  set member_role = p_member_role
  where organization_id = p_org_id
    and lower(trim(email)) = v_target_email;
end;
$$;

-- Grant execution privileges to authenticated and anon users
grant execute on function public.add_club_member(uuid, text, text) to authenticated, anon;
grant execute on function public.remove_club_member(uuid, text) to authenticated, anon;
grant execute on function public.set_club_member_role(uuid, text, text) to authenticated, anon;
