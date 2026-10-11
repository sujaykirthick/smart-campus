import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateOrganizerAdvice } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = body.organization_id || body.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organization_id is required to generate organization insights.' },
        { status: 400 }
      );
    }

    // 1. Verify membership server-side with is_org_member RPC or DB lookup
    const { data: isMember, error: rpcErr } = await supabase.rpc('is_org_member', {
      p_org_id: organizationId,
      p_email: user.email,
    });

    let authorized = isMember === true;

    // Fallback direct check if RPC had an issue or for approver roles
    if (!authorized) {
      const { data: profile } = await supabase
        .from('allowed_users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (profile && ['student_affairs', 'affairs', 'event_office', 'cd'].includes(profile.role)) {
        authorized = true;
      } else if (profile) {
        // Check organization type
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name, type')
          .eq('id', organizationId)
          .maybeSingle();

        if (org?.type === 'club') {
          const { data: memberRow } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('organization_id', organizationId)
            .ilike('email', user.email)
            .maybeSingle();
          if (memberRow) authorized = true;
        } else if (org?.type === 'department') {
          if (profile.role === 'faculty' && profile.department && org.name) {
            if (profile.department.trim().toLowerCase() === org.name.trim().toLowerCase()) {
              authorized = true;
            }
          } else if (profile.role === 'student' && profile.roll_no) {
            // Check course_code_departments
            const { data: ccd } = await supabase
              .from('course_code_departments')
              .select('organization_id, course_code')
              .eq('organization_id', organizationId);

            if (ccd && ccd.length > 0) {
              const lowerRoll = profile.roll_no.toLowerCase();
              const matched = ccd.some((c) => lowerRoll.includes(c.course_code.toLowerCase()));
              if (matched) authorized = true;
            }
          }
        }
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { error: 'Access denied: You are not an authorized member of this organization.' },
        { status: 403 }
      );
    }

    // 2. Fetch Organization Details
    const { data: organization, error: orgErr } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();

    if (orgErr || !organization) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    const orgName = organization.name;

    // 3. Fetch all past approved events for this organization
    const nowIso = new Date().toISOString();
    const { data: pastEvents, error: eventsErr } = await supabase
      .from('events')
      .select('*, halls:halls!events_hall_id_fkey(id, name, capacity)')
      .eq('organization_id', organizationId)
      .eq('status', 'approved')
      .lt('end_time', nowIso)
      .order('start_time', { ascending: false });

    if (eventsErr) {
      console.error('Error fetching past events for organization:', eventsErr);
      return NextResponse.json({ error: 'Failed to load past events.' }, { status: 500 });
    }

    if (!pastEvents || pastEvents.length === 0) {
      return NextResponse.json(
        { error: 'No past approved events found for this organization to generate planning advice.' },
        { status: 400 }
      );
    }

    const eventIds = pastEvents.map((e) => e.id);

    // 4. Fetch all registrations for these events
    const { data: registrations, error: regsErr } = await supabase
      .from('registrations')
      .select('event_id, status, checked_in_at')
      .in('event_id', eventIds);

    if (regsErr) {
      console.error('Error fetching registrations:', regsErr);
      return NextResponse.json({ error: 'Failed to load registration history.' }, { status: 500 });
    }

    // 5. Fetch all reviews for these events from anonymized view
    const { data: reviews, error: reviewsErr } = await supabase
      .from('event_reviews_public')
      .select('event_id, rating')
      .in('event_id', eventIds);

    if (reviewsErr) {
      console.error('Error fetching reviews:', reviewsErr);
      return NextResponse.json({ error: 'Failed to load review history.' }, { status: 500 });
    }

    // 6. Compute Aggregate Stats in SQL/Backend strictly
    const confirmedRegs = (registrations || []).filter((r) => r.status === 'confirmed');
    const attendedRegs = confirmedRegs.filter((r) => r.checked_in_at !== null);

    const totalRegistered = confirmedRegs.length;
    const totalAttended = attendedRegs.length;
    const overallNoShowRate =
      totalRegistered > 0
        ? Math.round(((totalRegistered - totalAttended) / totalRegistered) * 100)
        : 0;

    const allRatings = (reviews || []).map((r) => r.rating);
    const averageRating =
      allRatings.length > 0
        ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
        : 0;

    // Analyze best time slots
    const slotTurnoutMap: Record<string, { total: number; attended: number }> = {};
    const hallTurnoutMap: Record<string, { total: number; attended: number; hallName: string }> = {};

    pastEvents.forEach((ev) => {
      const startH = new Date(ev.start_time).getHours();
      let slotKey = 'Evening (5:00 PM onwards)';
      if (startH < 12) slotKey = 'Morning (Before 12:00 PM)';
      else if (startH < 17) slotKey = 'Afternoon (12:00 PM - 5:00 PM)';

      const evRegs = (registrations || []).filter(
        (r) => r.event_id === ev.id && r.status === 'confirmed'
      );
      const evAttended = evRegs.filter((r) => r.checked_in_at !== null);

      if (!slotTurnoutMap[slotKey]) slotTurnoutMap[slotKey] = { total: 0, attended: 0 };
      slotTurnoutMap[slotKey].total += evRegs.length;
      slotTurnoutMap[slotKey].attended += evAttended.length;

      const hallName = ev.halls?.name || 'Campus Venue';
      if (!hallTurnoutMap[ev.hall_id]) {
        hallTurnoutMap[ev.hall_id] = { total: 0, attended: 0, hallName };
      }
      hallTurnoutMap[ev.hall_id].total += evRegs.length;
      hallTurnoutMap[ev.hall_id].attended += evAttended.length;
    });

    const bestTimeSlots = Object.entries(slotTurnoutMap)
      .map(([slot, data]) => ({
        slot,
        rate: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .map((item) => `${item.slot} (${item.rate}% turnout)`);

    const topHalls = Object.values(hallTurnoutMap)
      .map((item) => ({
        name: item.hallName,
        rate: item.total > 0 ? Math.round((item.attended / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .map((item) => `${item.name} (${item.rate}% turnout)`);

    const stats = {
      totalEvents: pastEvents.length,
      totalRegistered,
      totalAttended,
      overallNoShowRate: Math.max(0, overallNoShowRate),
      averageRating,
      bestTimeSlots: bestTimeSlots.slice(0, 3),
      topHalls: topHalls.slice(0, 3),
    };

    // 7. Call Gemini AI with resilience (exponential backoff & fallback model)
    try {
      const advice = await generateOrganizerAdvice(orgName, stats);

      // Cache to organization_ai_advice table
      const { error: upsertErr } = await supabase
        .from('organization_ai_advice')
        .upsert(
          {
            organization_id: organizationId,
            advice,
            generated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id' }
        );

      if (upsertErr) {
        console.warn('Failed to cache organization advice to database:', upsertErr);
      }

      return NextResponse.json({
        success: true,
        summary: advice,
        event_count: pastEvents.length,
        stats,
      });
    } catch (aiErr: any) {
      console.error('All Gemini attempts failed for organization advice:', aiErr?.message || aiErr);

      // 8. Resilient Fallback: return cached advice from organization_ai_advice if available
      const { data: cachedAdviceRow } = await supabase
        .from('organization_ai_advice')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (cachedAdviceRow?.advice) {
        return NextResponse.json({
          success: true,
          summary: cachedAdviceRow.advice,
          event_count: pastEvents.length,
          stats,
          cached: true,
          notice: 'AI is currently busy. Displaying previously generated planning advice.',
        });
      }

      return NextResponse.json(
        { error: 'AI is busy, try again' },
        { status: 503 }
      );
    }
  } catch (err: any) {
    console.error('Unexpected error in generate-insights route:', err);
    return NextResponse.json(
      { error: 'AI is busy, try again' },
      { status: 500 }
    );
  }
}
