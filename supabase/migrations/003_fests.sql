-- 003_fests.sql
-- Migration: Proper Fests System & Event Fest Relation

-- 1. Create fests table
create table if not exists fests (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default false,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

-- 2. Seed initial default fests (all inactive)
insert into fests (name, is_active)
values
  ('Anokha', false),
  ('Amritotsavam', false),
  ('Gokulashtami', false),
  ('Onam', false)
on conflict (name) do nothing;

-- 3. Add fest_id column to events table
alter table events
add column if not exists fest_id uuid references fests(id) on delete set null;

-- 4. Migrate any existing events.fest text values to matching fests rows, then drop events.fest
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'events' and column_name = 'fest'
  ) then
    -- Ensure any other fest names in events exist in fests table
    insert into fests (name, is_active)
    select distinct e.fest, false
    from events e
    where e.fest is not null
      and not exists (select 1 from fests f where f.name = e.fest)
    on conflict (name) do nothing;

    -- Migrate values
    update events e
    set fest_id = f.id
    from fests f
    where e.fest = f.name;

    -- Drop obsolete text column
    alter table events drop column fest;
  end if;
end $$;

-- 5. RLS for fests table
alter table fests enable row level security;

create policy "fests_select_all"
  on fests for select
  using (true);

create policy "fests_insert_affairs"
  on fests for insert
  to authenticated
  with check (
    current_user_role() = 'affairs'
    or auth.role() = 'service_role'
  );

create policy "fests_update_affairs"
  on fests for update
  to authenticated
  using (
    current_user_role() = 'affairs'
    or auth.role() = 'service_role'
  )
  with check (
    current_user_role() = 'affairs'
    or auth.role() = 'service_role'
  );

grant select on fests to anon, authenticated;

-- 6. Trigger: enforce only active fests when setting/changing fest_id
create or replace function check_event_fest_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_fest_active boolean;
begin
  -- Service role bypass for administrative/seed operations
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Standalone events (fest_id is null) are always allowed
  if new.fest_id is null then
    return new;
  end if;

  -- On UPDATE, if fest_id is unchanged, permit update without checking is_active
  if TG_OP = 'UPDATE' and old.fest_id is not distinct from new.fest_id then
    return new;
  end if;

  -- Look up target fest active status
  select is_active into target_fest_active from public.fests where id = new.fest_id;

  if target_fest_active is null then
    raise exception 'Selected fest does not exist.';
  end if;

  if not target_fest_active then
    raise exception 'Cannot assign event to an inactive fest. Only active fests can accept new event submissions.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_event_fest_active on events;
create trigger trg_check_event_fest_active
before insert or update of fest_id on events
for each row
execute function check_event_fest_active();
