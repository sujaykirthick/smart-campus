'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, Fest, Registration, AllowedUser, Volunteer } from '@/lib/types';
import {
  Clock,
  MapPin,
  Users,
  Search,
  Filter,
  CheckCircle2,
  Building2,
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
  Plus,
  Camera,
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

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
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
            halls:halls!events_hall_id_fkey (
              id,
              name,
              capacity,
              location
            ),
            fests (
              id,
              name,
              is_active
            ),
            organizations (
              id,
              name,
              type
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
      if (!isSilent) setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Silent polling every 30s and on window focus so accepted volunteer status updates promptly
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 30000);

    const onFocus = () => {
      fetchData(true);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchData]);

  // Handle Register
  const handleRegister = async (event: CampusEvent) => {
    if (!userProfile) {
      router.push('/login');
      return;
    }

    if (userProfile.role !== 'student') {
      setErrorMsg('Only students can register for events.');
      return;
    }

    if (userProfile.email.toLowerCase().trim() === event.organizer_email?.toLowerCase().trim()) {
      setErrorMsg('You are hosting this event and cannot register for it');
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
        setSuccessMsg(`Event capacity reached. You have been added to the waitlist for "${event.title}".`);
      } else {
        setSuccessMsg(`Registration confirmed for "${event.title}". Pass is available under My Passes.`);
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
      setErrorMsg('Only students can apply as volunteers.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setActionLoadingId(`vol-${event.id}`);

    try {
      const { error } = await supabase.rpc('apply_volunteer', {
        p_event_id: event.id,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg(`Volunteer application submitted for "${event.title}". The organizer will review your application.`);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit volunteer application.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Withdraw Volunteer Application
  const handleWithdrawVolunteer = async (event: CampusEvent) => {
    if (!userProfile) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setActionLoadingId(`vol-with-${event.id}`);

    try {
      const { error } = await supabase.rpc('withdraw_volunteer', {
        p_event_id: event.id,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg(`Withdrew volunteer application for "${event.title}".`);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to withdraw volunteer application.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Cancel Registration
  const handleCancelRegistration = async (registrationId: string, eventTitle: string) => {
    if (!confirm(`Cancel your registration/waitlist spot for "${eventTitle}"?`)) return;

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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header Bar */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Campus Events Schedule
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Browse approved club activities, department workshops, and institutional fests.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(!userProfile || userProfile.role === 'student' || userProfile.role === 'faculty') && (
              <Link
                href="/organizer"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#A4161A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#851215] transition-colors shadow-xs"
              >
                <Plus className="h-4 w-4" />
                Propose an event
              </Link>
            )}

            {myRegistrations.length > 0 && (
              <Link
                href="/my-events"
                className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors"
              >
                <QrCode className="h-4 w-4 text-[#A4161A]" />
                My Passes ({myRegistrations.length})
              </Link>
            )}

            <button
              onClick={() => fetchData()}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              title="Refresh schedule"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Global Alert Banners */}
        {errorMsg && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-[#991B1B] hover:opacity-75 cursor-pointer">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
              <span className="font-medium">{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-800 hover:opacity-75 cursor-pointer">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Primary Category Tabs (Flat Underlined Tabs) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-neutral-200 overflow-x-auto">
          <button
            onClick={() => setSelectedFestTab('standalone')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
              selectedFestTab === 'standalone'
                ? 'border-[#A4161A] text-[#A4161A] font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Standalone Events ({events.filter((e) => e.fest_id === null).length})
          </button>

          {activeFests.map((fest) => {
            const count = events.filter((e) => e.fest_id === fest.id).length;
            const isSelected = selectedFestTab === fest.id;

            return (
              <button
                key={fest.id}
                onClick={() => setSelectedFestTab(fest.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'border-[#A4161A] text-[#A4161A] font-semibold'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
                }`}
              >
                <span>{fest.name}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 font-normal">
                  {count}
                </span>
              </button>
            );
          })}

          {inactiveFestEventsCount > 0 && (
            <button
              onClick={() => setSelectedFestTab('past_fests_archive')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer shrink-0 ${
                selectedFestTab === 'past_fests_archive'
                  ? 'border-[#A4161A] text-[#A4161A] font-semibold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
              }`}
            >
              <Archive className="h-3.5 w-3.5" />
              Past Fests Archive ({inactiveFestEventsCount})
            </button>
          )}
        </div>

        {/* Time Tabs & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-md">
            <button
              onClick={() => setTimeTab('upcoming')}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                timeTab === 'upcoming'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Upcoming ({classifiedEvents.upcoming.length})
            </button>

            <button
              onClick={() => setTimeTab('ongoing')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                timeTab === 'ongoing'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
              Ongoing ({classifiedEvents.ongoing.length})
            </button>

            <button
              onClick={() => setTimeTab('past')}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                timeTab === 'past'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Past ({classifiedEvents.past.length})
            </button>
          </div>

          {/* Search & Organizer Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, venue, or club..."
                className="w-full sm:w-64 rounded-md border border-neutral-300 bg-white py-1.5 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-neutral-700 bg-white rounded-md px-2.5 py-1.5 border border-neutral-300">
              <Filter className="h-3.5 w-3.5 text-neutral-400" />
              <select
                value={organizerFilter}
                onChange={(e) => setOrganizerFilter(e.target.value as 'all' | 'club' | 'department')}
                className="bg-transparent text-xs font-medium text-neutral-800 focus:outline-none cursor-pointer"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-80 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200"
            />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-12 text-center shadow-xs">
          <Calendar className="mx-auto h-10 w-10 text-neutral-300" />
          <h3 className="mt-3 text-base font-semibold text-neutral-900">
            No events found
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            {selectedFestTab === 'past_fests_archive'
              ? 'No past events archived under this category.'
              : 'Try selecting a different tab or adjusting your search filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

            const isHost = !!(
              userProfile?.email &&
              event.organizer_email &&
              userProfile.email.toLowerCase().trim() === event.organizer_email.toLowerCase().trim()
            );

            const myReg = isHost
              ? undefined
              : myRegistrations.find(
                  (r) =>
                    r.event_id === event.id &&
                    r.student_email?.toLowerCase().trim() === userProfile?.email?.toLowerCase().trim()
                );
            const isRegistered = !isHost && !!myReg;
            const isWaitlisted = isRegistered && myReg?.status === 'waitlisted';

            const myVol = myVolunteers.find((v) => v.event_id === event.id);
            const volunteersNeeded = event.volunteers_needed || 0;

            return (
              <div
                key={event.id}
                className="flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs transition-colors hover:border-neutral-300"
              >
                {/* Poster on top */}
                <div className="relative h-44 w-full overflow-hidden bg-neutral-100 border-b border-neutral-200">
                  {event.poster_url ? (
                    <img
                      src={event.poster_url}
                      alt={event.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-100 p-4 text-center">
                      <Building2 className="h-8 w-8 text-neutral-400 mb-1" />
                      <span className="text-xs font-semibold text-neutral-600">
                        {event.club_or_dept || 'Campus Event'}
                      </span>
                    </div>
                  )}

                  {/* Badges on poster */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                    {festObj && (
                      <span className="rounded bg-neutral-900/85 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {festObj.name}
                      </span>
                    )}

                    {isHost ? (
                      <span className="rounded bg-neutral-900 border border-neutral-700 px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
                        <Building2 className="h-2.5 w-2.5 text-[#A4161A]" /> You&apos;re hosting
                      </span>
                    ) : isRegistered ? (
                      isWaitlisted ? (
                        <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-900 flex items-center gap-1">
                          <Hourglass className="h-2.5 w-2.5" /> Waitlisted
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-medium text-emerald-900 flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Registered
                        </span>
                      )
                    ) : hasEnded ? (
                      <span className="rounded bg-neutral-800/80 px-2 py-0.5 text-[10px] font-medium text-white">
                        Ended
                      </span>
                    ) : isFull ? (
                      <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-900 flex items-center gap-1">
                        <Hourglass className="h-2.5 w-2.5" /> Waitlist Open
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-medium text-emerald-900 flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Open
                      </span>
                    )}

                    {volunteersNeeded > 0 && (
                      <span className="rounded bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-[10px] font-medium text-neutral-800 flex items-center gap-1">
                        <HandHelping className="h-2.5 w-2.5 text-[#A4161A]" /> Volunteers Needed
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col p-4 justify-between space-y-3">
                  <div className="space-y-1.5">
                    {/* Club / Dept / Organization Chip & Seats */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700">
                        {event.organizations?.name || event.club_or_dept || (event.organizer_type === 'standalone' ? 'Standalone' : 'Campus Event')}
                      </span>

                      {seatsLeft !== null && (
                        <span className={`text-[11px] font-medium ${seatsLeft === 0 ? 'text-amber-700 font-semibold' : seatsLeft < 20 ? 'text-[#991B1B] font-semibold' : 'text-neutral-600'}`}>
                          {seatsLeft === 0 ? (
                            waitlistCount > 0 ? `Full (${waitlistCount} waitlist)` : 'Full'
                          ) : (
                            `${seatsLeft} seats left`
                          )}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-neutral-900 line-clamp-2 leading-tight">
                      {event.title}
                    </h3>

                    {event.description && (
                      <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">
                        {event.description}
                      </p>
                    )}
                  </div>

                  {/* Venue & Schedule Meta */}
                  <div className="space-y-1.5 pt-2 border-t border-neutral-100 text-xs text-neutral-600">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-neutral-800">
                        <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                        {hall?.name || 'Campus Venue'}
                      </span>
                      {hall?.capacity && (
                        <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                          <Users className="h-3 w-3" /> {registeredCount}/{hall.capacity}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                      <span>{dateStr}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" />
                      <span>{startTimeStr} – {endTimeStr}</span>
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div className="pt-2 border-t border-neutral-100 space-y-2">
                    {isHost ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between rounded-md bg-neutral-100 border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-800">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-[#A4161A]" />
                            You&apos;re hosting this event
                          </span>
                          <Link
                            href={`/organizer/events/${event.id}`}
                            className="inline-flex items-center gap-1 rounded bg-[#A4161A] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
                          >
                            Manage event
                          </Link>
                        </div>
                      </div>
                    ) : isRegistered ? (
                      <div className="space-y-1.5">
                        {isWaitlisted ? (
                          <div className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-900">
                            <span className="flex items-center gap-1.5">
                              <Hourglass className="h-3.5 w-3.5 text-amber-700" />
                              Waitlisted
                            </span>
                            <Link
                              href="/my-events"
                              className="text-xs text-[#A4161A] hover:underline font-semibold"
                            >
                              Check Rank
                            </Link>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-900">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                              Pass Confirmed
                            </span>
                            <Link
                              href="/my-events"
                              className="text-xs text-[#A4161A] hover:underline font-semibold"
                            >
                              View Pass
                            </Link>
                          </div>
                        )}

                        {!hasStarted && (
                          <button
                            onClick={() => handleCancelRegistration(myReg.id, event.title)}
                            disabled={actionLoadingId === myReg.id}
                            className="w-full text-center text-[11px] font-medium text-[#991B1B] hover:underline cursor-pointer"
                          >
                            {actionLoadingId === myReg.id ? 'Cancelling...' : 'Cancel Registration'}
                          </button>
                        )}
                      </div>
                    ) : hasEnded ? (
                      <div className="rounded-md bg-neutral-100 py-2 text-center text-xs font-medium text-neutral-500">
                        Event Concluded
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => handleRegister(event)}
                          disabled={actionLoadingId === event.id}
                          className="w-full flex items-center justify-center gap-1.5 rounded-md bg-[#A4161A] py-2 text-xs font-semibold text-white hover:bg-[#851215] transition-colors disabled:opacity-50 cursor-pointer"
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
                              Register
                            </>
                          )}
                        </button>

                        {/* Volunteer section */}
                        {!isHost && (volunteersNeeded > 0 || (myVol && myVol.status !== 'withdrawn')) && (
                          <div className="pt-1.5 border-t border-neutral-100 space-y-1.5">
                            {myVol && myVol.status !== 'withdrawn' ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 text-[11px]">
                                  <div>
                                    {myVol.status === 'accepted' ? (
                                      <span className="font-semibold text-emerald-800 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Accepted as Volunteer
                                      </span>
                                    ) : myVol.status === 'rejected' ? (
                                      <span className="font-semibold text-neutral-600 flex items-center gap-1">
                                        <XCircle className="h-3 w-3 text-neutral-400" /> Not selected
                                      </span>
                                    ) : (
                                      <span className="font-semibold text-amber-800 flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-amber-600" /> Applied (pending review)
                                      </span>
                                    )}
                                  </div>

                                  {myVol.status !== 'rejected' && !hasEnded && (
                                    <button
                                      onClick={() => handleWithdrawVolunteer(event)}
                                      disabled={actionLoadingId === `vol-with-${event.id}`}
                                      className="text-[11px] text-neutral-500 hover:text-[#991B1B] underline transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                      {actionLoadingId === `vol-with-${event.id}` ? 'Withdrawing...' : 'Withdraw'}
                                    </button>
                                  )}
                                </div>

                                {myVol.status === 'accepted' && (
                                  <div className="space-y-1">
                                    <Link
                                      href={`/organizer/scan/${event.id}`}
                                      className="w-full flex items-center justify-center gap-1.5 rounded-md bg-emerald-700 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors shadow-xs"
                                    >
                                      <Camera className="h-3.5 w-3.5" />
                                      Scan attendance
                                    </Link>
                                    {(nowTime < evStartMs - 30 * 60 * 1000 || nowTime > evEndMs + 30 * 60 * 1000) && (
                                      <p className="text-[10px] text-neutral-500 text-center italic">
                                        Scanning opens 30 min before the event starts and closes 30 min after it ends
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : !hasStarted && (
                              <button
                                onClick={() => handleApplyVolunteer(event)}
                                disabled={actionLoadingId === `vol-${event.id}`}
                                className="w-full flex items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {actionLoadingId === `vol-${event.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <HandHelping className="h-3.5 w-3.5 text-[#A4161A]" />
                                    Volunteer
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
