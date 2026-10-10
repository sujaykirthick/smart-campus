'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, Fest, Registration, AllowedUser, Volunteer } from '@/lib/types';
import {
  Clock,
  MapPin,
  Sparkles,
  ExternalLink,
  Users,
  Search,
  Filter,
  CheckCircle2,
  Building2,
  GraduationCap,
  RefreshCw,
  Archive,
  Layers,
  Calendar,
  QrCode,
  AlertCircle,
  XCircle,
  Loader2,
  Hourglass,
  HandHelping,
} from 'lucide-react';

interface SeatCountInfo {
  registered: number;
  waitlisted: number;
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [fests, setFests] = useState<Fest[]>([]);
  const [userProfile, setUserProfile] = useState<AllowedUser | null>(null);
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);
  const [myVolunteers, setMyVolunteers] = useState<Volunteer[]>([]);
  const [seatCounts, setSeatCounts] = useState<Record<string, SeatCountInfo>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 1. Primary Fest Tabs: 'standalone' | <fest_id> | 'past_fests_archive'
  const [selectedFestTab, setSelectedFestTab] = useState<string>('standalone');

  // 2. Time Sub-tabs: 'upcoming' | 'ongoing' | 'past'
  const [timeTab, setTimeTab] = useState<'upcoming' | 'ongoing' | 'past'>('upcoming');

  // 3. Filters
  const [organizerFilter, setOrganizerFilter] = useState<'all' | 'club' | 'department'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch current user
      const { data: { user } } = await supabase.auth.getUser();

      let studentRegs: Registration[] = [];
      let studentVols: Volunteer[] = [];
      let profile: AllowedUser | null = null;

      if (user?.email) {
        const [profileRes, myRegRes, myVolRes] = await Promise.all([
          supabase.from('allowed_users').select('*').eq('email', user.email).maybeSingle(),
          supabase.from('registrations').select('*').eq('student_email', user.email),
          supabase.from('volunteers').select('*').eq('student_email', user.email),
        ]);

        if (profileRes.data) {
          profile = profileRes.data;
        } else {
          profile = {
            email: user.email,
            role: (user.user_metadata?.role as any) || 'student',
            name: user.user_metadata?.name || user.email.split('@')[0],
            club_name: null,
            department: null,
            roll_no: null,
          };
        }

        if (myRegRes.data) {
          studentRegs = myRegRes.data as Registration[];
        }

        if (myVolRes.data) {
          studentVols = myVolRes.data as Volunteer[];
        }
      }

      setUserProfile(profile);
      setMyRegistrations(studentRegs);
      setMyVolunteers(studentVols);

      // 2. Fetch approved events, halls, and fests
      const [eventsRes, hallsRes, festsRes, countsRes] = await Promise.all([
        supabase
          .from('events')
          .select(`
            *,
            halls (
              id,
              name,
              capacity,
              location
            ),
            fests (
              id,
              name,
              is_active
            )
          `)
          .eq('status', 'approved')
          .order('start_time', { ascending: true }),

        supabase.from('halls').select('*').order('name', { ascending: true }),
        supabase.from('fests').select('*').order('name', { ascending: true }),
        supabase.from('event_registration_counts').select('*'),
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (hallsRes.error) throw hallsRes.error;
      if (festsRes.error) throw festsRes.error;

      setEvents((eventsRes.data as unknown as CampusEvent[]) || []);
      setHalls(hallsRes.data || []);
      setFests(festsRes.data || []);

      if (countsRes.data) {
        const map: Record<string, SeatCountInfo> = {};
        countsRes.data.forEach((r: { event_id: string; registered_count: number; waitlist_count?: number }) => {
          map[r.event_id] = {
            registered: Number(r.registered_count) || 0,
            waitlisted: Number(r.waitlist_count) || 0,
          };
        });
        setSeatCounts(map);
      }
    } catch (err: any) {
      console.error('Error loading events feed:', err);
      setErrorMsg(err?.message || 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Register (Confirmed or Waitlist automatically handled by backend SQL)
  const handleRegister = async (event: CampusEvent) => {
    if (!userProfile) {
      router.push('/login');
      return;
    }

    if (userProfile.role !== 'student') {
      setErrorMsg('Only students can register for events.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setActionLoadingId(event.id);

    try {
      const { data, error } = await supabase
        .from('registrations')
        .insert({
          event_id: event.id,
          student_email: userProfile.email,
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes('unique') || error.code === '23505') {
          setErrorMsg('You are already registered or waitlisted for this event.');
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      const reg = data as Registration;
      if (reg.status === 'waitlisted') {
        setSuccessMsg(`Event is currently full. You have been added to the waitlist for "${event.title}".`);
      } else {
        setSuccessMsg(`Successfully registered for "${event.title}"! Your confirmed QR ticket is ready.`);
      }
      fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred during registration.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Volunteer Application
  const handleApplyVolunteer = async (event: CampusEvent) => {
    if (!userProfile) {
      router.push('/login');
      return;
    }

    if (userProfile.role !== 'student') {
      setErrorMsg('Only students can volunteer for events.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setActionLoadingId(`vol-${event.id}`);

    try {
      const { error } = await supabase
        .from('volunteers')
        .insert({
          event_id: event.id,
          student_email: userProfile.email,
        });

      if (error) {
        if (error.message.includes('unique') || error.code === '23505') {
          setErrorMsg('You have already applied as a volunteer for this event.');
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      setSuccessMsg(`Application submitted to volunteer for "${event.title}"! The organizer will review your request.`);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit volunteer application.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Cancel Registration (before event start)
  const handleCancelRegistration = async (registrationId: string, eventTitle: string) => {
    if (!confirm(`Are you sure you want to cancel your pass/waitlist spot for "${eventTitle}"?`)) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setActionLoadingId(registrationId);

    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', registrationId);

      if (error) throw error;
      setSuccessMsg(`Registration cancelled for "${eventTitle}".`);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to cancel registration.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Maps & classifications
  const festsById = useMemo(() => {
    const map = new Map<string, Fest>();
    fests.forEach((f) => map.set(f.id, f));
    return map;
  }, [fests]);

  const activeFests = useMemo(() => {
    return fests.filter((f) => f.is_active);
  }, [fests]);

  const inactiveFestEventsCount = useMemo(() => {
    return events.filter((e) => {
      if (!e.fest_id) return false;
      const fest = festsById.get(e.fest_id);
      return fest && !fest.is_active;
    }).length;
  }, [events, festsById]);

  const nowTime = Date.now();

  const eventsInSelectedFestTab = useMemo(() => {
    if (selectedFestTab === 'standalone') {
      return events.filter((e) => e.fest_id === null);
    }
    if (selectedFestTab === 'past_fests_archive') {
      return events.filter((e) => {
        if (!e.fest_id) return false;
        const fest = festsById.get(e.fest_id);
        return fest && !fest.is_active;
      });
    }
    return events.filter((e) => e.fest_id === selectedFestTab);
  }, [events, selectedFestTab, festsById]);

  const classifiedEvents = useMemo(() => {
    const upcoming: CampusEvent[] = [];
    const ongoing: CampusEvent[] = [];
    const past: CampusEvent[] = [];

    eventsInSelectedFestTab.forEach((event) => {
      const s = new Date(event.start_time).getTime();
      const e = new Date(event.end_time).getTime();

      if (nowTime < s) {
        upcoming.push(event);
      } else if (nowTime >= s && nowTime <= e) {
        ongoing.push(event);
      } else {
        past.push(event);
      }
    });

    return { upcoming, ongoing, past };
  }, [eventsInSelectedFestTab, nowTime]);

  const filteredList = useMemo(() => {
    let list = classifiedEvents[timeTab];

    if (organizerFilter !== 'all') {
      list = list.filter((e) => {
        const org = (e.club_or_dept || '').toLowerCase();
        if (organizerFilter === 'club') {
          return org.includes('club') || org.includes('society') || org.includes('acm') || org.includes('ieee');
        }
        if (organizerFilter === 'department') {
          return org.includes('department') || org.includes('dept') || org.includes('cse') || org.includes('ece');
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.club_or_dept && e.club_or_dept.toLowerCase().includes(q)) ||
          (e.halls?.name && e.halls.name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [classifiedEvents, timeTab, organizerFilter, searchQuery]);

  const formatEventDate = (startIso: string, endIso: string) => {
    const s = new Date(startIso);
    const e = new Date(endIso);

    const dateStr = s.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const startTimeStr = s.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const endTimeStr = e.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return { dateStr, startTimeStr, endTimeStr };
  };

  const getActiveTabTitle = () => {
    if (selectedFestTab === 'standalone') return 'Standalone Events';
    if (selectedFestTab === 'past_fests_archive') return 'Past Fests Archive';
    const fest = festsById.get(selectedFestTab);
    return fest ? `${fest.name} Events` : 'Fest Events';
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header Banner */}
      <div className="overflow-hidden rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A24B]/30 bg-[#FDF8ED] px-3.5 py-1 text-xs font-bold text-[#A07C28]">
              <Sparkles className="h-3.5 w-3.5" />
              Official Campus Schedule &amp; Passes
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2B1B17]">
              Campus Events &amp; Fests
            </h1>
            <p className="text-xs sm:text-sm text-[#7A6A62]">
              Explore student club workshops, department conferences, and cultural fests with digital QR entry.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {myRegistrations.length > 0 && (
              <Link
                href="/my-events"
                className="inline-flex items-center gap-2 rounded-xl bg-[#B3202A] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] transition-colors"
              >
                <QrCode className="h-4 w-4" />
                My Passes &amp; Roles ({myRegistrations.length})
              </Link>
            )}

            <button
              onClick={fetchData}
              className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-2.5 text-[#7A6A62] shadow-xs hover:border-[#B3202A] hover:text-[#B3202A] hover:bg-[#FFFFFF] transition-colors cursor-pointer"
              title="Refresh feed"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Global Alert Banners */}
        {errorMsg && (
          <div className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEE2E2] p-3 text-xs text-[#7F1D1D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[#7F1D1D] shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-[#7F1D1D] hover:opacity-75 cursor-pointer">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 rounded-xl border border-[#BBF7D0] bg-[#DCFCE7] p-3 text-xs text-[#15803D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#15803D] shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-[#15803D] hover:opacity-75 cursor-pointer">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* PRIMARY FEST TABS BAR (Pill Tabs) */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-[#EADFD6] pb-3 overflow-x-auto">
          {/* Standalone Tab */}
          <button
            onClick={() => setSelectedFestTab('standalone')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 ${
              selectedFestTab === 'standalone'
                ? 'bg-[#B3202A] text-white shadow-xs'
                : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#7A6A62] hover:text-[#2B1B17] hover:border-[#B3202A]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Standalone Events ({events.filter((e) => e.fest_id === null).length})
          </button>

          {/* Active Fests */}
          {activeFests.map((fest) => {
            const count = events.filter((e) => e.fest_id === fest.id).length;
            const isSelected = selectedFestTab === fest.id;

            return (
              <button
                key={fest.id}
                onClick={() => setSelectedFestTab(fest.id)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-[#B3202A] text-white shadow-xs'
                    : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#7A6A62] hover:text-[#2B1B17] hover:border-[#B3202A]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#C9A24B]" />
                {fest.name} ({count})
              </button>
            );
          })}

          {/* Past Fests Archive */}
          {inactiveFestEventsCount > 0 && (
            <button
              onClick={() => setSelectedFestTab('past_fests_archive')}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 ${
                selectedFestTab === 'past_fests_archive'
                  ? 'bg-[#B3202A] text-white shadow-xs'
                  : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#7A6A62] hover:text-[#2B1B17] hover:border-[#B3202A]'
              }`}
            >
              <Archive className="h-3.5 w-3.5" />
              Past Fests Archive ({inactiveFestEventsCount})
            </button>
          )}
        </div>

        {/* TIME SUB-TABS & FILTERS */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTimeTab('upcoming')}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  timeTab === 'upcoming'
                    ? 'bg-[#B3202A] text-white shadow-xs'
                    : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#7A6A62] hover:text-[#2B1B17]'
                }`}
              >
                Upcoming ({classifiedEvents.upcoming.length})
              </button>

              <button
                onClick={() => setTimeTab('ongoing')}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  timeTab === 'ongoing'
                    ? 'bg-[#B3202A] text-white shadow-xs'
                    : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#15803D] hover:bg-[#DCFCE7]/40'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-[#15803D] animate-pulse"></span>
                Ongoing ({classifiedEvents.ongoing.length})
              </button>

              <button
                onClick={() => setTimeTab('past')}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  timeTab === 'past'
                    ? 'bg-[#B3202A] text-white shadow-xs'
                    : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#7A6A62] hover:text-[#2B1B17]'
                }`}
              >
                Past ({classifiedEvents.past.length})
              </button>
            </div>

            <div className="text-xs text-[#7A6A62] font-serif font-bold">{getActiveTabTitle()}</div>
          </div>

          {/* Search & Organizer Filters */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#FFFFFF] p-3 rounded-2xl border border-[#EADFD6] shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A62]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by event title, organizer, or keywords..."
                className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] py-2 pl-10 pr-4 text-xs text-[#2B1B17] placeholder:text-[#A3938B] focus:border-[#B3202A] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-[#7A6A62] bg-[#FFFAF5] rounded-xl px-3 py-1.5 border border-[#EADFD6]">
              <Filter className="h-3.5 w-3.5 text-[#7A6A62]" />
              <select
                value={organizerFilter}
                onChange={(e) => setOrganizerFilter(e.target.value as 'all' | 'club' | 'department')}
                className="bg-transparent text-xs font-bold text-[#2B1B17] focus:outline-none cursor-pointer"
              >
                <option value="all">All Organizers</option>
                <option value="club">Student Clubs</option>
                <option value="department">Academic Departments</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-96 w-full animate-pulse rounded-2xl bg-[#EADFD6]/40"
            />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <Calendar className="mx-auto h-12 w-12 text-[#D5C5B8]" />
          <h3 className="mt-3 font-serif text-lg font-bold text-[#2B1B17]">
            No events found in this category
          </h3>
          <p className="mt-1 text-xs text-[#7A6A62]">
            {selectedFestTab === 'past_fests_archive'
              ? 'No archived events found.'
              : 'Try selecting a different time tab or clearing your search filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredList.map((event) => {
            const { dateStr, startTimeStr, endTimeStr } = formatEventDate(
              event.start_time,
              event.end_time
            );
            const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
            const festObj = festsById.get(event.fest_id || '') || event.fests;

            const countInfo = seatCounts[event.id] || { registered: 0, waitlisted: 0 };
            const registeredCount = countInfo.registered;
            const waitlistCount = countInfo.waitlisted;

            const capacity = hall?.capacity || 0;
            const seatsLeft = capacity > 0 ? Math.max(0, capacity - registeredCount) : null;
            const isFull = seatsLeft !== null && seatsLeft <= 0;

            const evStartMs = new Date(event.start_time).getTime();
            const evEndMs = new Date(event.end_time).getTime();
            const hasStarted = nowTime >= evStartMs;
            const hasEnded = nowTime > evEndMs;

            const myReg = myRegistrations.find((r) => r.event_id === event.id);
            const isRegistered = !!myReg;
            const isWaitlisted = myReg?.status === 'waitlisted';

            const myVol = myVolunteers.find((v) => v.event_id === event.id);
            const volunteersNeeded = event.volunteers_needed || 0;

            return (
              <div
                key={event.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[#EADFD6] bg-[#FFFFFF] shadow-xs transition-all hover:shadow-md hover:border-[#B3202A]/40"
              >
                {/* Poster on top with rounded corners */}
                <div className="relative h-48 w-full overflow-hidden bg-[#FAF0F0]">
                  {event.poster_url ? (
                    <img
                      src={event.poster_url}
                      alt={event.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#8E1A22] via-[#B3202A] to-[#681116] p-4 text-center text-white">
                      <Building2 className="h-8 w-8 text-white/80 mb-1" />
                      <span className="text-xs font-bold tracking-wider uppercase text-[#E5C378]">
                        {event.club_or_dept || 'Campus Event'}
                      </span>
                    </div>
                  )}

                  {/* Badges on poster */}
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                    {festObj && (
                      <span className="rounded-full bg-[#C9A24B] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#2B1B17] shadow-xs">
                        {festObj.name}
                      </span>
                    )}

                    {isRegistered ? (
                      isWaitlisted ? (
                        <span className="rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B45309] shadow-xs flex items-center gap-1">
                          <Hourglass className="h-2.5 w-2.5" /> Waitlisted
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#DCFCE7] border border-[#BBF7D0] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#15803D] shadow-xs flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Confirmed
                        </span>
                      )
                    ) : hasEnded ? (
                      <span className="rounded-full bg-[#2B1B17]/80 backdrop-blur-xs px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                        Ended
                      </span>
                    ) : isFull ? (
                      <span className="rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B45309] shadow-xs flex items-center gap-1">
                        <Hourglass className="h-2.5 w-2.5" /> Waitlist Open
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#DCFCE7] border border-[#BBF7D0] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#15803D] shadow-xs flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Open
                      </span>
                    )}

                    {volunteersNeeded > 0 && (
                      <span className="rounded-full bg-[#FAF0F0] border border-[#EADFD6] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8E1A22] shadow-xs flex items-center gap-1">
                        <HandHelping className="h-2.5 w-2.5" /> Volunteers
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="flex flex-1 flex-col p-5 space-y-4 justify-between">
                  <div className="space-y-2">
                    {/* Club / Dept Chip & Seats-left indicator */}
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="inline-flex items-center rounded-md bg-[#FAF0F0] border border-[#EADFD6] px-2 py-0.5 text-[10px] font-bold text-[#8E1A22] uppercase tracking-wider">
                        {event.club_or_dept || 'Official Campus Event'}
                      </span>

                      {seatsLeft !== null && (
                        <span className={`text-[11px] font-bold ${seatsLeft === 0 ? 'text-[#B45309]' : seatsLeft < 20 ? 'text-[#B3202A]' : 'text-[#15803D]'}`}>
                          {seatsLeft === 0 ? (
                            waitlistCount > 0 ? `Full (${waitlistCount} waitlist)` : 'Full • Waitlist'
                          ) : (
                            `${seatsLeft} seats left`
                          )}
                        </span>
                      )}
                    </div>

                    <h3 className="font-serif text-lg font-bold text-[#2B1B17] line-clamp-2 leading-snug">
                      {event.title}
                    </h3>

                    {event.description && (
                      <p className="text-xs text-[#7A6A62] line-clamp-2 leading-relaxed">
                        {event.description}
                      </p>
                    )}
                  </div>

                  {/* Venue & Time Meta */}
                  <div className="space-y-2 pt-2 border-t border-[#EADFD6] text-xs">
                    <div className="flex items-center justify-between text-[#2B1B17]">
                      <span className="flex items-center gap-1.5 font-bold">
                        <MapPin className="h-3.5 w-3.5 text-[#B3202A]" />
                        {hall?.name || 'Campus Venue'}
                      </span>
                      {hall?.capacity && (
                        <span className="flex items-center gap-1 text-[11px] text-[#7A6A62] font-mono">
                          <Users className="h-3 w-3" /> {registeredCount}/{hall.capacity} booked
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[#7A6A62] font-mono text-[11px]">
                      <Calendar className="h-3.5 w-3.5 text-[#7A6A62]" />
                      <span>{dateStr}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[#7A6A62] font-mono text-[11px]">
                      <Clock className="h-3.5 w-3.5 text-[#7A6A62]" />
                      <span>{startTimeStr} – {endTimeStr}</span>
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div className="space-y-2 pt-2 border-t border-[#EADFD6]">
                    {isRegistered ? (
                      <div className="space-y-2">
                        {isWaitlisted ? (
                          <div className="flex items-center justify-between rounded-xl bg-[#FEF3C7] border border-[#FDE68A] px-3 py-2 text-xs font-bold text-[#B45309]">
                            <span className="flex items-center gap-1.5">
                              <Hourglass className="h-4 w-4 text-[#B45309]" />
                              Waitlisted
                            </span>
                            <Link
                              href="/my-events"
                              className="text-xs text-[#B45309] hover:underline font-bold"
                            >
                              Check Rank
                            </Link>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] px-3 py-2 text-xs font-bold text-[#15803D]">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-[#15803D]" />
                              Pass Confirmed
                            </span>
                            <Link
                              href="/my-events"
                              className="text-xs text-[#15803D] hover:underline font-bold"
                            >
                              Open Pass
                            </Link>
                          </div>
                        )}

                        {!hasStarted && (
                          <button
                            onClick={() => handleCancelRegistration(myReg.id, event.title)}
                            disabled={actionLoadingId === myReg.id}
                            className="w-full text-center text-[11px] font-semibold text-[#7F1D1D] hover:underline cursor-pointer"
                          >
                            {actionLoadingId === myReg.id ? 'Cancelling...' : 'Cancel Registration'}
                          </button>
                        )}
                      </div>
                    ) : hasEnded ? (
                      <div className="rounded-xl bg-[#FFFAF5] border border-[#EADFD6] py-2 text-center text-xs font-bold text-[#7A6A62]">
                        Event Concluded
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleRegister(event)}
                          disabled={actionLoadingId === event.id}
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#B3202A] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {actionLoadingId === event.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isFull ? (
                            <>
                              <Hourglass className="h-3.5 w-3.5" />
                              Join Waitlist
                            </>
                          ) : (
                            <>
                              <QrCode className="h-3.5 w-3.5" />
                              Register for Event
                            </>
                          )}
                        </button>

                        {/* Volunteer apply button */}
                        {volunteersNeeded > 0 && !hasStarted && (
                          <div>
                            {myVol ? (
                              <div className="rounded-xl bg-[#FDF8ED] border border-[#C9A24B]/30 px-3 py-1.5 text-center text-[11px] font-bold text-[#A07C28]">
                                Volunteer Applied ({myVol.status})
                              </div>
                            ) : (
                              <button
                                onClick={() => handleApplyVolunteer(event)}
                                disabled={actionLoadingId === `vol-${event.id}`}
                                className="w-full flex items-center justify-center gap-1 rounded-xl border border-[#B3202A] bg-transparent py-1.5 text-[11px] font-bold text-[#B3202A] hover:bg-[#FAF0F0] transition-colors cursor-pointer"
                              >
                                {actionLoadingId === `vol-${event.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <HandHelping className="h-3 w-3" />
                                    Apply as Volunteer
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
