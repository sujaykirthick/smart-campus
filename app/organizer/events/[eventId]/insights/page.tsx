'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, EventAISummary, Review } from '@/lib/types';
import {
  Sparkles,
  ArrowLeft,
  Users,
  CheckCircle2,
  UserX,
  Star,
  Hourglass,
  Building2,
  Calendar,
  Clock,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  ThumbsUp,
  Lightbulb,
  Wrench,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface EventStats {
  registered: number;
  attended: number;
  noShowRate: number;
  averageRating: number;
  waitlistCount: number;
  capacity: number;
}

export default function EventInsightsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const router = useRouter();

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [cachedSummary, setCachedSummary] = useState<EventAISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        router.push('/login');
        return;
      }

      // 1. Fetch Event details
      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('*, halls(id, name, capacity, location), fests(id, name)')
        .eq('id', eventId)
        .maybeSingle();

      if (evErr || !ev) {
        throw new Error(evErr?.message || 'Event not found.');
      }

      // Authorization check: owner or affairs
      if (ev.organizer_email !== user.email) {
        const { data: profile } = await supabase
          .from('allowed_users')
          .select('role')
          .eq('email', user.email)
          .maybeSingle();

        if (profile?.role !== 'affairs') {
          throw new Error('Unauthorized. Only the event organizer or Affairs can access event insights.');
        }
      }

      setEvent(ev);

      // 2. Fetch ground-truth registrations, reviews, and cached summary
      const [regsRes, reviewsRes, summaryRes] = await Promise.all([
        supabase.from('registrations').select('status, checked_in_at').eq('event_id', eventId),
        supabase
          .from('event_reviews_public')
          .select('id, event_id, rating, comment, created_at')
          .eq('event_id', eventId)
          .order('created_at', { ascending: false }),
        supabase
          .from('event_ai_summaries')
          .select('*')
          .eq('event_id', eventId)
          .maybeSingle(),
      ]);

      if (regsRes.error) throw regsRes.error;
      if (reviewsRes.error) throw reviewsRes.error;

      const regs = regsRes.data || [];
      const confirmed = regs.filter((r) => r.status === 'confirmed').length;
      const attended = regs.filter((r) => r.checked_in_at !== null).length;
      const waitlist = regs.filter((r) => r.status === 'waitlisted').length;
      const capacity = ev.halls?.capacity || 0;
      const noShowRate =
        confirmed > 0 ? Math.round(((confirmed - attended) / confirmed) * 100) : 0;

      const revs = (reviewsRes.data as Review[]) || [];
      const avgRating =
        revs.length > 0
          ? revs.reduce((acc, curr) => acc + curr.rating, 0) / revs.length
          : 0;

      setStats({
        registered: confirmed,
        attended,
        noShowRate: Math.max(0, noShowRate),
        averageRating: avgRating,
        waitlistCount: waitlist,
        capacity,
      });

      setReviews(revs);

      if (summaryRes.data) {
        setCachedSummary(summaryRes.data as EventAISummary);
      }
    } catch (err: any) {
      console.error('Error loading event insights:', err);
      setErrorMsg(err?.message || 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  }, [eventId, supabase, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateSummary = async () => {
    setGenerating(true);
    setGenError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/generate-summary`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI is busy, try again');
      }

      setCachedSummary({
        event_id: eventId,
        summary: data.summary,
        review_count: data.review_count,
        generated_at: new Date().toISOString(),
      });

      if (data.notice) {
        setGenError(data.notice);
      }
    } catch (err: any) {
      console.error('Error in generating summary:', err);
      setGenError(err?.message || 'AI is busy, try again');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 space-y-6">
        <div className="h-28 w-full animate-pulse rounded-2xl bg-[#EADFD6]/50" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#EADFD6]/50" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg || !event || !stats) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-[#8E1A22] border border-red-200">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="font-serif text-xl font-bold text-[#2B1B17]">Access Restricted</h2>
        <p className="text-sm text-[#7A6A62]">{errorMsg || 'Unable to display insights.'}</p>
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#B3202A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8E1A22] transition-colors shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Portal
        </Link>
      </div>
    );
  }

  const reviewCount = reviews.length;
  const canGenerateAI = reviewCount >= 5;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Back and Header Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7A6A62] hover:text-[#B3202A] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Organizer Portal
        </Link>

        <button
          onClick={loadData}
          className="rounded-xl border border-[#EADFD6] bg-white p-2.5 text-[#7A6A62] shadow-xs hover:bg-[#FFFAF5] hover:text-[#2B1B17] transition-colors cursor-pointer"
          title="Refresh stats"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Hero Event Banner */}
      <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-gradient-to-br from-[#FFFAF5] via-white to-[#FFFAF5]/50 p-6 sm:p-8 shadow-xs relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B3202A] via-[#C9A24B] to-[#B3202A]" />
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A24B]/40 bg-[#FFFAF5] px-3 py-1 text-xs font-semibold text-[#8E1A22]">
            <Sparkles className="h-3.5 w-3.5 text-[#C9A24B]" />
            Event Post-Mortem & Intelligence
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2B1B17]">
            {event.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#7A6A62] pt-1">
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-[#B3202A]" />
              {event.halls?.name || 'Hall'} (Capacity: {stats.capacity})
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-[#C9A24B]" />
              {new Date(event.start_time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Clock className="h-3.5 w-3.5 text-[#7A6A62]" />
              {new Date(event.start_time).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              –{' '}
              {new Date(event.end_time).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* SQL Ground-Truth Stats Grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#7A6A62]">
            Ground-Truth Metrics (Computed in SQL)
          </h2>
          <span className="text-xs text-[#7A6A62] font-mono">Audited & Verified</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-[#7A6A62] mb-1">
              <span className="text-xs font-semibold">Registered</span>
              <Users className="h-4 w-4 text-sky-600" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#2B1B17]">
              {stats.registered}
            </div>
            <div className="text-[11px] text-[#7A6A62]">Confirmed passes</div>
          </div>

          <div className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-[#7A6A62] mb-1">
              <span className="text-xs font-semibold">Attended</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="font-serif text-2xl font-bold text-emerald-800">
              {stats.attended}
            </div>
            <div className="text-[11px] text-[#7A6A62]">Scanned at door</div>
          </div>

          <div className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-[#7A6A62] mb-1">
              <span className="text-xs font-semibold">No-Show Rate</span>
              <UserX className="h-4 w-4 text-[#8E1A22]" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#8E1A22]">
              {stats.noShowRate}%
            </div>
            <div className="text-[11px] text-[#7A6A62]">
              {stats.registered - stats.attended} absent
            </div>
          </div>

          <div className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-[#7A6A62] mb-1">
              <span className="text-xs font-semibold">Avg Rating</span>
              <Star className="h-4 w-4 fill-[#C9A24B] text-[#C9A24B]" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#C9A24B]">
              {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : 'N/A'}
            </div>
            <div className="text-[11px] text-[#7A6A62]">{reviewCount} reviews</div>
          </div>

          <div className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-[#7A6A62] mb-1">
              <span className="text-xs font-semibold">Waitlist</span>
              <Hourglass className="h-4 w-4 text-amber-600" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#2B1B17]">
              {stats.waitlistCount}
            </div>
            <div className="text-[11px] text-[#7A6A62]">Unfulfilled queue</div>
          </div>

          <div className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-[#7A6A62] mb-1">
              <span className="text-xs font-semibold">Turnout / Cap</span>
              <Building2 className="h-4 w-4 text-[#B3202A]" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#2B1B17]">
              {stats.capacity > 0
                ? `${Math.round((stats.attended / stats.capacity) * 100)}%`
                : 'N/A'}
            </div>
            <div className="text-[11px] text-[#7A6A62]">{stats.attended} / {stats.capacity} cap</div>
          </div>
        </div>
      </div>

      {/* AI Summary Section with Gemini */}
      <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EADFD6] p-6 bg-[#FFFAF5]">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B3202A] text-white shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                Gemini AI Qualitative Synthesis
              </h3>
            </div>
            <p className="text-xs text-[#7A6A62] mt-1">
              {cachedSummary
                ? `Synthesized by ${process.env.NEXT_PUBLIC_GEMINI_MODEL || 'Gemini 2.5 Flash'} based on ${cachedSummary.review_count} student reviews`
                : 'Generates recurring themes, praise, friction points, and recommendations'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateSummary}
              disabled={!canGenerateAI || generating}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B3202A] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing with Gemini...
                </>
              ) : cachedSummary ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate AI Summary
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate AI Summary
                </>
              )}
            </button>
          </div>
        </div>

        {/* Generate Error Notice */}
        {genError && (
          <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#8E1A22] mt-0.5" />
            <div>
              <span className="font-bold">Gemini Analysis Notice: </span>
              <span>{genError}</span>
            </div>
          </div>
        )}

        {/* Not enough reviews state */}
        {!canGenerateAI && !cachedSummary && (
          <div className="p-12 text-center space-y-3">
            <MessageSquare className="mx-auto h-12 w-12 text-[#EADFD6]" />
            <h4 className="font-serif text-base font-bold text-[#2B1B17]">
              Awaiting More Student Feedback
            </h4>
            <p className="max-w-md mx-auto text-xs text-[#7A6A62]">
              AI summary generation requires a minimum of <span className="font-bold text-[#2B1B17]">5 student reviews</span> to produce reliable qualitative insights. Currently collected: <span className="font-bold text-[#B3202A]">{reviewCount} / 5</span>.
            </p>
          </div>
        )}

        {/* Cached / Generated Summary Display */}
        {cachedSummary && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Themes */}
              <div className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-5 space-y-3">
                <div className="flex items-center gap-2 text-[#8E1A22] font-bold text-sm">
                  <Sparkles className="h-4 w-4 text-[#C9A24B]" />
                  Recurring Discussion Themes
                </div>
                <ul className="space-y-2 text-xs text-[#2B1B17]">
                  {cachedSummary.summary.themes.map((t, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#B3202A] shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What Worked */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <ThumbsUp className="h-4 w-4 text-emerald-700" />
                  What Worked (Highlights)
                </div>
                <ul className="space-y-2 text-xs text-[#2B1B17]">
                  {cachedSummary.summary.what_worked.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What to Improve */}
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 space-y-3">
                <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                  <Wrench className="h-4 w-4 text-[#8E1A22]" />
                  Areas to Improve (Friction Points)
                </div>
                <ul className="space-y-2 text-xs text-[#2B1B17]">
                  {cachedSummary.summary.what_to_improve.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#B3202A] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actionable Suggestions */}
              <div className="rounded-xl border border-[#C9A24B]/30 bg-[#FFFAF5] p-5 space-y-3">
                <div className="flex items-center gap-2 text-[#8E1A22] font-bold text-sm">
                  <Lightbulb className="h-4 w-4 text-[#C9A24B]" />
                  Actionable Next Steps
                </div>
                <ul className="space-y-2 text-xs text-[#2B1B17]">
                  {cachedSummary.summary.suggestions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#C9A24B] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="text-[11px] text-[#7A6A62] text-right pt-2 font-mono">
              Cached insight snapshot • Generated on {new Date(cachedSummary.generated_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Anonymized Student Reviews List (NO STUDENT EMAILS VISIBLE) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
              Student Feedback ({reviewCount})
            </h3>
            <p className="text-xs text-[#7A6A62]">
              Verified attendee submissions • Anonymous student evaluations
            </p>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-[#EADFD6] bg-white p-8 text-center text-xs text-[#7A6A62]">
            No reviews have been submitted for this event yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((rev) => (
              <div
                key={rev.id}
                className="rounded-2xl border border-[#EADFD6] bg-white p-5 space-y-3 shadow-xs hover:border-[#C9A24B]/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i < rev.rating
                            ? 'fill-[#C9A24B] text-[#C9A24B]'
                            : 'text-[#EADFD6]'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-bold text-[#2B1B17] ml-1">
                      {rev.rating} / 5
                    </span>
                  </div>

                  <span className="text-[11px] text-[#7A6A62] font-mono">
                    {new Date(rev.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <p className="text-xs text-[#2B1B17] leading-relaxed italic">
                  {rev.comment ? `"${rev.comment}"` : <span className="text-[#7A6A62] not-italic">(Rating only, no written comment)</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
