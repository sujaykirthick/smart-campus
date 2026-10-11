import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEventSummary } from '@/lib/gemini';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 });
    }

    // 1. Fetch Event & Validate Ownership
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*, halls:halls!events_hall_id_fkey(id, name, capacity, location)')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    // Check organizer or approvers authorization
    if (event.organizer_email !== user.email) {
      const { data: userProfile } = await supabase
        .from('allowed_users')
        .select('role')
        .eq('email', user.email)
        .maybeSingle();

      if (!userProfile || !['affairs', 'student_affairs', 'event_office', 'cd'].includes(userProfile.role)) {
        return NextResponse.json(
          { error: 'Unauthorized: Only the event organizer or approval authorities can generate insights.' },
          { status: 403 }
        );
      }
    }

    // 2. Compute Ground-Truth Stats strictly in database (Never by AI)
    const [regsRes, reviewsRes] = await Promise.all([
      supabase.from('registrations').select('status, checked_in_at').eq('event_id', eventId),
      supabase
        .from('event_reviews_public')
        .select('rating, comment')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false }),
    ]);

    const registrations = regsRes.data || [];
    const confirmedCount = registrations.filter((r) => r.status === 'confirmed').length;
    const attendedCount = registrations.filter((r) => r.checked_in_at !== null).length;
    const waitlistCount = registrations.filter((r) => r.status === 'waitlisted').length;
    const capacity = event.halls?.capacity || 0;

    const noShowRate =
      confirmedCount > 0
        ? Math.round(((confirmedCount - attendedCount) / confirmedCount) * 100)
        : 0;

    const reviews = reviewsRes.data || [];
    const reviewCount = reviews.length;

    if (reviewCount < 5) {
      return NextResponse.json(
        {
          error: `AI Summary requires at least 5 reviews. Currently has ${reviewCount} review${
            reviewCount === 1 ? '' : 's'
          }.`,
        },
        { status: 400 }
      );
    }

    const avgRating =
      reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviewCount;

    const stats = {
      registered: confirmedCount,
      attended: attendedCount,
      noShowRate: Math.max(0, noShowRate),
      averageRating: avgRating,
      waitlistCount,
      capacity,
    };

    // 3. Call Gemini AI API with resilience (exponential backoff & fallback model)
    try {
      const summaryData = await generateEventSummary(
        event.title,
        stats,
        reviews.map((r) => ({ rating: r.rating, comment: r.comment || '' }))
      );

      // Cache summary in event_ai_summaries table
      const { error: upsertError } = await supabase
        .from('event_ai_summaries')
        .upsert({
          event_id: eventId,
          summary: summaryData,
          review_count: reviewCount,
          generated_at: new Date().toISOString(),
        });

      if (upsertError) {
        console.warn('Failed to cache event AI summary to database:', upsertError);
      }

      return NextResponse.json({
        success: true,
        summary: summaryData,
        review_count: reviewCount,
        stats,
      });
    } catch (aiErr: any) {
      console.error('All Gemini attempts failed for event summary:', aiErr?.message || aiErr);

      // 4. Resilient Fallback: return cached summary if available
      const { data: cachedSummary } = await supabase
        .from('event_ai_summaries')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();

      if (cachedSummary?.summary) {
        return NextResponse.json({
          success: true,
          summary: cachedSummary.summary,
          review_count: cachedSummary.review_count || reviewCount,
          stats,
          cached: true,
          notice: 'AI is currently busy. Displaying previously generated summary.',
        });
      }

      // If no cached summary exists, return friendly message without raw errors
      return NextResponse.json(
        { error: 'AI is busy, try again' },
        { status: 503 }
      );
    }
  } catch (err: any) {
    console.error('Unexpected error in generate-summary route:', err);
    return NextResponse.json(
      { error: 'AI is busy, try again' },
      { status: 500 }
    );
  }
}
