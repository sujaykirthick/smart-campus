-- 002.sql
-- Migration: Event Proposal & Approval Flow updates

-- 1. Recreate exclusion constraint on events for WHERE (status = 'approved') only
-- (First to be approved wins; submitted events no longer block halls)
alter table events drop constraint if exists events_hall_time_no_overlap;

alter table events
add constraint events_hall_time_no_overlap
exclude using gist (
  hall_id with =,
  tstzrange(start_time, end_time) with &&
) where (status = 'approved');

-- 2. Add fest column to events table
alter table events
add column if not exists fest text check (
  fest is null or fest in ('Anokha', 'Amritotsavam', 'Gokulashtami', 'Onam', 'Other')
);

-- 3. Create Storage bucket 'event-posters' (Public)
insert into storage.buckets (id, name, public)
values ('event-posters', 'event-posters', true)
on conflict (id) do update set public = true;

-- 4. Set up Storage RLS Policies for event-posters
-- Note: Enable RLS on storage.objects if not already enabled (Supabase standard)
create policy "Public Access to Event Posters"
  on storage.objects for select
  using (bucket_id = 'event-posters');

create policy "Organizers Can Upload Event Posters"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-posters'
    and (
      current_user_role() in ('club', 'department')
      or auth.role() = 'service_role'
    )
  );

create policy "Organizers Can Update Event Posters"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-posters'
    and (
      current_user_role() in ('club', 'department')
      or auth.role() = 'service_role'
    )
  );

create policy "Organizers Can Delete Event Posters"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-posters'
    and (
      current_user_role() in ('club', 'department')
      or auth.role() = 'service_role'
    )
  );
