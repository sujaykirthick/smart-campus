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

      // 2. Fetch registrations, reviews, and cached summary
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
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <div className="h-20 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-neutral-100 border border-neutral-200" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg || !event || !stats) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-red-50 text-[#991B1B] border border-red-200">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-neutral-900">Access Restricted</h2>
        <p className="text-xs text-neutral-500">{errorMsg || 'Unable to display insights.'}</p>
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 rounded bg-[#A4161A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Return to Dashboard
        </Link>
      </div>
    );
  }

  const reviewCount = reviews.length;
  const canGenerateAI = reviewCount >= 5;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Organizer Portal
        </Link>

        <button
          onClick={loadData}
          className="rounded border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
          title="Refresh stats"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Header Banner */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
          Event Analytics &amp; Intelligence
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {event.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 pt-1">
          <span className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-[#A4161A]" />
            {event.halls?.name || 'Venue'} (Capacity: {stats.capacity})
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
            {new Date(event.start_time).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px]">
            <Clock className="h-3.5 w-3.5 text-neutral-400" />
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

      {/* SQL Ground-Truth Stats Grid */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Ground-Truth Metrics (SQL Computed)
          </h2>
          <span className="text-xs text-neutral-400 font-mono">Audited</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Registered</span>
              <Users className="h-3.5 w-3.5 text-neutral-400" />
            </div>
            <div className="text-xl font-bold text-neutral-900">
              {stats.registered}
            </div>
            <div className="text-[10px] text-neutral-400">Confirmed passes</div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Attended</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-700">
              {stats.attended}
            </div>
            <div className="text-[10px] text-neutral-400">Scanned at door</div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">No-Show</span>
              <UserX className="h-3.5 w-3.5 text-[#991B1B]" />
            </div>
            <div className="text-xl font-bold text-[#991B1B]">
              {stats.noShowRate}%
            </div>
            <div className="text-[10px] text-neutral-400">
              {stats.registered - stats.attended} absent
            </div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Avg Rating</span>
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-neutral-900">
              {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : 'N/A'}
            </div>
            <div className="text-[10px] text-neutral-400">{reviewCount} reviews</div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Waitlist</span>
              <Hourglass className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="text-xl font-bold text-neutral-900">
              {stats.waitlistCount}
            </div>
            <div className="text-[10px] text-neutral-400">Waitlisted count</div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Capacity</span>
              <Building2 className="h-3.5 w-3.5 text-neutral-400" />
            </div>
            <div className="text-xl font-bold text-neutral-900">
              {stats.capacity > 0
                ? `${Math.round((stats.attended / stats.capacity) * 100)}%`
                : 'N/A'}
            </div>
            <div className="text-[10px] text-neutral-400">{stats.attended} / {stats.capacity}</div>
          </div>
        </div>
      </div>

      {/* AI Summary Section with Gemini */}
      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 p-5 bg-neutral-50">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-[#A4161A] text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-base font-bold text-neutral-900">
                Gemini AI Qualitative Synthesis
              </h3>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              {cachedSummary
                ? `Synthesized based on ${cachedSummary.review_count} attendee reviews`
                : 'Generates recurring themes, praise, friction points, and recommendations'}
            </p>
          </div>

          <button
            onClick={handleGenerateSummary}
            disabled={!canGenerateAI || generating}
            className="inline-flex items-center gap-1.5 rounded bg-[#A4161A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing...
              </>
            ) : cachedSummary ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate Summary
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate Summary
              </>
            )}
          </button>
        </div>

        {/* Generate Error Notice */}
        {genError && (
          <div className="m-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
            <div>
              <span className="font-semibold">Notice: </span>
              <span>{genError}</span>
            </div>
          </div>
        )}

        {/* Not enough reviews state */}
        {!canGenerateAI && !cachedSummary && (
          <div className="p-10 text-center space-y-2">
            <MessageSquare className="mx-auto h-8 w-8 text-neutral-300" />
            <h4 className="text-sm font-semibold text-neutral-900">
              Awaiting More Student Feedback
            </h4>
            <p className="max-w-md mx-auto text-xs text-neutral-500">
              AI summary generation requires a minimum of <span className="font-semibold text-neutral-800">5 student reviews</span>. Current count: <span className="font-semibold text-[#A4161A]">{reviewCount} / 5</span>.
            </p>
          </div>
        )}

        {/* Cached / Generated Summary Display */}
        {cachedSummary && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Themes */}
              <div className="rounded border border-neutral-200 bg-neutral-50 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-neutral-900 font-semibold text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-[#A4161A]" />
                  Discussion Themes
                </div>
                <ul className="space-y-1.5 text-xs text-neutral-700">
                  {cachedSummary.summary.themes.map((t, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 rounded-full bg-[#A4161A] shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What Worked */}
              <div className="rounded border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-900 font-semibold text-xs">
                  <ThumbsUp className="h-3.5 w-3.5 text-emerald-700" />
                  What Worked
                </div>
                <ul className="space-y-1.5 text-xs text-neutral-800">
                  {cachedSummary.summary.what_worked.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 rounded-full bg-emerald-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What to Improve */}
              <div className="rounded border border-red-200 bg-red-50/40 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-[#991B1B] font-semibold text-xs">
                  <Wrench className="h-3.5 w-3.5 text-[#991B1B]" />
                  Areas to Improve
                </div>
                <ul className="space-y-1.5 text-xs text-neutral-800">
                  {cachedSummary.summary.what_to_improve.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 rounded-full bg-[#991B1B] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actionable Suggestions */}
              <div className="rounded border border-neutral-200 bg-neutral-50 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-neutral-900 font-semibold text-xs">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                  Actionable Suggestions
                </div>
                <ul className="space-y-1.5 text-xs text-neutral-700">
                  {cachedSummary.summary.suggestions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 rounded-full bg-amber-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="text-[11px] text-neutral-400 text-right font-mono">
              Generated on {new Date(cachedSummary.generated_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Anonymized Student Reviews List */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-neutral-900">
          Student Feedback ({reviewCount})
        </h3>

        {reviews.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white p-6 text-center text-xs text-neutral-500">
            No reviews submitted yet for this event.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reviews.map((rev) => (
              <div
                key={rev.id}
                className="rounded-md border border-neutral-200 bg-white p-4 space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < rev.rating
                            ? 'fill-amber-500 text-amber-500'
                            : 'text-neutral-200'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-semibold text-neutral-800 ml-1">
                      {rev.rating} / 5
                    </span>
                  </div>

                  <span className="text-[11px] text-neutral-400 font-mono">
                    {new Date(rev.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <p className="text-xs text-neutral-800 leading-relaxed">
                  {rev.comment ? `"${rev.comment}"` : <span className="text-neutral-400 italic">(Rating only)</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
