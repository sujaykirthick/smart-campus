-- 014_seed_helpers.sql
-- Security Definer RPC for idempotent batch demo data seeding
-- Temporarily sets session_replication_role to replica so historical/approved
-- events, registrations, and approvals can be restored without triggering timing blocks.

create or replace function public.admin_seed_batch(
  p_events jsonb default '[]'::jsonb,
  p_approvals jsonb default '[]'::jsonb,
  p_registrations jsonb default '[]'::jsonb,
  p_volunteers jsonb default '[]'::jsonb,
  p_reviews jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_events int := 0;
  v_inserted_approvals int := 0;
  v_inserted_registrations int := 0;
  v_inserted_volunteers int := 0;
  v_inserted_reviews int := 0;
begin
  -- Only allow service_role to invoke this
  if auth.role() <> 'service_role' then
    raise exception 'Unauthorized: Only service_role can invoke admin_seed_batch';
  end if;

  -- Temporarily disable user triggers during seed batch
  set local session_replication_role = 'replica';

  -- 1. Insert events
  if jsonb_array_length(p_events) > 0 then
    insert into public.events (
      id, title, description, organizer_email, club_or_dept, organizer_type, organization_id,
      hall_id, requested_hall_id, start_time, end_time, status, approval_stage,
      rejection_reason, volunteers_needed, registration_link, poster_url, fest_id,
      created_at, updated_at
    )
    select
      (e->>'id')::uuid,
      e->>'title',
      e->>'description',
      e->>'organizer_email',
      e->>'club_or_dept',
      e->>'organizer_type',
      (e->>'organization_id')::uuid,
      (e->>'hall_id')::uuid,
      coalesce((e->>'requested_hall_id')::uuid, (e->>'hall_id')::uuid),
      (e->>'start_time')::timestamptz,
      (e->>'end_time')::timestamptz,
      (e->>'status')::event_status,
      coalesce(e->>'approval_stage', 'student_affairs'),
      e->>'rejection_reason',
      coalesce((e->>'volunteers_needed')::int, 0),
      e->>'registration_link',
      e->>'poster_url',
      (e->>'fest_id')::uuid,
      coalesce((e->>'created_at')::timestamptz, now()),
      coalesce((e->>'updated_at')::timestamptz, now())
    from jsonb_array_elements(p_events) as e
    on conflict (id) do update set
      title = excluded.title,
      description = excluded.description,
      organizer_email = excluded.organizer_email,
      club_or_dept = excluded.club_or_dept,
      organizer_type = excluded.organizer_type,
      organization_id = excluded.organization_id,
      hall_id = excluded.hall_id,
      requested_hall_id = excluded.requested_hall_id,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      status = excluded.status,
      approval_stage = excluded.approval_stage,
      rejection_reason = excluded.rejection_reason,
      volunteers_needed = excluded.volunteers_needed,
      registration_link = excluded.registration_link,
      poster_url = excluded.poster_url,
      fest_id = excluded.fest_id,
      updated_at = excluded.updated_at;

    get diagnostics v_inserted_events = row_count;
  end if;

  -- 2. Insert approvals
  if jsonb_array_length(p_approvals) > 0 then
    insert into public.event_approvals (
      id, event_id, stage, approver_email, decision, reason, created_at
    )
    select
      coalesce((a->>'id')::uuid, gen_random_uuid()),
      (a->>'event_id')::uuid,
      a->>'stage',
      a->>'approver_email',
      a->>'decision',
      a->>'reason',
      coalesce((a->>'created_at')::timestamptz, now())
    from jsonb_array_elements(p_approvals) as a;

    get diagnostics v_inserted_approvals = row_count;
  end if;

  -- 3. Insert registrations
  if jsonb_array_length(p_registrations) > 0 then
    insert into public.registrations (
      id, event_id, student_email, roll_no, qr_token, status,
      registered_at, checked_in_at, checked_in_by, waitlisted_at
    )
    select
      coalesce((r->>'id')::uuid, gen_random_uuid()),
      (r->>'event_id')::uuid,
      lower(trim(r->>'student_email')),
      r->>'roll_no',
      coalesce(r->>'qr_token', encode(gen_random_bytes(24), 'hex')),
      coalesce(r->>'status', 'confirmed'),
      coalesce((r->>'registered_at')::timestamptz, now()),
      (r->>'checked_in_at')::timestamptz,
      r->>'checked_in_by',
      (r->>'waitlisted_at')::timestamptz
    from jsonb_array_elements(p_registrations) as r;

    get diagnostics v_inserted_registrations = row_count;
  end if;

  -- 4. Insert volunteers
  if jsonb_array_length(p_volunteers) > 0 then
    insert into public.volunteers (
      id, event_id, student_email, status, applied_at, decided_at, decided_by
    )
    select
      coalesce((v->>'id')::uuid, gen_random_uuid()),
      (v->>'event_id')::uuid,
      lower(trim(v->>'student_email')),
      coalesce(v->>'status', 'pending'),
      coalesce((v->>'applied_at')::timestamptz, now()),
      (v->>'decided_at')::timestamptz,
      v->>'decided_by'
    from jsonb_array_elements(p_volunteers) as v;

    get diagnostics v_inserted_volunteers = row_count;
  end if;

  -- 5. Insert reviews
  if jsonb_array_length(p_reviews) > 0 then
    insert into public.reviews (
      id, event_id, student_email, rating, comment, created_at
    )
    select
      coalesce((rw->>'id')::uuid, gen_random_uuid()),
      (rw->>'event_id')::uuid,
      lower(trim(rw->>'student_email')),
      (rw->>'rating')::int,
      rw->>'comment',
      coalesce((rw->>'created_at')::timestamptz, now())
    from jsonb_array_elements(p_reviews) as rw;

    get diagnostics v_inserted_reviews = row_count;
  end if;

  -- Restore normal trigger behavior
  set local session_replication_role = 'origin';

  return jsonb_build_object(
    'events', v_inserted_events,
    'approvals', v_inserted_approvals,
    'registrations', v_inserted_registrations,
    'volunteers', v_inserted_volunteers,
    'reviews', v_inserted_reviews
  );
end;
$$;

grant execute on function public.admin_seed_batch(jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
