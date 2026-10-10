-- 006_reviews.sql
-- Migration: Event Reviews, Anonymized Public View, and AI Summaries Cache

-- 1. REVIEWS TABLE
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_email text not null,
  rating int not null check (rating between 1 and 5),
  comment text null,
  created_at timestamptz not null default now(),
  unique (event_id, student_email)
);

-- Enable RLS on reviews table
alter table public.reviews enable row level security;

-- Insert policy: only students who attended (checked_in_at is not null) and the event has ended
create policy "reviews_insert_attended_student"
  on public.reviews for insert
  to authenticated
  with check (
    current_user_role() = 'student'
    and student_email = (auth.jwt() ->> 'email')
    and exists (
      select 1 from public.registrations r
      join public.events e on e.id = r.event_id
      where r.event_id = reviews.event_id
        and r.student_email = (auth.jwt() ->> 'email')
        and r.checked_in_at is not null
        and now() > e.end_time
    )
  );

-- Select policy: students can read only their own review
create policy "reviews_select_student_own"
  on public.reviews for select
  to authenticated
  using (
    student_email = (auth.jwt() ->> 'email')
  );

-- Update policy: students can update their own review
create policy "reviews_update_student_own"
  on public.reviews for update
  to authenticated
  using (
    student_email = (auth.jwt() ->> 'email')
  )
  with check (
    student_email = (auth.jwt() ->> 'email')
  );

-- 2. ANONYMIZED EVENT REVIEWS VIEW (NO STUDENT EMAIL)
-- Event owner and affairs can read all reviews for their events anonymously
create or replace view public.event_reviews_public as
  select r.id, r.event_id, r.rating, r.comment, r.created_at
  from public.reviews r
  join public.events e on e.id = r.event_id
  where e.organizer_email = (auth.jwt() ->> 'email')
     or current_user_role() = 'affairs'
     or r.student_email = (auth.jwt() ->> 'email')
     or auth.role() = 'service_role';

grant select on public.event_reviews_public to authenticated, anon;


-- 3. EVENT AI SUMMARIES TABLE (PER-EVENT CACHE)
create table if not exists public.event_ai_summaries (
  event_id uuid primary key references public.events(id) on delete cascade,
  summary jsonb not null,
  review_count int not null default 0,
  generated_at timestamptz not null default now()
);

alter table public.event_ai_summaries enable row level security;

create policy "ai_summaries_select"
  on public.event_ai_summaries for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_ai_summaries.event_id
        and (e.organizer_email = (auth.jwt() ->> 'email') or current_user_role() = 'affairs')
    )
    or auth.role() = 'service_role'
  );

create policy "ai_summaries_write"
  on public.event_ai_summaries for all
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_ai_summaries.event_id
        and (e.organizer_email = (auth.jwt() ->> 'email') or current_user_role() = 'affairs')
    )
    or auth.role() = 'service_role'
  );


-- 4. ORGANIZER LEVEL AI INSIGHTS TABLE (ORGANIZER-WIDE CACHE)
create table if not exists public.organizer_ai_insights (
  organizer_email text primary key,
  summary jsonb not null,
  event_count int not null default 0,
  generated_at timestamptz not null default now()
);

alter table public.organizer_ai_insights enable row level security;

create policy "org_insights_select"
  on public.organizer_ai_insights for select
  to authenticated
  using (
    organizer_email = (auth.jwt() ->> 'email')
    or current_user_role() = 'affairs'
    or auth.role() = 'service_role'
  );

create policy "org_insights_write"
  on public.organizer_ai_insights for all
  to authenticated
  using (
    organizer_email = (auth.jwt() ->> 'email')
    or current_user_role() = 'affairs'
    or auth.role() = 'service_role'
  );
