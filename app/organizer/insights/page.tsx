'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AllowedUser, CampusEvent, Organization, OrganizationAIAdvice, OrganizerPlanningAdvice } from '@/lib/types';
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  DataTable,
  EmptyState,
  SkeletonCard,
  useToast,
} from '@/components/ui';
import { formatSimpleDate, formatHall } from '@/lib/format';
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
  ShieldAlert,
  BarChart3,
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

export default function OrganizationInsightsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [myOrganizations, setMyOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [eventRows, setEventRows] = useState<EventRow[]>([]);
  const [cachedAdvice, setCachedAdvice] = useState<{ advice: OrganizerPlanningAdvice; generated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOrgData, setLoadingOrgData] = useState(false);
  const [generating, setGenerating] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // 1. Load User Profile and Available Organizations
  const loadUserOrgs = useCallback(async () => {
    setLoading(true);

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

      // Fetch all organizations
      const { data: allOrgs } = await supabase
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });

      const orgsList = (allOrgs as Organization[]) || [];

      // If approver role, can view all organizations
      if (
        userProfile &&
        ['student_affairs', 'affairs', 'event_office', 'cd'].includes(userProfile.role)
      ) {
        setMyOrganizations(orgsList);
        if (orgsList.length > 0 && !selectedOrgId) {
          setSelectedOrgId(orgsList[0].id);
        }
        setLoading(false);
        return;
      }

      // Query clubs where user is a member
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .ilike('email', user.email);

      const memberOrgIds = new Set((memberships || []).map((m) => m.organization_id));
      const userClubs = orgsList.filter((o) => o.type === 'club' && memberOrgIds.has(o.id));

      // Query derived department
      let userDept: Organization | null = null;
      if (userProfile?.department) {
        userDept =
          orgsList.find(
            (o) =>
              o.type === 'department' &&
              o.name.toLowerCase().trim() === userProfile.department?.toLowerCase().trim()
          ) || null;
      }

      const accessible = [...userClubs];
      if (userDept && !accessible.some((o) => o.id === userDept!.id)) {
        accessible.push(userDept);
      }

      setMyOrganizations(accessible);
      if (accessible.length > 0 && !selectedOrgId) {
        setSelectedOrgId(accessible[0].id);
      }
    } catch (err: any) {
      console.error('Error loading organization list:', err);
      showToast('error', err?.message || 'Failed to load organizations.');
    } finally {
      setLoading(false);
    }
  }, [supabase, router, selectedOrgId, showToast]);

  useEffect(() => {
    loadUserOrgs();
  }, [loadUserOrgs]);

  // 2. Load Organization Statistics
  const loadOrgData = useCallback(async (orgId: string) => {
    setLoadingOrgData(true);

    try {
      // Fetch past approved events for this organization
      const { data: events, error: evErr } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, hall_id, halls(name), status')
        .eq('organization_id', orgId)
        .eq('status', 'approved')
        .order('start_time', { ascending: false });

      if (evErr) throw evErr;

      const eventsList = events || [];
      const eventIds = eventsList.map((e) => e.id);

      // Fetch AI advice cache
      const { data: adviceRow } = await supabase
        .from('organization_ai_advice')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (adviceRow) {
        setCachedAdvice({
          advice: adviceRow.advice,
          generated_at: adviceRow.generated_at,
        });
      } else {
        setCachedAdvice(null);
      }

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
        return;
      }

      // Fetch registrations and reviews for all past events
      const [regsRes, reviewsRes] = await Promise.all([
        supabase
          .from('registrations')
          .select('event_id, status, checked_in_at')
          .in('event_id', eventIds),
        supabase
          .from('event_reviews_public')
          .select('event_id, rating')
          .in('event_id', eventIds),
      ]);

      const allRegs = regsRes.data || [];
      const allReviews = reviewsRes.data || [];

      // Compute aggregates
      const confirmedRegs = allRegs.filter((r) => r.status === 'confirmed');
      const attendedRegs = confirmedRegs.filter((r) => r.checked_in_at !== null);

      const totalRegistered = confirmedRegs.length;
      const totalAttended = attendedRegs.length;
      const overallNoShowRate =
        totalRegistered > 0
          ? Math.round(((totalRegistered - totalAttended) / totalRegistered) * 100)
          : 0;

      const totalRating = allReviews.reduce((acc, r) => acc + (r.rating || 0), 0);
      const averageRating = allReviews.length > 0 ? totalRating / allReviews.length : 0;

      // Group by event
      const slotMap: Record<string, { total: number; attended: number }> = {};
      const hallMap: Record<string, { total: number; attended: number; count: number; name: string }> = {};

      const rows: EventRow[] = eventsList.map((ev: any) => {
        const evRegs = confirmedRegs.filter((r) => r.event_id === ev.id);
        const evAtt = evRegs.filter((r) => r.checked_in_at !== null);
        const evRevs = allReviews.filter((r) => r.event_id === ev.id);

        const evAvgRating =
          evRevs.length > 0
            ? evRevs.reduce((acc, curr) => acc + curr.rating, 0) / evRevs.length
            : 0;
        const noShow =
          evRegs.length > 0
            ? Math.round(((evRegs.length - evAtt.length) / evRegs.length) * 100)
            : 0;

        const startH = new Date(ev.start_time).getHours();
        let slotKey = 'Evening (5 PM+)';
        if (startH < 12) slotKey = 'Morning (Pre-noon)';
        else if (startH < 17) slotKey = 'Afternoon (12-5 PM)';

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
    } catch (err: any) {
      console.error('Error loading organization stats:', err);
      showToast('error', err?.message || 'Failed to load organization insights.');
    } finally {
      setLoadingOrgData(false);
    }
  }, [supabase, showToast]);

  useEffect(() => {
    if (selectedOrgId) {
      loadOrgData(selectedOrgId);
    }
  }, [selectedOrgId, loadOrgData]);

  // 3. Generate Gemini Advice for the selected organization
  const handleGenerateAdvice = async () => {
    if (!selectedOrgId) return;
    setGenerating(true);

    try {
      const res = await fetch('/api/organizer/generate-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: selectedOrgId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI is busy, please try again.');
      }

      setCachedAdvice({
        advice: data.summary,
        generated_at: new Date().toISOString(),
      });
      showToast('success', 'Gemini planning advice synthesized successfully');
    } catch (err: any) {
      console.error('Error generating organization advice:', err);
      showToast('error', err?.message || 'Failed to generate advice');
    } finally {
      setGenerating(false);
    }
  };

  const selectedOrg = myOrganizations.find((o) => o.id === selectedOrgId);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Top Header & Org Selector */}
      <PageHeader
        title={selectedOrg ? `${selectedOrg.name} Analytics` : 'Organization Analytics'}
        description="Cumulative turnout, overbooking benchmarks, and Gemini AI planning advice."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/organizer">
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-4 w-4" /> Host Dashboard
              </Button>
            </Link>
            {selectedOrgId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadOrgData(selectedOrgId)}
                aria-label="Refresh data"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        }
      />

      {/* Organization Switcher Bar */}
      {myOrganizations.length > 0 && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-800">
            <Building2 className="h-4 w-4 text-[#A4161A]" />
            <span>Select Active Organization:</span>
          </div>

          <div className="sm:w-80">
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 focus:border-[#A4161A] focus:outline-none cursor-pointer"
            >
              {myOrganizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.type === 'club' ? 'Club' : 'Department'})
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : myOrganizations.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6 text-neutral-400" />}
          title="No organization memberships found"
          description="You are not currently enrolled in any student clubs or mapped academic departments. Join a club to access cumulative insights."
        />
      ) : loadingOrgData ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : stats && stats.totalEvents === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6 text-neutral-400" />}
          title={`No past events for ${selectedOrg?.name || 'organization'}`}
          description="Host and complete campus events under this organization to build cumulative turnout and rating metrics."
        />
      ) : (
        stats && (
          <>
            {/* STAT CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <Card className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-medium">Total Passes</span>
                  <Users className="h-4 w-4 text-neutral-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-neutral-900">
                  {stats.totalRegistered}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">Across {stats.totalEvents} past events</div>
              </Card>

              <Card className="p-4 sm:p-5 border-emerald-200 bg-emerald-50/20">
                <div className="flex items-center justify-between text-emerald-800 mb-1">
                  <span className="text-xs font-medium">Turnout Count</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-800">
                  {stats.totalAttended}
                </div>
                <div className="text-[11px] text-emerald-700 mt-1">
                  {stats.totalRegistered > 0
                    ? `${Math.round((stats.totalAttended / stats.totalRegistered) * 100)}% overall turnout`
                    : '—'}
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-red-200 bg-red-50/20">
                <div className="flex items-center justify-between text-[#991B1B] mb-1">
                  <span className="text-xs font-medium">No-Show Rate</span>
                  <UserX className="h-4 w-4 text-[#991B1B]" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-[#991B1B]">
                  {stats.overallNoShowRate}%
                </div>
                <div className="text-[11px] text-red-700 mt-1">
                  {stats.totalRegistered - stats.totalAttended} total absentees
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-amber-200 bg-amber-50/20">
                <div className="flex items-center justify-between text-amber-800 mb-1">
                  <span className="text-xs font-medium">Average Rating</span>
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-amber-900">
                  {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}
                </div>
                <div className="text-[11px] text-amber-800 mt-1">Scale of 1.0 to 5.0</div>
              </Card>
            </div>

            {/* CHARTS: TURNOUT BY TIME & TURNOUT BY HALL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[#A4161A]" /> Turnout by Time Slot
                  </h2>
                </div>

                <div className="space-y-3 pt-1">
                  {stats.bestTimeSlots.map((slot, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-700 font-medium">{slot.slot}</span>
                        <span className="font-bold text-neutral-900 font-mono">{slot.rate}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full bg-[#A4161A] rounded-full transition-all duration-500"
                          style={{ width: `${slot.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-700" /> Turnout by Venue
                  </h2>
                </div>

                <div className="space-y-3 pt-1">
                  {stats.topHalls.map((hall, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-700 font-medium">
                          {hall.name} <span className="text-neutral-400 font-normal">({hall.count} events)</span>
                        </span>
                        <span className="font-bold text-emerald-800 font-mono">{hall.rate}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                          style={{ width: `${hall.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* AI STRATEGIC PLANNING ADVICE (GEMINI) */}
            <Card className="p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#A4161A] text-white">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-bold text-neutral-900">
                      Gemini Planning &amp; Overbooking Advice
                    </h2>
                  </div>
                  {cachedAdvice ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 pt-0.5">
                      <span>Calculated from {stats.overallNoShowRate}% historical no-show rate</span>
                      <span>•</span>
                      <span className="font-mono text-neutral-500">
                        Generated at {new Date(cachedAdvice.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                        {new Date(cachedAdvice.generated_at).toLocaleDateString()}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      Suggests capacity buffers and optimal scheduling based on {stats.overallNoShowRate}% average no-show rate.
                    </p>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateAdvice}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Synthesizing...
                    </>
                  ) : cachedAdvice ? (
                    <>
                      <RefreshCw className="h-4 w-4" /> Regenerate Advice
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generate Advice
                    </>
                  )}
                </Button>
              </div>

              {!cachedAdvice && !generating && (
                <EmptyState
                  icon={<Lightbulb className="h-6 w-6 text-neutral-400" />}
                  title="No Planning Advice Generated Yet"
                  description={`Click 'Generate Advice' to have Gemini evaluate attendance patterns and suggest capacity buffers for ${selectedOrg?.name}.`}
                />
              )}

              {cachedAdvice && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-1 text-xs">
                    <div className="font-bold text-neutral-900">Executive Summary</div>
                    <p className="text-neutral-700 leading-relaxed">
                      {cachedAdvice.advice.executive_summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
                      <div className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 uppercase tracking-wide">
                        <Users className="h-4 w-4 text-[#A4161A]" />
                        Overbooking Recommendation
                      </div>
                      <p className="text-xs text-neutral-700 leading-relaxed">
                        {cachedAdvice.advice.turnout_and_overbooking_recommendations}
                      </p>
                    </div>

                    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
                      <div className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 uppercase tracking-wide">
                        <Building2 className="h-4 w-4 text-[#A4161A]" />
                        Scheduling &amp; Venues
                      </div>
                      <p className="text-xs text-neutral-700 leading-relaxed">
                        {cachedAdvice.advice.preferred_timing_and_venue_insights}
                      </p>
                    </div>
                  </div>

                  {cachedAdvice.advice.actionable_improvements?.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-2">
                      <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wide">
                        <Lightbulb className="h-4 w-4 text-amber-600" />
                        Operational Checklist
                      </div>
                      <ul className="space-y-1.5 text-xs text-neutral-800">
                        {cachedAdvice.advice.actionable_improvements.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0" />
                            <span className="leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* PAST EVENTS TABLE */}
            <Card className="p-6 space-y-4">
              <h2 className="text-base font-bold text-neutral-900">
                Past Events Performance Breakdown
              </h2>

              <DataTable>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Venue</th>
                      <th className="px-4 py-3 text-center">Registered</th>
                      <th className="px-4 py-3 text-center">Attended</th>
                      <th className="px-4 py-3 text-center">No-Show %</th>
                      <th className="px-4 py-3 text-center">Avg Rating</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {eventRows.map((row) => (
                      <tr key={row.id} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900">{row.title}</div>
                          <div className="text-[11px] text-neutral-500 font-mono">
                            {formatSimpleDate(row.start_time)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-600">{row.hall_name}</td>
                        <td className="px-4 py-3 text-center font-mono text-neutral-800">
                          {row.registered}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-emerald-700">
                          {row.attended}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-[#991B1B]">
                          {row.noShowRate}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.avgRating > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                              {row.avgRating.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-neutral-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/organizer/events/${row.id}/insights`}>
                            <Button variant="secondary" size="sm">
                              Insights <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            </Card>
          </>
        )
      )}
    </div>
  );
}
