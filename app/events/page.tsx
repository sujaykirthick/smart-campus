'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, Fest, Registration, AllowedUser, Volunteer } from '@/lib/types';
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  Tabs,
  EmptyState,
  SkeletonCard,
  useToast,
} from '@/components/ui';
import { formatEventDate, formatHall } from '@/lib/format';
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
  Hourglass,
  HandHelping,
  Plus,
  Camera,
  ExternalLink,
} from 'lucide-react';

interface SeatCountInfo {
  registered: number;
  waitlisted: number;
}

export default function EventsPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();

  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [fests, setFests] = useState<Fest[]>([]);
  const [userProfile, setUserProfile] = useState<AllowedUser | null>(null);
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);
  const [myVolunteers, setMyVolunteers] = useState<Volunteer[]>([]);
  const [seatCounts, setSeatCounts] = useState<Record<string, SeatCountInfo>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

        if (myRegRes.data) studentRegs = myRegRes.data as Registration[];
        if (myVolRes.data) studentVols = myVolRes.data as Volunteer[];
      }

      setUserProfile(profile);
      setMyRegistrations(studentRegs);
      setMyVolunteers(studentVols);

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
      console.error('Error loading events:', err);
      toastError('Failed to load events', err?.message);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [supabase, toastError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Register
  const handleRegister = async (event: CampusEvent) => {
    if (!userProfile) {
      router.push('/login');
      return;
    }

    if (userProfile.role !== 'student') {
      toastError('Student Only', 'Only students can register for events.');
      return;
    }

    if (userProfile.email.toLowerCase().trim() === event.organizer_email?.toLowerCase().trim()) {
      toastError('Hosting Event', "You are hosting this event and cannot register for it.");
      return;
    }

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
          toastError('Already Registered', 'You are already registered or waitlisted for this event.');
        } else {
          toastError('Registration Failed', error.message);
        }
        return;
      }

      const reg = data as Registration;
      if (reg.status === 'waitlisted') {
        toastSuccess('Added to Waitlist', `Venue full. You are on the waitlist for "${event.title}".`);
      } else {
        toastSuccess('Registration Confirmed!', `Your pass for "${event.title}" is ready in My Passes.`);
      }
      fetchData();
    } catch (err: any) {
      toastError('Registration Error', err?.message);
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
      toastError('Student Only', 'Only students can apply as volunteers.');
      return;
    }

    setActionLoadingId(`vol-${event.id}`);

    try {
      const { error } = await supabase.rpc('apply_volunteer', {
        p_event_id: event.id,
      });

      if (error) {
        toastError('Application Failed', error.message);
        return;
      }

      toastSuccess('Volunteer Application Submitted', `The host for "${event.title}" will review your application.`);
      fetchData();
    } catch (err: any) {
      toastError('Application Error', err?.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Withdraw Volunteer Application
  const handleWithdrawVolunteer = async (event: CampusEvent) => {
    if (!userProfile) return;

    setActionLoadingId(`vol-with-${event.id}`);

    try {
      const { error } = await supabase.rpc('withdraw_volunteer', {
        p_event_id: event.id,
      });

      if (error) {
        toastError('Withdrawal Failed', error.message);
        return;
      }

      toastSuccess('Application Withdrawn', `Withdrew volunteer request for "${event.title}".`);
      fetchData();
    } catch (err: any) {
      toastError('Withdrawal Error', err?.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Cancel Registration
  const handleCancelRegistration = async (registrationId: string, eventTitle: string) => {
    if (!confirm(`Cancel your registration/waitlist spot for "${eventTitle}"?`)) return;

    setActionLoadingId(registrationId);

    try {
      const { error } = await supabase.from('registrations').delete().eq('id', registrationId);
      if (error) throw error;
      toastSuccess('Registration Cancelled', `Cancelled your spot for "${eventTitle}".`);
      fetchData();
    } catch (err: any) {
      toastError('Cancellation Error', err?.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Categorizations
  const festsById = useMemo(() => {
    const map = new Map<string, Fest>();
    fests.forEach((f) => map.set(f.id, f));
    return map;
  }, [fests]);

  const activeFests = useMemo(() => fests.filter((f) => f.is_active), [fests]);

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
          return org.includes('department') || org.includes('dept') || org.includes('math') || org.includes('cse');
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

  // Primary Fest Tabs config
  const festTabItems = [
    {
      id: 'standalone',
      label: 'Campus Events',
      count: events.filter((e) => e.fest_id === null).length,
      icon: <Layers className="h-4 w-4" />,
    },
  ];

  activeFests.forEach((fest) => {
    festTabItems.push({
      id: fest.id,
      label: fest.name,
      count: events.filter((e) => e.fest_id === fest.id).length,
      icon: <Calendar className="h-4 w-4" />,
    });
  });

  if (inactiveFestEventsCount > 0) {
    festTabItems.push({
      id: 'past_fests_archive',
      label: 'Past Fests Archive',
      count: inactiveFestEventsCount,
      icon: <Archive className="h-4 w-4" />,
    });
  }

  // Time sub-tabs config
  const timeSubTabs = [
    { id: 'upcoming', label: 'Upcoming', count: classifiedEvents.upcoming.length },
    { id: 'ongoing', label: 'Ongoing Now', count: classifiedEvents.ongoing.length },
    { id: 'past', label: 'Past Events', count: classifiedEvents.past.length },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Campus Events"
        description="Explore verified academic seminars, technical workshops, and collegiate fests at Amrita."
        actions={
          <div className="flex items-center gap-2">
            {(!userProfile || userProfile.role === 'student' || userProfile.role === 'faculty') && (
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push('/organizer')}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Propose Event
              </Button>
            )}

            {myRegistrations.length > 0 && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => router.push('/my-events')}
                leftIcon={<QrCode className="h-4 w-4 text-[#A4161A]" />}
              >
                My Passes ({myRegistrations.length})
              </Button>
            )}
          </div>
        }
      />

      {/* Primary Category Tabs (Standalone vs Active Fests vs Archive) */}
      <Tabs
        tabs={festTabItems}
        activeTab={selectedFestTab}
        onChange={setSelectedFestTab}
        variant="underline"
      />

      {/* Sub-tabs & Combined Filter Bar in ONE responsive row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
        <Tabs
          tabs={timeSubTabs}
          activeTab={timeTab}
          onChange={(t) => setTimeTab(t as any)}
          variant="pills"
          className="lg:w-auto"
        />

        {/* Filter controls row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, venue, club..."
              className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none min-h-[40px]"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-4 w-4 text-neutral-400 shrink-0" />
            <select
              value={organizerFilter}
              onChange={(e) => setOrganizerFilter(e.target.value as any)}
              className="w-full sm:w-auto rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-800 focus:border-[#A4161A] focus:outline-none min-h-[40px] cursor-pointer"
            >
              <option value="all">All Organizers</option>
              <option value="club">Clubs</option>
              <option value="department">Departments</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10 text-neutral-400" />}
          title="No events found"
          description="Try switching categories or clearing search filters to see other schedules."
          action={
            <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(''); setOrganizerFilter('all'); }}>
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredList.map((event) => {
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
            const isOngoing = nowTime >= evStartMs && nowTime <= evEndMs;

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
              <Card
                key={event.id}
                padding="none"
                hoverEffect
                className="flex flex-col overflow-hidden"
              >
                {/* Poster Container (Fixed 16:9 Aspect Ratio) */}
                <div className="relative aspect-16/9 w-full overflow-hidden bg-neutral-100 border-b border-neutral-200">
                  {event.poster_url ? (
                    <img
                      src={event.poster_url}
                      alt={event.title}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 p-4 text-center">
                      <div className="w-12 h-12 rounded-xl bg-[#FDF2F2] flex items-center justify-center mb-2 text-[#A4161A] shadow-xs">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <span className="text-xs font-bold text-neutral-800">
                        {event.organizations?.name || event.club_or_dept || 'Campus Event'}
                      </span>
                      <span className="text-[10px] text-neutral-400 mt-0.5">Amrita Vishwa Vidyapeetham</span>
                    </div>
                  )}

                  {/* Badges on Poster */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                    {festObj && (
                      <span className="rounded-full bg-neutral-900/90 backdrop-blur-xs px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        {festObj.name}
                      </span>
                    )}

                    {isOngoing && <StatusBadge status="ongoing" size="sm" />}

                    {isHost ? (
                      <span className="rounded-full bg-neutral-900 text-white px-2.5 py-0.5 text-[10px] font-semibold flex items-center gap-1 shadow-xs">
                        <Building2 className="h-3 w-3 text-[#A4161A]" /> You&apos;re hosting
                      </span>
                    ) : isRegistered ? (
                      isWaitlisted ? (
                        <StatusBadge status="waitlisted" size="sm" />
                      ) : (
                        <StatusBadge status="confirmed" size="sm" />
                      )
                    ) : hasEnded ? (
                      <span className="rounded-full bg-neutral-700 text-white px-2.5 py-0.5 text-[10px] font-medium">
                        Ended
                      </span>
                    ) : isFull ? (
                      <span className="rounded-full bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                        <Hourglass className="h-3 w-3" /> Waitlist Open
                      </span>
                    ) : null}

                    {volunteersNeeded > 0 && !isHost && (
                      <span className="rounded-full bg-white/95 text-neutral-800 border border-neutral-300 px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 shadow-xs">
                        <HandHelping className="h-3 w-3 text-[#A4161A]" /> Volunteers
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content Body */}
                <div className="flex flex-1 flex-col p-4 sm:p-5 justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-[#A4161A] truncate">
                        {event.organizations?.name || event.club_or_dept || (event.organizer_type === 'standalone' ? 'Standalone' : 'Campus Event')}
                      </span>

                      {/* Seats indicator */}
                      {seatsLeft !== null && (
                        <span
                          className={`text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full ${
                            seatsLeft === 0
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : seatsLeft <= 15
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {seatsLeft === 0
                            ? waitlistCount > 0
                              ? `Full (${waitlistCount} WL)`
                              : 'Full'
                            : `${seatsLeft} seats left`}
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

                  {/* Metadata (Time & Hall) */}
                  <div className="space-y-1.5 pt-3 border-t border-neutral-100 text-xs text-neutral-600">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-neutral-800 truncate">
                        <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                        {formatHall(hall?.name, hall?.capacity)}
                      </span>
                      {hall?.capacity && (
                        <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                          {registeredCount}/{hall.capacity}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-neutral-500 text-[11px]">
                      <Calendar className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                      <span>{formatEventDate(event.start_time, event.end_time)}</span>
                    </div>
                  </div>

                  {/* Action Section */}
                  <div className="pt-2 border-t border-neutral-100 space-y-2">
                    {isHost ? (
                      <div className="flex items-center justify-between rounded-lg bg-neutral-100 p-2.5">
                        <span className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-[#A4161A]" />
                          Host
                        </span>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => router.push(`/organizer/events/${event.id}`)}
                        >
                          Manage Event
                        </Button>
                      </div>
                    ) : isRegistered ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs">
                          <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
                            {isWaitlisted ? (
                              <>
                                <Hourglass className="h-3.5 w-3.5 text-amber-600" />
                                On Waitlist
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                Pass Ready
                              </>
                            )}
                          </span>
                          <Link
                            href="/my-events"
                            className="text-xs font-bold text-[#A4161A] hover:underline"
                          >
                            View &rarr;
                          </Link>
                        </div>

                        {!hasStarted && (
                          <button
                            type="button"
                            onClick={() => handleCancelRegistration(myReg!.id, event.title)}
                            disabled={actionLoadingId === myReg!.id}
                            className="w-full text-center text-xs font-medium text-rose-700 hover:underline cursor-pointer disabled:opacity-50"
                          >
                            {actionLoadingId === myReg!.id ? 'Cancelling...' : 'Cancel Registration'}
                          </button>
                        )}
                      </div>
                    ) : hasEnded ? (
                      <div className="rounded-lg bg-neutral-100 py-2.5 text-center text-xs font-semibold text-neutral-500">
                        Event Concluded
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {event.registration_link ? (
                          <a
                            href={event.registration_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#A4161A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors shadow-xs min-h-[44px]"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Register Externally
                          </a>
                        ) : (
                          <Button
                            variant="primary"
                            size="md"
                            onClick={() => handleRegister(event)}
                            isLoading={actionLoadingId === event.id}
                            className="w-full min-h-[44px]"
                            leftIcon={
                              isFull ? (
                                <Hourglass className="h-4 w-4" />
                              ) : (
                                <QrCode className="h-4 w-4" />
                              )
                            }
                          >
                            {isFull ? 'Join Waitlist' : 'Register Now'}
                          </Button>
                        )}

                        {/* Volunteer Button / Status */}
                        {!isHost && (volunteersNeeded > 0 || (myVol && myVol.status !== 'withdrawn')) && (
                          <div className="pt-1 border-t border-neutral-100">
                            {myVol && myVol.status !== 'withdrawn' ? (
                              <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-2 text-xs">
                                <span className="font-semibold text-neutral-700 flex items-center gap-1">
                                  {myVol.status === 'accepted' ? (
                                    <span className="text-emerald-700 flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" /> Accepted Volunteer
                                    </span>
                                  ) : myVol.status === 'rejected' ? (
                                    <span className="text-neutral-500">Not selected</span>
                                  ) : (
                                    <span className="text-amber-700 flex items-center gap-1">
                                      <Clock className="h-3 w-3" /> Application Pending
                                    </span>
                                  )}
                                </span>

                                {myVol.status === 'accepted' ? (
                                  <Link
                                    href={`/organizer/scan/${event.id}`}
                                    className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1"
                                  >
                                    <Camera className="h-3 w-3" /> Scanner
                                  </Link>
                                ) : (
                                  !hasEnded && (
                                    <button
                                      type="button"
                                      onClick={() => handleWithdrawVolunteer(event)}
                                      disabled={actionLoadingId === `vol-with-${event.id}`}
                                      className="text-[11px] text-neutral-500 hover:text-rose-700 underline cursor-pointer"
                                    >
                                      Withdraw
                                    </button>
                                  )
                                )}
                              </div>
                            ) : (
                              !hasStarted && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleApplyVolunteer(event)}
                                  isLoading={actionLoadingId === `vol-${event.id}`}
                                  className="w-full text-xs"
                                  leftIcon={<HandHelping className="h-3.5 w-3.5 text-[#A4161A]" />}
                                >
                                  Apply as Volunteer
                                </Button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
