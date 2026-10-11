'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, EventAISummary, Review } from '@/lib/types';
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  EmptyState,
  SkeletonCard,
  useToast,
} from '@/components/ui';
import { formatEventDate, formatHall } from '@/lib/format';
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
  TrendingUp,
  BarChart3,
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
  const { showToast } = useToast();

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [cachedSummary, setCachedSummary] = useState<EventAISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);

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
        .select('*, halls:halls!events_hall_id_fkey(id, name, capacity, location), fests(id, name)')
        .eq('id', eventId)
        .maybeSingle();

      if (evErr || !ev) {
        throw new Error(evErr?.message || 'Event not found.');
      }

      // Authorization check
      if (ev.organizer_email !== user.email) {
        let isAuthorized = false;
        const { data: profile } = await supabase
          .from('allowed_users')
          .select('*')
          .eq('email', user.email)
          .maybeSingle();

        if (profile && ['affairs', 'student_affairs', 'event_office', 'cd'].includes(profile.role)) {
          isAuthorized = true;
        }

        if (!isAuthorized && ev.organization_id) {
          const { data: isMember } = await supabase.rpc('is_org_member', {
            p_org_id: ev.organization_id,
            p_email: user.email,
          });
          if (isMember) {
            isAuthorized = true;
          }
        }

        if (!isAuthorized) {
          throw new Error('Unauthorized to view event insights.');
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

      const regs = regsRes.data || [];
      const revs = (reviewsRes.data as unknown as Review[]) || [];
      setReviews(revs);
      setCachedSummary((summaryRes.data as unknown as EventAISummary) || null);

      // 3. Compute deterministic stats
      const confirmed = regs.filter((r) => r.status === 'confirmed');
      const waitlist = regs.filter((r) => r.status === 'waitlisted');
      const attended = confirmed.filter((r) => r.checked_in_at !== null).length;
      const registered = confirmed.length;
      const noShowCount = registered - attended;
      const noShowRate = registered > 0 ? Math.round((noShowCount / registered) * 100) : 0;

      const totalRating = revs.reduce((acc, r) => acc + (r.rating || 0), 0);
      const averageRating = revs.length > 0 ? totalRating / revs.length : 0;
      const capacity = ev.halls?.capacity || 0;

      setStats({
        registered,
        attended,
        noShowRate,
        averageRating,
        waitlistCount: waitlist.length,
        capacity,
      });
    } catch (err: any) {
      console.error('Error loading insights:', err);
      showToast('error', err?.message || 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  }, [eventId, supabase, router, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Generate / Regenerate AI Summary
  const handleGenerateSummary = async () => {
    if (!eventId) return;
    setGenerating(true);

    try {
      const res = await fetch(`/api/events/${eventId}/summarize`, {
        method: 'POST',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to generate AI summary.');
      }

      setCachedSummary(json.data);
      showToast('success', 'Gemini AI synthesis updated successfully');
    } catch (err: any) {
      console.error('Error synthesizing reviews:', err);
      showToast('error', err?.message || 'Synthesis failed');
    } finally {
      setGenerating(false);
    }
  };

  const reviewCount = reviews.length;
  const canGenerateAI = reviewCount >= 5;

  // Calculate rating breakdown distribution (1 to 5 stars)
  const ratingCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating || 0))) as 1 | 2 | 3 | 4 | 5;
      counts[star] = (counts[star] || 0) + 1;
    });
    return counts;
  }, [reviews]);

  if (loading || !event || !stats) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#A4161A]" />
        <div className="text-xs text-neutral-500 font-medium">Computing event intelligence...</div>
      </div>
    );
  }

  const turnoutRate = stats.registered > 0 ? Math.round((stats.attended / stats.registered) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Top Header */}
      <PageHeader
        title={event.title}
        badge={<StatusBadge status="approved" label="Insights & Analytics" />}
        description={`${formatHall(event.halls?.name, stats.capacity)} • ${formatEventDate(event.start_time, event.end_time)}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/organizer/events/${eventId}`}>
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-4 w-4" /> Host Dashboard
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              aria-label="Refresh analytics"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-medium">Registered</span>
            <Users className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900">{stats.registered}</div>
          <div className="text-[11px] text-neutral-500">Confirmed passes</div>
        </Card>

        <Card className="p-4 border-emerald-200 bg-emerald-50/20">
          <div className="flex items-center justify-between text-emerald-800 mb-1">
            <span className="text-xs font-medium">Attended</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-800">{stats.attended}</div>
          <div className="text-[11px] text-emerald-700">{turnoutRate}% turnout</div>
        </Card>

        <Card className="p-4 border-red-200 bg-red-50/20">
          <div className="flex items-center justify-between text-[#991B1B] mb-1">
            <span className="text-xs font-medium">No-Show</span>
            <UserX className="h-4 w-4 text-[#991B1B]" />
          </div>
          <div className="text-2xl font-extrabold text-[#991B1B]">{stats.noShowRate}%</div>
          <div className="text-[11px] text-red-700">{stats.registered - stats.attended} absent</div>
        </Card>

        <Card className="p-4 border-amber-200 bg-amber-50/20">
          <div className="flex items-center justify-between text-amber-800 mb-1">
            <span className="text-xs font-medium">Avg Rating</span>
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-900">
            {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}
          </div>
          <div className="text-[11px] text-amber-800">{reviewCount} reviews</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-medium">Waitlist</span>
            <Hourglass className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900">{stats.waitlistCount}</div>
          <div className="text-[11px] text-neutral-500">Unfulfilled queue</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-medium">Capacity Fill</span>
            <Building2 className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900">
            {stats.capacity > 0 ? `${Math.round((stats.attended / stats.capacity) * 100)}%` : '—'}
          </div>
          <div className="text-[11px] text-neutral-500">{stats.attended} / {stats.capacity} seats</div>
        </Card>
      </div>

      {/* CHARTS SECTION: ATTENDANCE & RATINGS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Attendance Breakdown Chart */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#A4161A]" /> Attendance Breakdown
            </h2>
            <span className="text-xs font-semibold text-neutral-600 font-mono">
              Total {stats.registered} passes
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {/* Horizontal Bar Visual */}
            <div className="h-4 w-full rounded-full bg-neutral-100 overflow-hidden flex">
              <div
                style={{ width: `${turnoutRate}%` }}
                className="bg-emerald-600 h-full transition-all duration-500"
                title={`Attended: ${turnoutRate}%`}
              />
              <div
                style={{ width: `${stats.noShowRate}%` }}
                className="bg-red-400 h-full transition-all duration-500"
                title={`No-show: ${stats.noShowRate}%`}
              />
            </div>

            {/* Attendance Legend & Values */}
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-center gap-1.5 font-medium text-emerald-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Attended & Verified
                </div>
                <div className="text-lg font-bold text-emerald-900 mt-1">
                  {stats.attended}{' '}
                  <span className="text-xs font-normal text-emerald-700">({turnoutRate}%)</span>
                </div>
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                <div className="flex items-center gap-1.5 font-medium text-[#991B1B]">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Absent / No-Show
                </div>
                <div className="text-lg font-bold text-[#991B1B] mt-1">
                  {stats.registered - stats.attended}{' '}
                  <span className="text-xs font-normal text-red-700">({stats.noShowRate}%)</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Ratings Distribution Chart */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Star className="h-4 w-4 fill-[#A4161A] text-[#A4161A]" /> Ratings Distribution
            </h2>
            <span className="text-xs font-semibold text-neutral-600 font-mono">
              {reviewCount} reviews
            </span>
          </div>

          <div className="space-y-2 pt-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCounts[star as 1 | 2 | 3 | 4 | 5] || 0;
              const pct = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;

              return (
                <div key={star} className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1 w-12 text-neutral-700 font-semibold shrink-0">
                    <span>{star}</span>
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  </div>
                  <div className="flex-1 h-3 rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    />
                  </div>
                  <div className="w-12 text-right font-mono text-neutral-500 text-[11px] shrink-0">
                    {count} ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* AI SUMMARY CARD WITH GEMINI */}
      <Card className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#A4161A] text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-neutral-900">
                Gemini AI Qualitative Synthesis
              </h2>
            </div>
            {cachedSummary ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 pt-0.5">
                <span className="font-semibold text-neutral-800">
                  Based on {cachedSummary.review_count} reviews
                </span>
                <span>•</span>
                <span className="font-mono text-neutral-500">
                  Generated at {new Date(cachedSummary.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                  {new Date(cachedSummary.generated_at).toLocaleDateString()}
                </span>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                Identifies recurring themes, highlights what worked, and flags areas to improve.
              </p>
            )}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerateSummary}
            disabled={!canGenerateAI || generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Synthesizing...
              </>
            ) : cachedSummary ? (
              <>
                <RefreshCw className="h-4 w-4" /> Regenerate Summary
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate Summary
              </>
            )}
          </Button>
        </div>

        {/* Not enough reviews state */}
        {!canGenerateAI && !cachedSummary && (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6 text-neutral-400" />}
            title="Awaiting More Student Feedback"
            description={`AI summary generation requires a minimum of 5 student reviews. Current reviews: ${reviewCount} / 5.`}
          />
        )}

        {/* Cached / Generated Summary Display */}
        {cachedSummary && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Themes */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-neutral-900 font-bold text-xs uppercase tracking-wide">
                  <Sparkles className="h-4 w-4 text-[#A4161A]" />
                  Key Discussion Themes
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {cachedSummary.summary.themes.map((theme, idx) => (
                    <span
                      key={idx}
                      className="rounded-md bg-white border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-800 shadow-xs"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>

              {/* What Worked */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                  <ThumbsUp className="h-4 w-4 text-emerald-700" />
                  What Worked
                </div>
                <ul className="space-y-2 text-xs text-neutral-800">
                  {cachedSummary.summary.what_worked.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What to Improve */}
              <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-[#991B1B] font-bold text-xs uppercase tracking-wide">
                  <Wrench className="h-4 w-4 text-[#991B1B]" />
                  Areas to Improve
                </div>
                <ul className="space-y-2 text-xs text-neutral-800">
                  {cachedSummary.summary.what_to_improve.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#991B1B] shrink-0" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Suggestions */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                  Actionable Recommendations
                </div>
                <ul className="space-y-2 text-xs text-neutral-800">
                  {cachedSummary.summary.suggestions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* STUDENT REVIEWS LIST */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-neutral-900">
          Student Feedback ({reviewCount})
        </h2>

        {reviews.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6 text-neutral-400" />}
            title="No reviews submitted yet"
            description="Reviews submitted by verified attendees will show up here anonymously."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {reviews.map((rev) => (
              <div
                key={rev.id}
                className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-2"
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
                  {rev.comment ? (
                    `"${rev.comment}"`
                  ) : (
                    <span className="text-neutral-400 italic">(Rating only)</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
