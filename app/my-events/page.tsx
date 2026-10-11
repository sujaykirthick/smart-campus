'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Registration, AllowedUser, Volunteer, Review, CampusEvent } from '@/lib/types';
import { QRCodeSVG } from 'qrcode.react';
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
  QrCode,
  Calendar,
  MapPin,
  Clock,
  Building2,
  Trash2,
  RefreshCw,
  X,
  Compass,
  Hourglass,
  HandHelping,
  Camera,
  Star,
  Loader2,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Shield,
} from 'lucide-react';

interface WaitlistRankMap {
  [registrationId: string]: number;
}

const MemoizedQRCode = React.memo(function MemoizedQRCode({ token }: { token: string }) {
  return (
    <QRCodeSVG
      value={token}
      size={260}
      level="H"
      includeMargin={true}
    />
  );
});

type SectionKey = 'registered' | 'waitlist' | 'volunteering' | 'hosting' | 'past';

export default function MyEventsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [volunteerRoles, setVolunteerRoles] = useState<Volunteer[]>([]);
  const [hostedEvents, setHostedEvents] = useState<CampusEvent[]>([]);
  const [waitlistRanks, setWaitlistRanks] = useState<WaitlistRankMap>({});
  const [userReviews, setUserReviews] = useState<Record<string, Review>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<SectionKey>('registered');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Review Modal State
  const [reviewingEvent, setReviewingEvent] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return registrations.find((r) => r.id === selectedTicketId) || null;
  }, [registrations, selectedTicketId]);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setInitialLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        router.push('/login');
        return;
      }

      // Fetch user profile from allowed_users
      const { data: userProfile } = await supabase
        .from('allowed_users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      const profileData: AllowedUser = userProfile || {
        email: user.email,
        role: (user.user_metadata?.role as any) || 'student',
        name: user.user_metadata?.name || user.email.split('@')[0],
        club_name: null,
        department: null,
        roll_no: null,
      };
      setProfile(profileData);

      // Fetch registrations, volunteers, hosted events, and student's reviews
      const [regsRes, volsRes, hostedRes, reviewsRes] = await Promise.all([
        supabase
          .from('registrations')
          .select(`
            *,
            events (
              id,
              title,
              description,
              start_time,
              end_time,
              organizer_email,
              club_or_dept,
              poster_url,
              registration_link,
              halls:halls!events_hall_id_fkey (
                id,
                name,
                capacity,
                location
              ),
              fests (
                id,
                name
              )
            )
          `)
          .eq('student_email', user.email)
          .order('registered_at', { ascending: false }),

        supabase
          .from('volunteers')
          .select(`
            *,
            events (
              id,
              title,
              description,
              start_time,
              end_time,
              organizer_email,
              club_or_dept,
              poster_url,
              halls:halls!events_hall_id_fkey (
                id,
                name,
                capacity,
                location
              ),
              fests (
                id,
                name
              )
            )
          `)
          .eq('student_email', user.email)
          .order('applied_at', { ascending: false }),

        supabase
          .from('events')
          .select(`
            id,
            title,
            description,
            start_time,
            end_time,
            status,
            poster_url,
            volunteers_needed,
            club_or_dept,
            halls:halls!events_hall_id_fkey (
              id,
              name,
              capacity,
              location
            ),
            fests (
              id,
              name
            ),
            organizations (
              id,
              name,
              type
            )
          `)
          .eq('organizer_email', user.email)
          .order('start_time', { ascending: false }),

        supabase
          .from('reviews')
          .select('*')
          .eq('student_email', user.email),
      ]);

      if (regsRes.error) throw regsRes.error;
      const rawRegs = (regsRes.data as unknown as Registration[]) || [];
      const loadedRegs = rawRegs.filter(
        (r) => !r.events || r.student_email?.toLowerCase().trim() !== r.events.organizer_email?.toLowerCase().trim()
      );

      setRegistrations(loadedRegs);

      if (volsRes.data) {
        setVolunteerRoles(volsRes.data as unknown as Volunteer[]);
      }

      if (hostedRes.data) {
        setHostedEvents(hostedRes.data as unknown as CampusEvent[]);
      }

      if (reviewsRes.data) {
        const rMap: Record<string, Review> = {};
        reviewsRes.data.forEach((r: Review) => {
          rMap[r.event_id] = r;
        });
        setUserReviews(rMap);
      }

      // Compute waitlist ranks for waitlisted items
      const waitlistedEvents = loadedRegs.filter((r) => r.status === 'waitlisted');
      if (waitlistedEvents.length > 0) {
        const ranks: WaitlistRankMap = {};
        await Promise.all(
          waitlistedEvents.map(async (myReg) => {
            const { data: allWaitlisted } = await supabase
              .from('registrations')
              .select('id, waitlisted_at, registered_at')
              .eq('event_id', myReg.event_id)
              .eq('status', 'waitlisted')
              .order('waitlisted_at', { ascending: true })
              .order('registered_at', { ascending: true });

            if (allWaitlisted) {
              const idx = allWaitlisted.findIndex((item) => item.id === myReg.id);
              ranks[myReg.id] = idx >= 0 ? idx + 1 : 1;
            }
          })
        );
        setWaitlistRanks(ranks);
      }
    } catch (err: any) {
      console.error('Error fetching registrations:', err);
      showToast('error', err?.message || 'Failed to load passes');
    } finally {
      if (!isSilent) setInitialLoading(false);
    }
  }, [supabase, router, showToast]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Background polling every 30 seconds
  useEffect(() => {
    if (selectedTicketId !== null) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData, selectedTicketId]);

  const handleCancelRegistration = async (regId: string, eventTitle: string, isWaitlist: boolean) => {
    const actionLabel = isWaitlist ? 'leave the waitlist for' : 'cancel pass for';
    if (!confirm(`Are you sure you want to ${actionLabel} "${eventTitle}"?`)) return;

    setCancellingId(regId);
    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', regId);

      if (error) throw error;

      if (selectedTicketId === regId) {
        setSelectedTicketId(null);
      }
      showToast('success', isWaitlist ? 'Left waitlist' : 'Pass cancelled');
      loadData(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to cancel');
    } finally {
      setCancellingId(null);
    }
  };

  const handleOpenReviewModal = (eventId: string, eventTitle: string) => {
    const existing = userReviews[eventId];
    setReviewRating(existing?.rating || 5);
    setReviewComment(existing?.comment || '');
    setReviewingEvent({ id: eventId, title: eventTitle });
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingEvent || !profile) return;
    setSubmittingReview(true);

    try {
      const existing = userReviews[reviewingEvent.id];
      if (existing) {
        const { error } = await supabase
          .from('reviews')
          .update({
            rating: reviewRating,
            comment: reviewComment.trim() || null,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reviews')
          .insert({
            event_id: reviewingEvent.id,
            student_email: profile.email,
            rating: reviewRating,
            comment: reviewComment.trim() || null,
          });

        if (error) throw error;
      }

      showToast('success', 'Feedback submitted. Thank you!');
      setReviewingEvent(null);
      loadData(true);
    } catch (err: any) {
      console.error('Error submitting review:', err);
      showToast('error', err?.message || 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Group items by section
  const now = Date.now();
  const registeredPasses = useMemo(() => {
    return registrations.filter((r) => {
      const isPast = r.events?.end_time ? new Date(r.events.end_time).getTime() < now : false;
      return r.status === 'confirmed' && !isPast;
    });
  }, [registrations, now]);

  const waitlistPasses = useMemo(() => {
    return registrations.filter((r) => {
      const isPast = r.events?.end_time ? new Date(r.events.end_time).getTime() < now : false;
      return r.status === 'waitlisted' && !isPast;
    });
  }, [registrations, now]);

  const pastEvents = useMemo(() => {
    return registrations.filter((r) => {
      return r.events?.end_time ? new Date(r.events.end_time).getTime() < now : false;
    });
  }, [registrations, now]);

  const tabsConfig = [
    { id: 'registered', label: 'Registered', count: registeredPasses.length },
    { id: 'waitlist', label: 'Waitlist', count: waitlistPasses.length },
    { id: 'volunteering', label: 'Volunteering', count: volunteerRoles.length },
    { id: 'hosting', label: 'Hosting', count: hostedEvents.length },
    { id: 'past', label: 'Past', count: pastEvents.length },
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="My Events & Passes"
        description={
          profile?.roll_no
            ? `Signed in as ${profile.name || profile.email} (${profile.roll_no})`
            : `Signed in as ${profile?.name || profile?.email}`
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/events">
              <Button variant="secondary" size="sm">
                <Compass className="h-4 w-4" /> Browse Events
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadData(false)}
              aria-label="Refresh events"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Tabs Switcher */}
      <Tabs
        tabs={tabsConfig}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as SectionKey)}
        variant="underline"
      />

      {/* 1. REGISTERED SECTION */}
      {activeTab === 'registered' && (
        <section aria-label="Registered Passes">
          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : registeredPasses.length === 0 ? (
            <EmptyState
              icon={<QrCode className="h-6 w-6 text-neutral-400" />}
              title="No active event passes"
              description="Explore campus events to register and receive your high-contrast digital QR pass."
              action={
                <Link href="/events">
                  <Button variant="primary" size="sm">
                    <Compass className="h-4 w-4" /> Browse Events
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {registeredPasses.map((reg) => {
                const ev = reg.events;
                if (!ev) return null;
                const isCheckedIn = !!reg.checked_in_at;

                return (
                  <Card key={reg.id} className="flex flex-col justify-between">
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isCheckedIn ? (
                              <StatusBadge status="approved" label="Checked In" />
                            ) : (
                              <StatusBadge status="approved" label="Confirmed Pass" />
                            )}
                            {ev.fests && (
                              <span className="rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                                {ev.fests.name}
                              </span>
                            )}
                          </div>
                          <h2 className="text-base font-bold text-neutral-900 line-clamp-1">
                            {ev.title}
                          </h2>
                          <p className="text-xs text-neutral-500 font-medium">
                            {ev.club_or_dept || 'Campus'}
                          </p>
                        </div>

                        {/* QR Thumbnail */}
                        <button
                          onClick={() => setSelectedTicketId(reg.id)}
                          className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:border-[#A4161A] shadow-xs cursor-pointer shrink-0 transition-colors"
                          title="View large QR pass"
                          aria-label="View QR pass"
                        >
                          <QRCodeSVG value={reg.qr_token} size={50} level="M" />
                        </button>
                      </div>

                      {/* Venue & Timing */}
                      <div className="pt-2 border-t border-neutral-100 text-xs text-neutral-600 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                          <span className="font-medium text-neutral-800">
                            {formatHall(ev.halls?.name, ev.halls?.capacity)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-neutral-600">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>{formatEventDate(ev.start_time, ev.end_time)}</span>
                        </div>
                      </div>

                      {isCheckedIn && (
                        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                          <span>
                            Verified at{' '}
                            {new Date(reg.checked_in_at!).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setSelectedTicketId(reg.id)}
                      >
                        <QrCode className="h-4 w-4" /> View QR Pass
                      </Button>
                      {!isCheckedIn && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleCancelRegistration(reg.id, ev.title, false)}
                          disabled={cancellingId === reg.id}
                          aria-label="Cancel Pass"
                          title="Cancel Pass"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 2. WAITLIST SECTION */}
      {activeTab === 'waitlist' && (
        <section aria-label="Waitlisted Events">
          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : waitlistPasses.length === 0 ? (
            <EmptyState
              icon={<Hourglass className="h-6 w-6 text-neutral-400" />}
              title="No waitlisted events"
              description="When events reach venue capacity, joining the waitlist queues your ticket automatically."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {waitlistPasses.map((reg) => {
                const ev = reg.events;
                if (!ev) return null;
                const rank = waitlistRanks[reg.id] || 1;

                return (
                  <Card key={reg.id} className="flex flex-col justify-between">
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <StatusBadge status="waitlisted" label={`Waitlist #${rank}`} />
                          <h2 className="text-base font-bold text-neutral-900 line-clamp-1 pt-1">
                            {ev.title}
                          </h2>
                          <p className="text-xs text-neutral-500 font-medium">
                            {ev.club_or_dept || 'Campus'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <Hourglass className="h-3.5 w-3.5 text-amber-700" />
                          Position #{rank} in queue
                        </div>
                        <p className="text-[11px] text-amber-800">
                          If an attendee cancels before event start time, your pass will be confirmed automatically.
                        </p>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 text-xs text-neutral-600 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                          <span>{formatHall(ev.halls?.name, ev.halls?.capacity)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-neutral-600">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>{formatEventDate(ev.start_time, ev.end_time)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
                      <span className="text-xs text-neutral-500 font-medium">
                        Pass locked while on waitlist
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCancelRegistration(reg.id, ev.title, true)}
                        disabled={cancellingId === reg.id}
                      >
                        <Trash2 className="h-4 w-4" /> Leave Waitlist
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. VOLUNTEERING SECTION */}
      {activeTab === 'volunteering' && (
        <section aria-label="Volunteer Roles">
          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : volunteerRoles.length === 0 ? (
            <EmptyState
              icon={<HandHelping className="h-6 w-6 text-neutral-400" />}
              title="No volunteer applications"
              description="Apply for volunteer duties on upcoming campus events to help coordinate and scan attendees."
              action={
                <Link href="/events">
                  <Button variant="primary" size="sm">
                    <Compass className="h-4 w-4" /> Find Opportunities
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {volunteerRoles.map((vol) => {
                const ev = vol.events;
                if (!ev) return null;
                const isAccepted = vol.status === 'accepted';

                return (
                  <Card key={vol.id} className="flex flex-col justify-between">
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div>
                            {isAccepted ? (
                              <StatusBadge status="approved" label="Accepted Volunteer" />
                            ) : vol.status === 'rejected' ? (
                              <StatusBadge status="rejected" label="Not Selected" />
                            ) : vol.status === 'withdrawn' ? (
                              <StatusBadge status="draft" label="Withdrawn" />
                            ) : (
                              <StatusBadge status="pending" label="Pending Review" />
                            )}
                          </div>
                          <h2 className="text-base font-bold text-neutral-900 line-clamp-1 pt-1">
                            {ev.title}
                          </h2>
                          <p className="text-xs text-neutral-500 font-medium">
                            Coordinator: {ev.organizer_email}
                          </p>
                        </div>

                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-[#A4161A] shrink-0">
                          <HandHelping className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 text-xs text-neutral-600 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                          <span>{formatHall(ev.halls?.name, ev.halls?.capacity)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-neutral-600">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>{formatEventDate(ev.start_time, ev.end_time)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-neutral-50 border-t border-neutral-200">
                      {isAccepted ? (
                        <div className="space-y-1.5">
                          <Link href={`/organizer/scan/${vol.event_id}`}>
                            <Button variant="primary" size="sm" className="w-full">
                              <Camera className="h-4 w-4" /> Open Attendance Scanner
                            </Button>
                          </Link>
                          {(() => {
                            const nowTime = Date.now();
                            const evStartMs = ev.start_time ? new Date(ev.start_time).getTime() : 0;
                            const evEndMs = ev.end_time ? new Date(ev.end_time).getTime() : 0;
                            const isScanWindow =
                              evStartMs > 0 &&
                              evEndMs > 0 &&
                              nowTime >= evStartMs - 30 * 60 * 1000 &&
                              nowTime <= evEndMs + 30 * 60 * 1000;
                            return !isScanWindow ? (
                              <p className="text-[11px] text-neutral-500 text-center">
                                Scanner active 30 min before to 30 min after session
                              </p>
                            ) : null;
                          })()}
                        </div>
                      ) : (
                        <div className="text-xs text-center text-neutral-500 py-1">
                          {vol.status === 'rejected'
                            ? 'Application not selected by organizer'
                            : vol.status === 'withdrawn'
                            ? 'Application was withdrawn'
                            : 'Organizer decision pending'}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 4. HOSTING SECTION */}
      {activeTab === 'hosting' && (
        <section aria-label="Hosted Events">
          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : hostedEvents.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-6 w-6 text-neutral-400" />}
              title="No events hosted yet"
              description="Propose campus events through your club or department to access organizer tools and attendance scanning."
              action={
                <Link href="/organizer">
                  <Button variant="primary" size="sm">
                    Host an Event
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hostedEvents.map((ev) => (
                <Card key={ev.id} className="flex flex-col justify-between">
                  <div className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={ev.status as any} />
                          {ev.fests && (
                            <span className="rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                              {ev.fests.name}
                            </span>
                          )}
                        </div>
                        <h2 className="text-base font-bold text-neutral-900 line-clamp-1 pt-1">
                          {ev.title}
                        </h2>
                        <p className="text-xs text-neutral-500 font-medium">
                          {ev.organizations?.name || ev.club_or_dept || 'Standalone'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-neutral-100 text-xs text-neutral-600 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                        <span>{formatHall(ev.halls?.name, ev.halls?.capacity)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-neutral-600">
                        <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                        <span>{formatEventDate(ev.start_time, ev.end_time)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
                    <span className="text-xs text-neutral-500 font-medium">
                      Host controls active
                    </span>
                    <Link href={`/organizer/events/${ev.id}`}>
                      <Button variant="primary" size="sm">
                        Manage Event <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. PAST SECTION WITH REVIEWS */}
      {activeTab === 'past' && (
        <section aria-label="Past Events">
          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : pastEvents.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-6 w-6 text-neutral-400" />}
              title="No past attended events"
              description="Events you have attended or registered for will appear here after they conclude."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pastEvents.map((reg) => {
                const ev = reg.events;
                if (!ev) return null;
                const isCheckedIn = !!reg.checked_in_at;
                const userReview = userReviews[ev.id];

                return (
                  <Card key={reg.id} className="flex flex-col justify-between">
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status="draft" label="Concluded" />
                            {isCheckedIn ? (
                              <StatusBadge status="approved" label="Attended" />
                            ) : (
                              <StatusBadge status="rejected" label="Missed" />
                            )}
                          </div>
                          <h2 className="text-base font-bold text-neutral-900 line-clamp-1 pt-1">
                            {ev.title}
                          </h2>
                          <p className="text-xs text-neutral-500 font-medium">
                            {ev.club_or_dept || 'Campus'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 text-xs text-neutral-600 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                          <span>{formatHall(ev.halls?.name, ev.halls?.capacity)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-neutral-600">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>{formatEventDate(ev.start_time, ev.end_time)}</span>
                        </div>
                      </div>

                      {/* Review Call to Action */}
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs space-y-2">
                        {userReview ? (
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1 text-amber-600 font-semibold">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`h-3.5 w-3.5 ${
                                      i < userReview.rating
                                        ? 'fill-amber-500 text-amber-500'
                                        : 'text-neutral-300'
                                    }`}
                                  />
                                ))}
                                <span className="text-neutral-700 ml-1 text-xs">
                                  ({userReview.rating}/5)
                                </span>
                              </div>
                              {userReview.comment && (
                                <p className="mt-1 text-neutral-600 text-xs italic line-clamp-2">
                                  &ldquo;{userReview.comment}&rdquo;
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenReviewModal(ev.id, ev.title)}
                            >
                              Edit
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-neutral-600 font-medium">
                              How was this session?
                            </span>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenReviewModal(ev.id, ev.title)}
                            >
                              <Star className="h-3.5 w-3.5 fill-white" /> Leave a review
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* LEAVE A REVIEW MODAL */}
      {reviewingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-neutral-200 space-y-4">
            <button
              onClick={() => setReviewingEvent(null)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
              aria-label="Close review dialog"
            >
              <X className="h-4 w-4" />
            </button>

            <div>
              <h2 className="text-lg font-bold text-neutral-900">
                Event Feedback
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                {reviewingEvent.title} • Feedback is anonymous to organizers
              </p>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-800 mb-2">
                  Overall Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-2 rounded-lg border border-neutral-200 hover:border-amber-400 bg-white hover:bg-amber-50/40 transition-colors cursor-pointer"
                      aria-label={`Rate ${star} star`}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= reviewRating
                            ? 'fill-amber-500 text-amber-500'
                            : 'text-neutral-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="font-bold text-sm text-neutral-800 ml-2">
                    {reviewRating} / 5
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                  Comments (Optional)
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share feedback on speaker quality, content, hall facilities..."
                  rows={3}
                  className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-xs text-neutral-900 focus:border-[#A4161A] focus:ring-1 focus:ring-[#A4161A] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReviewingEvent(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingReview}
                >
                  {submittingReview ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                    </>
                  ) : (
                    'Submit Feedback'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LARGE HIGH-CONTRAST QR POPUP (Optimized for phone brightness & scanning) */}
      {mounted &&
        selectedTicket &&
        selectedTicket.events &&
        selectedTicket.status === 'confirmed' &&
        createPortal(
          <div
            key={selectedTicket.id}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          >
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 sm:p-7 text-neutral-900 shadow-2xl border-2 border-neutral-300 space-y-4">
              <button
                onClick={() => setSelectedTicketId(null)}
                className="absolute top-4 right-4 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                aria-label="Close QR pass"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Pass Header */}
              <div className="text-center space-y-1.5 pt-1">
                <div className="inline-block rounded-md bg-[#A4161A] px-3 py-1 text-[11px] font-bold text-white uppercase tracking-wider">
                  Official Campus Pass
                </div>

                <h2 className="text-lg font-bold text-neutral-900 leading-snug pt-1">
                  {selectedTicket.events.title}
                </h2>

                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-center">
                  <div className="font-bold text-sm text-neutral-900">
                    {profile?.name || selectedTicket.student_email}
                  </div>
                  <div className="font-mono text-xs font-semibold text-[#A4161A] mt-0.5">
                    Roll No: {selectedTicket.roll_no || profile?.roll_no || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Ultra High-Contrast Large QR Container */}
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-neutral-900 bg-white p-4 shadow-sm">
                <div className="p-2 bg-white">
                  <MemoizedQRCode token={selectedTicket.qr_token} />
                </div>
                <div className="mt-2 text-center">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                    Digital Entry Token
                  </span>
                  <div className="font-mono text-xs font-semibold text-neutral-800 select-all">
                    {selectedTicket.qr_token}
                  </div>
                </div>
              </div>

              {/* Venue and Timing */}
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-1.5 text-xs text-neutral-700">
                <div className="flex items-center justify-between font-medium">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                    {formatHall(selectedTicket.events.halls?.name, selectedTicket.events.halls?.capacity)}
                  </span>
                  {selectedTicket.checked_in_at ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Checked In
                    </span>
                  ) : (
                    <span className="text-[#A4161A] font-semibold">Ready to Scan</span>
                  )}
                </div>

                <div className="text-xs text-neutral-500">
                  {formatEventDate(selectedTicket.events.start_time, selectedTicket.events.end_time)}
                </div>
              </div>

              <p className="text-center text-[11px] text-neutral-500 font-medium">
                Set screen to high brightness and present at venue entrance.
              </p>

              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={() => setSelectedTicketId(null)}
              >
                Close Pass
              </Button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
