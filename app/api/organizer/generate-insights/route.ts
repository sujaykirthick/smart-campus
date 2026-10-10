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

    // Fetch user profile
    const { data: profile } = await supabase
      .from('allowed_users')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();

    const organizerEmail = user.email;
    const organizerName =
      profile?.club_name || profile?.department || profile?.name || organizerEmail.split('@')[0];

    // 1. Fetch all past approved events for this organizer
    const nowIso = new Date().toISOString();
    const { data: pastEvents, error: eventsErr } = await supabase
      .from('events')
      .select('*, halls(id, name, capacity)')
      .eq('organizer_email', organizerEmail)
      .eq('status', 'approved')
      .lt('end_time', nowIso)
      .order('start_time', { ascending: false });

    if (eventsErr) {
      return NextResponse.json({ error: 'Failed to load past events.' }, { status: 500 });
    }

    if (!pastEvents || pastEvents.length === 0) {
      return NextResponse.json(
        { error: 'No past approved events found to generate planning advice.' },
        { status: 400 }
      );
    }

    const eventIds = pastEvents.map((e) => e.id);

    // 2. Fetch all registrations for these events
    const { data: registrations, error: regsErr } = await supabase
      .from('registrations')
      .select('event_id, status, checked_in_at')
      .in('event_id', eventIds);

    if (regsErr) {
      return NextResponse.json({ error: 'Failed to load registration history.' }, { status: 500 });
    }

    // 3. Fetch all reviews for these events from anonymized view
    const { data: reviews, error: reviewsErr } = await supabase
      .from('event_reviews_public')
      .select('event_id, rating')
      .in('event_id', eventIds);

    if (reviewsErr) {
      return NextResponse.json({ error: 'Failed to load review history.' }, { status: 500 });
    }

    // 4. Compute Aggregate Stats in SQL/Backend strictly
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

    // 5. Call Gemini AI with resilience (exponential backoff & fallback model)
    try {
      const advice = await generateOrganizerAdvice(organizerName, stats);

      // Cache to organizer_ai_insights table
      const { error: upsertErr } = await supabase
        .from('organizer_ai_insights')
        .upsert({
          organizer_email: organizerEmail,
          summary: advice,
          event_count: pastEvents.length,
          generated_at: new Date().toISOString(),
        });

      if (upsertErr) {
        console.warn('Failed to cache organizer insights to database:', upsertErr);
      }

      return NextResponse.json({
        success: true,
        summary: advice,
        event_count: pastEvents.length,
        stats,
      });
    } catch (aiErr: any) {
      console.error('All Gemini attempts failed for organizer advice:', aiErr?.message || aiErr);

      // 6. Resilient Fallback: return cached advice if available
      const { data: cachedInsights } = await supabase
        .from('organizer_ai_insights')
        .select('*')
        .eq('organizer_email', organizerEmail)
        .maybeSingle();

      if (cachedInsights?.summary) {
        return NextResponse.json({
          success: true,
          summary: cachedInsights.summary,
          event_count: cachedInsights.event_count || pastEvents.length,
          stats,
          cached: true,
          notice: 'AI is currently busy. Displaying previously generated planning advice.',
        });
      }

      // If no cached insight exists, return friendly error without raw error details
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
