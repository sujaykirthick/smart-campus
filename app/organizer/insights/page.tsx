'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AllowedUser, CampusEvent, OrganizerAIInsights } from '@/lib/types';
import {
  Sparkles,
  ArrowLeft,
  Calendar,
  Users,
  CheckCircle2,
  UserX,
  Star,
  Building2,
  Clock,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Lightbulb,
  Loader2,
  ChevronRight,
} from 'lucide-react';

interface AggregateStats {
  totalEvents: number;
  totalRegistered: number;
  totalAttended: number;
  overallNoShowRate: number;
  averageRating: number;
  bestTimeSlots: { slot: string; rate: number; total: number }[];
  topHalls: { name: string; rate: number; count: number }[];
}

interface EventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  hall_name: string;
  registered: number;
  attended: number;
  noShowRate: number;
  avgRating: number;
  reviewCount: number;
}

export default function OrganizerClubInsightsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [eventRows, setEventRows] = useState<EventRow[]>([]);
  const [cachedAdvice, setCachedAdvice] = useState<OrganizerAIInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
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

      // Fetch user profile
      const { data: userProfile } = await supabase
        .from('allowed_users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      setProfile(userProfile);

      // 1. Fetch all past approved events for this organizer
      const nowIso = new Date().toISOString();
      const { data: pastEvents, error: eventsErr } = await supabase
        .from('events')
        .select('*, halls(id, name, capacity)')
        .eq('organizer_email', user.email)
        .eq('status', 'approved')
        .lt('end_time', nowIso)
        .order('start_time', { ascending: false });

      if (eventsErr) throw eventsErr;

      const eventsList = (pastEvents as CampusEvent[]) || [];
      const eventIds = eventsList.map((e) => e.id);

      if (eventIds.length === 0) {
        setStats({
          totalEvents: 0,
          totalRegistered: 0,
          totalAttended: 0,
          overallNoShowRate: 0,
          averageRating: 0,
          bestTimeSlots: [],
          topHalls: [],
        });
        setEventRows([]);
        setLoading(false);
        return;
      }

      // 2. Fetch registrations & reviews
      const [regsRes, reviewsRes, adviceRes] = await Promise.all([
        supabase
          .from('registrations')
          .select('event_id, status, checked_in_at')
          .in('event_id', eventIds),
        supabase
          .from('event_reviews_public')
          .select('event_id, rating')
          .in('event_id', eventIds),
        supabase
          .from('organizer_ai_insights')
          .select('*')
          .eq('organizer_email', user.email)
          .maybeSingle(),
      ]);

      const regs = regsRes.data || [];
      const revs = reviewsRes.data || [];

      const confirmedRegs = regs.filter((r) => r.status === 'confirmed');
      const attendedRegs = confirmedRegs.filter((r) => r.checked_in_at !== null);

      const totalRegistered = confirmedRegs.length;
      const totalAttended = attendedRegs.length;
      const overallNoShowRate =
        totalRegistered > 0
          ? Math.round(((totalRegistered - totalAttended) / totalRegistered) * 100)
          : 0;

      const allRatings = revs.map((r) => r.rating);
      const averageRating =
        allRatings.length > 0
          ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
          : 0;

      // Slot & Hall aggregations
      const slotMap: Record<string, { total: number; attended: number }> = {};
      const hallMap: Record<string, { total: number; attended: number; count: number; name: string }> = {};

      const rows: EventRow[] = eventsList.map((ev) => {
        const evRegs = confirmedRegs.filter((r) => r.event_id === ev.id);
        const evAtt = evRegs.filter((r) => r.checked_in_at !== null);
        const evRevs = revs.filter((r) => r.event_id === ev.id);
        const evAvgRating =
          evRevs.length > 0
            ? evRevs.reduce((acc, curr) => acc + curr.rating, 0) / evRevs.length
            : 0;
        const noShow =
          evRegs.length > 0
            ? Math.round(((evRegs.length - evAtt.length) / evRegs.length) * 100)
            : 0;

        const startH = new Date(ev.start_time).getHours();
        let slotKey = 'Evening (5 PM onwards)';
        if (startH < 12) slotKey = 'Morning (Before 12 PM)';
        else if (startH < 17) slotKey = 'Afternoon (12 PM - 5 PM)';

        if (!slotMap[slotKey]) slotMap[slotKey] = { total: 0, attended: 0 };
        slotMap[slotKey].total += evRegs.length;
        slotMap[slotKey].attended += evAtt.length;

        const hallName = ev.halls?.name || 'Venue';
        if (!hallMap[ev.hall_id]) {
          hallMap[ev.hall_id] = { total: 0, attended: 0, count: 0, name: hallName };
        }
        hallMap[ev.hall_id].total += evRegs.length;
        hallMap[ev.hall_id].attended += evAtt.length;
        hallMap[ev.hall_id].count += 1;

        return {
          id: ev.id,
          title: ev.title,
          start_time: ev.start_time,
          end_time: ev.end_time,
          hall_name: hallName,
          registered: evRegs.length,
          attended: evAtt.length,
          noShowRate: Math.max(0, noShow),
          avgRating: evAvgRating,
          reviewCount: evRevs.length,
        };
      });

      const bestTimeSlots = Object.entries(slotMap)
        .map(([slot, data]) => ({
          slot,
          total: data.total,
          rate: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0,
        }))
        .sort((a, b) => b.rate - a.rate);

      const topHalls = Object.values(hallMap)
        .map((data) => ({
          name: data.name,
          count: data.count,
          rate: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0,
        }))
        .sort((a, b) => b.rate - a.rate);

      setStats({
        totalEvents: eventsList.length,
        totalRegistered,
        totalAttended,
        overallNoShowRate: Math.max(0, overallNoShowRate),
        averageRating,
        bestTimeSlots,
        topHalls,
      });

      setEventRows(rows);

      if (adviceRes.data) {
        setCachedAdvice(adviceRes.data as OrganizerAIInsights);
      }
    } catch (err: any) {
      console.error('Error loading aggregate organizer insights:', err);
      setErrorMsg(err?.message || 'Failed to load organizer insights.');
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateAdvice = async () => {
    setGenerating(true);
    setGenError(null);

    try {
      const res = await fetch('/api/organizer/generate-insights', {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI is busy, try again');
      }

      setCachedAdvice({
        organizer_email: profile?.email || '',
        summary: data.summary,
        event_count: data.event_count,
        generated_at: new Date().toISOString(),
      });

      if (data.notice) {
        setGenError(data.notice);
      }
    } catch (err: any) {
      console.error('Error generating advice:', err);
      setGenError(err?.message || 'AI is busy, try again');
    } finally {
      setGenerating(false);
    }
  };

  const orgName =
    profile?.club_name || profile?.department || profile?.name || profile?.email?.split('@')[0] || 'Organizer';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header and Back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>

        <button
          onClick={loadData}
          className="rounded border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
          title="Refresh analytics"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Hero Header */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs space-y-1">
        <div className="inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
          <TrendingUp className="h-3.5 w-3.5 text-[#A4161A]" />
          Analytics &amp; Attendance Planning
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {orgName} Analytics
        </h1>
        <p className="text-xs text-neutral-500">
          Attendance rates, venue efficiency, and Gemini AI planning advice.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-md bg-neutral-100 border border-neutral-200" />
            ))}
          </div>
        </div>
      ) : errorMsg ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-[#991B1B] flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : stats && stats.totalEvents === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-neutral-300" />
          <h3 className="mt-3 text-base font-semibold text-neutral-900">
            No past events to analyze yet
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Host and check-in attendees at campus events to generate cumulative analytics.
          </p>
        </div>
      ) : (
        stats && (
          <>
            {/* Cumulative Metrics Grid */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Cumulative Historical Performance (SQL Ground-Truth)
                </h2>
                <span className="text-xs text-neutral-400 font-mono">
                  {stats.totalEvents} Past Approved Events
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 mb-1">
                    <span className="text-xs font-medium">Registrations</span>
                    <Users className="h-3.5 w-3.5 text-neutral-400" />
                  </div>
                  <div className="text-2xl font-bold text-neutral-900">
                    {stats.totalRegistered}
                  </div>
                  <div className="text-[11px] text-neutral-400">Total passes issued</div>
                </div>

                <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 mb-1">
                    <span className="text-xs font-medium">Turnout</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-700">
                    {stats.totalAttended}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    {stats.totalRegistered > 0
                      ? `${Math.round((stats.totalAttended / stats.totalRegistered) * 100)}% turnout rate`
                      : 'N/A'}
                  </div>
                </div>

                <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 mb-1">
                    <span className="text-xs font-medium">No-Show Rate</span>
                    <UserX className="h-3.5 w-3.5 text-[#991B1B]" />
                  </div>
                  <div className="text-2xl font-bold text-[#991B1B]">
                    {stats.overallNoShowRate}%
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    {stats.totalRegistered - stats.totalAttended} absentees
                  </div>
                </div>

                <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 mb-1">
                    <span className="text-xs font-medium">Avg Review</span>
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  </div>
                  <div className="text-2xl font-bold text-neutral-900">
                    {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : 'N/A'}
                  </div>
                  <div className="text-[11px] text-neutral-400">Out of 5.0</div>
                </div>
              </div>
            </div>

            {/* AI Strategic Planning Advice (Gemini) */}
            <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 p-5 bg-neutral-50">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-[#A4161A] text-white">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <h3 className="text-base font-bold text-neutral-900">
                      Gemini Planning &amp; Overbooking Advice
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Calculates overbooking buffers from your {stats.overallNoShowRate}% historical no-show rate
                  </p>
                </div>

                <button
                  onClick={handleGenerateAdvice}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded bg-[#A4161A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : cachedAdvice ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate Advice
                    </>
                  )}
                </button>
              </div>

              {genError && (
                <div className="m-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
                  <div>
                    <span className="font-semibold">Notice: </span>
                    <span>{genError}</span>
                  </div>
                </div>
              )}

              {!cachedAdvice && !generating && (
                <div className="p-8 text-center space-y-2">
                  <Lightbulb className="mx-auto h-8 w-8 text-neutral-300" />
                  <h4 className="text-sm font-semibold text-neutral-900">
                    No Planning Advice Generated Yet
                  </h4>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                    Click &ldquo;Generate Advice&rdquo; to have Gemini evaluate attendance patterns and suggest capacity buffers.
                  </p>
                </div>
              )}

              {cachedAdvice && (
                <div className="p-5 space-y-4">
                  <div className="rounded border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-800 space-y-1">
                    <div className="font-semibold text-neutral-900 text-xs">
                      Executive Summary
                    </div>
                    <p className="leading-relaxed">{cachedAdvice.summary.executive_summary}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded border border-neutral-200 bg-white p-3.5 space-y-1.5">
                      <div className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-[#A4161A]" />
                        Overbooking Recommendation
                      </div>
                      <p className="text-xs text-neutral-700 leading-relaxed">
                        {cachedAdvice.summary.turnout_and_overbooking_recommendations}
                      </p>
                    </div>

                    <div className="rounded border border-neutral-200 bg-white p-3.5 space-y-1.5">
                      <div className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-[#A4161A]" />
                        Scheduling &amp; Venues
                      </div>
                      <p className="text-xs text-neutral-700 leading-relaxed">
                        {cachedAdvice.summary.preferred_timing_and_venue_insights}
                      </p>
                    </div>
                  </div>

                  {cachedAdvice.summary.actionable_improvements.length > 0 && (
                    <div className="rounded border border-neutral-200 bg-neutral-50 p-3.5 space-y-2">
                      <div className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                        Operational Checklist
                      </div>
                      <ul className="space-y-1 text-xs text-neutral-700">
                        {cachedAdvice.summary.actionable_improvements.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="mt-1 h-1 w-1 rounded-full bg-neutral-600 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-[11px] text-neutral-400 text-right font-mono border-t border-neutral-100 pt-2">
                    Generated on {new Date(cachedAdvice.generated_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Timing and Venue Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Best Time Slots */}
              <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[#A4161A]" />
                  <h3 className="text-sm font-bold text-neutral-900">
                    Turnout by Time Slot
                  </h3>
                </div>

                <div className="space-y-2.5">
                  {stats.bestTimeSlots.map((slot, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-800">{slot.slot}</span>
                        <span className="font-semibold text-neutral-900">
                          {slot.rate}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full bg-[#A4161A] rounded"
                          style={{ width: `${slot.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hall Popularity & Turnout */}
              <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-emerald-700" />
                  <h3 className="text-sm font-bold text-neutral-900">
                    Turnout by Venue
                  </h3>
                </div>

                <div className="space-y-2.5">
                  {stats.topHalls.map((hall, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-800">
                          {hall.name} <span className="text-neutral-400">({hall.count} events)</span>
                        </span>
                        <span className="font-semibold text-emerald-800">
                          {hall.rate}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded"
                          style={{ width: `${hall.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Past Events Breakdown Table */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-neutral-900">
                Past Events Performance Breakdown
              </h3>

              <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Event Title</th>
                        <th className="px-4 py-2.5 font-semibold">Venue</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Registered</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Attended</th>
                        <th className="px-4 py-2.5 font-semibold text-center">No-Show %</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Avg Rating</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {eventRows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-neutral-50 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-medium text-neutral-900">
                            {row.title}
                            <div className="text-[11px] text-neutral-400 font-normal">
                              {new Date(row.start_time).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-neutral-600">
                            {row.hall_name}
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono text-neutral-800">
                            {row.registered}
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono font-semibold text-emerald-700">
                            {row.attended}
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono font-semibold text-[#991B1B]">
                            {row.noShowRate}%
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {row.avgRating > 0 ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                {row.avgRating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-neutral-400 font-mono">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              href={`/organizer/events/${row.id}/insights`}
                              className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-[#A4161A] transition-colors"
                            >
                              Insights <ChevronRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
