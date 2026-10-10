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
  ShieldCheck,
  Loader2,
  ExternalLink,
  Layers,
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

      // If no past events yet
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

      // Compute stats
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

        const hallName = ev.halls?.name || 'Campus Venue';
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header and Back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Events Dashboard
        </Link>

        <button
          onClick={loadData}
          className="rounded-xl border border-zinc-200 bg-white p-2.5 text-zinc-600 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Refresh analytics"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Hero Header */}
      <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-gradient-to-br from-[#FFFAF5] via-white to-[#FFFAF5]/50 p-6 sm:p-8 shadow-xs relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B3202A] via-[#C9A24B] to-[#B3202A]" />
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A24B]/40 bg-[#FFFAF5] px-3 py-1 text-xs font-semibold text-[#8E1A22]">
            <TrendingUp className="h-3.5 w-3.5 text-[#C9A24B]" />
            Club & Department Level Intelligence
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2B1B17]">
            {orgName} Analytics & Planning
          </h1>
          <p className="text-sm text-[#7A6A62]">
            Historical attendance trends, timing/hall performance, and Gemini AI overbooking strategies
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#EADFD6]/50" />
            ))}
          </div>
        </div>
      ) : errorMsg ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-xs text-red-900 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-[#8E1A22] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : stats && stats.totalEvents === 0 ? (
        <div className="rounded-2xl border border-[#EADFD6] bg-white p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-[#EADFD6]" />
          <h3 className="mt-3 font-serif text-base font-bold text-[#2B1B17]">
            No past events to analyze yet
          </h3>
          <p className="mt-1 text-sm text-[#7A6A62]">
            Host and scan attendees at events to unlock cumulative insights and AI planning advice.
          </p>
        </div>
      ) : (
        stats && (
          <>
            {/* Cumulative Metrics Grid */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#7A6A62]">
                  Cumulative Historical Performance (SQL Ground-Truth)
                </h2>
                <span className="text-xs text-[#7A6A62] font-mono">
                  {stats.totalEvents} Past Approved Events
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-[#EADFD6] bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between text-[#7A6A62] mb-1">
                    <span className="text-xs font-semibold">Total Registrations</span>
                    <Users className="h-4 w-4 text-sky-600" />
                  </div>
                  <div className="font-serif text-2xl font-bold text-[#2B1B17]">
                    {stats.totalRegistered}
                  </div>
                  <div className="text-[11px] text-[#7A6A62]">Cumulative passes issued</div>
                </div>

                <div className="rounded-2xl border border-[#EADFD6] bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between text-[#7A6A62] mb-1">
                    <span className="text-xs font-semibold">Verified Turnout</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="font-serif text-2xl font-bold text-emerald-800">
                    {stats.totalAttended}
                  </div>
                  <div className="text-[11px] text-[#7A6A62]">
                    {stats.totalRegistered > 0
                      ? `${Math.round((stats.totalAttended / stats.totalRegistered) * 100)}% overall turnout`
                      : 'N/A'}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#EADFD6] bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between text-[#7A6A62] mb-1">
                    <span className="text-xs font-semibold">Historical No-Show</span>
                    <UserX className="h-4 w-4 text-[#8E1A22]" />
                  </div>
                  <div className="font-serif text-2xl font-bold text-[#8E1A22]">
                    {stats.overallNoShowRate}%
                  </div>
                  <div className="text-[11px] text-[#7A6A62]">
                    {stats.totalRegistered - stats.totalAttended} total absentees
                  </div>
                </div>

                <div className="rounded-2xl border border-[#EADFD6] bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between text-[#7A6A62] mb-1">
                    <span className="text-xs font-semibold">Club Rating</span>
                    <Star className="h-4 w-4 fill-[#C9A24B] text-[#C9A24B]" />
                  </div>
                  <div className="font-serif text-2xl font-bold text-[#C9A24B]">
                    {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : 'N/A'}
                  </div>
                  <div className="text-[11px] text-[#7A6A62]">Average student review</div>
                </div>
              </div>
            </div>

            {/* AI Strategic Planning Advice (Gemini) */}
            <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-white shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EADFD6] p-6 bg-[#FFFAF5]">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B3202A] text-white shadow-xs">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                      Gemini Strategic Planning & Overbooking Advice
                    </h3>
                  </div>
                  <p className="text-xs text-[#7A6A62] mt-1">
                    Custom recommendations generated by Gemini from your historical {stats.overallNoShowRate}% no-show rate and turnouts
                  </p>
                </div>

                <button
                  onClick={handleGenerateAdvice}
                  disabled={generating}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#B3202A] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] disabled:opacity-50 transition-all cursor-pointer"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Consulting Gemini...
                    </>
                  ) : cachedAdvice ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Regenerate Planning Advice
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Planning Advice
                    </>
                  )}
                </button>
              </div>

              {genError && (
                <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#8E1A22] mt-0.5" />
                  <div>
                    <span className="font-bold">Gemini API Notice: </span>
                    <span>{genError}</span>
                  </div>
                </div>
              )}

              {!cachedAdvice && !generating && (
                <div className="p-10 text-center space-y-3">
                  <Lightbulb className="mx-auto h-10 w-10 text-[#EADFD6]" />
                  <h4 className="font-serif text-sm font-bold text-[#2B1B17]">
                    No Planning Advice Generated Yet
                  </h4>
                  <p className="text-xs text-[#7A6A62] max-w-sm mx-auto">
                    Click &ldquo;Generate Planning Advice&rdquo; to have Gemini analyze your historical attendance math and suggest overbooking buffers.
                  </p>
                </div>
              )}

              {cachedAdvice && (
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    {/* Executive Summary */}
                    <div className="rounded-xl border border-[#C9A24B]/40 bg-[#FFFAF5] p-4 text-xs text-[#2B1B17]">
                      <div className="font-bold text-[#8E1A22] text-sm mb-1 flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-[#C9A24B]" />
                        Executive Assessment
                      </div>
                      <p className="leading-relaxed">{cachedAdvice.summary.executive_summary}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Overbooking and Turnout Strategy */}
                      <div className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-5 space-y-2">
                        <div className="text-xs font-bold text-[#8E1A22] uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-[#B3202A]" />
                          Recommended Overbooking Buffer
                        </div>
                        <p className="text-xs text-[#2B1B17] leading-relaxed">
                          {cachedAdvice.summary.turnout_and_overbooking_recommendations}
                        </p>
                      </div>

                      {/* Scheduling & Venue Insights */}
                      <div className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-5 space-y-2">
                        <div className="text-xs font-bold text-[#8E1A22] uppercase tracking-wider flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-[#B3202A]" />
                          Optimal Scheduling & Halls
                        </div>
                        <p className="text-xs text-[#2B1B17] leading-relaxed">
                          {cachedAdvice.summary.preferred_timing_and_venue_insights}
                        </p>
                      </div>
                    </div>

                    {/* Actionable Improvements List */}
                    {cachedAdvice.summary.actionable_improvements.length > 0 && (
                      <div className="rounded-xl border border-[#C9A24B]/40 bg-[#FFFAF5] p-5 space-y-2.5">
                        <div className="text-xs font-bold text-[#8E1A22] uppercase tracking-wider flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5 text-[#C9A24B]" />
                          Actionable Operational Checklist
                        </div>
                        <ul className="space-y-1.5 text-xs text-[#2B1B17]">
                          {cachedAdvice.summary.actionable_improvements.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#C9A24B] shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] text-[#7A6A62] text-right pt-2 font-mono border-t border-[#EADFD6]">
                    Generated on {new Date(cachedAdvice.generated_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Timing and Venue Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Best Time Slots */}
              <div className="rounded-2xl border border-[#EADFD6] bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#B3202A]" />
                  <h3 className="font-serif text-base font-bold text-[#2B1B17]">
                    Turnout by Time Slot
                  </h3>
                </div>

                <div className="space-y-3">
                  {stats.bestTimeSlots.map((slot, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-[#2B1B17]">{slot.slot}</span>
                        <span className="font-bold text-[#B3202A]">
                          {slot.rate}% turnout
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#EADFD6]/50 overflow-hidden">
                        <div
                          className="h-full bg-[#B3202A] rounded-full transition-all"
                          style={{ width: `${slot.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hall Popularity & Turnout */}
              <div className="rounded-2xl border border-[#EADFD6] bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-700" />
                  <h3 className="font-serif text-base font-bold text-[#2B1B17]">
                    Turnout by Venue Hall
                  </h3>
                </div>

                <div className="space-y-3">
                  {stats.topHalls.map((hall, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-[#2B1B17]">
                          {hall.name} <span className="text-[#7A6A62]">({hall.count} events)</span>
                        </span>
                        <span className="font-bold text-emerald-800">
                          {hall.rate}% turnout
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#EADFD6]/50 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all"
                          style={{ width: `${hall.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Past Events Breakdown Table */}
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                Past Events Performance Breakdown
              </h3>

              <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-white shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#EADFD6] bg-[#FFFAF5] text-[#7A6A62]">
                      <tr>
                        <th className="px-4 py-3 font-bold">Event Title</th>
                        <th className="px-4 py-3 font-bold">Venue</th>
                        <th className="px-4 py-3 font-bold text-center">Registered</th>
                        <th className="px-4 py-3 font-bold text-center">Attended</th>
                        <th className="px-4 py-3 font-bold text-center">No-Show %</th>
                        <th className="px-4 py-3 font-bold text-center">Avg Rating</th>
                        <th className="px-4 py-3 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EADFD6]">
                      {eventRows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-[#FFFAF5] transition-colors"
                        >
                          <td className="px-4 py-3 font-bold text-[#2B1B17]">
                            {row.title}
                            <div className="text-[11px] text-[#7A6A62] font-normal">
                              {new Date(row.start_time).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#7A6A62]">
                            {row.hall_name}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-[#2B1B17]">
                            {row.registered}
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-emerald-800">
                            {row.attended}
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-[#8E1A22]">
                            {row.noShowRate}%
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.avgRating > 0 ? (
                              <span className="inline-flex items-center gap-1 font-bold text-[#C9A24B]">
                                <Star className="h-3 w-3 fill-[#C9A24B]" />
                                {row.avgRating.toFixed(1)} ({row.reviewCount})
                              </span>
                            ) : (
                              <span className="text-[#7A6A62] font-mono">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/organizer/events/${row.id}/insights`}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#EADFD6] bg-white px-2.5 py-1 text-xs font-semibold text-[#2B1B17] hover:bg-[#FFFAF5] hover:text-[#B3202A] transition-colors"
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
