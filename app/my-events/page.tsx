'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Registration, AllowedUser, Volunteer, Review } from '@/lib/types';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
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
} from 'lucide-react';

interface WaitlistRankMap {
  [registrationId: string]: number; // 1-indexed position
}

const MemoizedQRCode = React.memo(function MemoizedQRCode({ token }: { token: string }) {
  return (
    <QRCodeSVG
      value={token}
      size={200}
      level="H"
      includeMargin={true}
    />
  );
});

export default function MyEventsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [volunteerRoles, setVolunteerRoles] = useState<Volunteer[]>([]);
  const [waitlistRanks, setWaitlistRanks] = useState<WaitlistRankMap>({});
  const [userReviews, setUserReviews] = useState<Record<string, Review>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<'passes' | 'volunteering'>('passes');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return registrations.find((r) => r.id === selectedTicketId) || null;
  }, [registrations, selectedTicketId]);

  // Review Modal State
  const [reviewingEvent, setReviewingEvent] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setInitialLoading(true);
    setErrorMsg(null);
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

      // Fetch registrations, volunteers, and student's reviews
      const [regsRes, volsRes, reviewsRes] = await Promise.all([
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
          .from('reviews')
          .select('*')
          .eq('student_email', user.email),
      ]);

      if (regsRes.error) throw regsRes.error;
      const rawRegs = (regsRes.data as unknown as Registration[]) || [];
      const loadedRegs = rawRegs.filter(
        (r) => !r.events || r.student_email?.toLowerCase().trim() !== r.events.organizer_email?.toLowerCase().trim()
      );

      // Merge registrations smoothly without unmounting list
      setRegistrations((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(loadedRegs)) return prev;
        return loadedRegs;
      });

      if (volsRes.data) {
        const loadedVols = volsRes.data as unknown as Volunteer[];
        setVolunteerRoles((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(loadedVols)) return prev;
          return loadedVols;
        });
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
      setErrorMsg(err?.message || 'Failed to load your registrations.');
    } finally {
      if (!isSilent) setInitialLoading(false);
    }
  }, [supabase, router]);

  // Initial fetch only
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Background polling every 30 seconds and on window focus; paused while QR modal is open
  useEffect(() => {
    if (selectedTicketId !== null) return;

    const interval = setInterval(() => {
      loadData(true);
    }, 30000);

    const onFocus = () => {
      if (selectedTicketId === null) {
        loadData(true);
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadData, selectedTicketId]);

  const handleCancelRegistration = async (regId: string, eventTitle: string, isWaitlist: boolean) => {
    const actionLabel = isWaitlist ? 'leave the waitlist for' : 'cancel registration for';
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
      loadData(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel registration.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleOpenReviewModal = (eventId: string, eventTitle: string) => {
    const existing = userReviews[eventId];
    setReviewRating(existing?.rating || 5);
    setReviewComment(existing?.comment || '');
    setReviewError(null);
    setReviewingEvent({ id: eventId, title: eventTitle });
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingEvent || !profile) return;
    setSubmittingReview(true);
    setReviewError(null);

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

      setReviewingEvent(null);
      loadData();
    } catch (err: any) {
      console.error('Error submitting review:', err);
      setReviewError(err?.message || 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const formatEventDate = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return { dateStr: '', startTimeStr: '', endTimeStr: '' };
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header Bar */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              My Event Passes
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Entry passes, waitlist status, and volunteer assignments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/events"
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Compass className="h-3.5 w-3.5" /> Browse Events
            </Link>

            <button
              onClick={() => loadData(false)}
              className="rounded-md border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
              title="Refresh passes"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* User identification bar */}
        {profile && (
          <div className="mt-4 pt-4 border-t border-neutral-200 flex flex-wrap items-center gap-4 text-xs text-neutral-600">
            <div>
              <span className="text-neutral-400">Student: </span>
              <span className="font-semibold text-neutral-900">{profile.name || profile.email}</span>
            </div>
            {profile.roll_no && (
              <div>
                <span className="text-neutral-400">Roll No: </span>
                <span className="font-mono font-semibold text-[#A4161A]">{profile.roll_no}</span>
              </div>
            )}
            <div>
              <span className="text-neutral-400">Email: </span>
              <span className="font-mono text-neutral-800">{profile.email}</span>
            </div>
          </div>
        )}
      </div>

      {/* Underlined Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          onClick={() => setActiveViewTab('passes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeViewTab === 'passes'
              ? 'border-[#A4161A] text-[#A4161A] font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
          }`}
        >
          <QrCode className="h-3.5 w-3.5" />
          Event Passes ({registrations.length})
        </button>

        <button
          onClick={() => setActiveViewTab('volunteering')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeViewTab === 'volunteering'
              ? 'border-[#A4161A] text-[#A4161A] font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
          }`}
        >
          <HandHelping className="h-3.5 w-3.5" />
          Volunteer Roles ({volunteerRoles.length})
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. PASSES VIEW */}
      {activeViewTab === 'passes' && (
        <>
          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-40 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200" />
              ))}
            </div>
          ) : registrations.length === 0 ? (
            <div className="rounded-md border border-neutral-200 bg-white p-12 text-center shadow-xs">
              <QrCode className="mx-auto h-10 w-10 text-neutral-300" />
              <h3 className="mt-3 text-base font-semibold text-neutral-900">
                No registered events
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Browse available campus events to register and receive digital QR passes.
              </p>
              <Link
                href="/events"
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#A4161A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
              >
                <Compass className="h-3.5 w-3.5" /> Explore Events
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {registrations.map((reg) => {
                const ev = reg.events;
                if (!ev) return null;

                const { dateStr, startTimeStr, endTimeStr } = formatEventDate(ev.start_time, ev.end_time);
                const isCheckedIn = !!reg.checked_in_at;
                const isWaitlisted = reg.status === 'waitlisted';
                const waitlistRank = waitlistRanks[reg.id] || 1;
                const evStartMs = new Date(ev.start_time).getTime();
                const evEndMs = new Date(ev.end_time).getTime();
                const hasStarted = Date.now() >= evStartMs;
                const hasEnded = Date.now() >= evEndMs;
                const userReview = userReviews[ev.id];

                return (
                  <div
                    key={reg.id}
                    className="flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs"
                  >
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isWaitlisted ? (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                <Hourglass className="h-3 w-3" /> Waitlist #{waitlistRank}
                              </span>
                            ) : isCheckedIn ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                                <CheckCircle2 className="h-3 w-3" /> Checked In
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-800">
                                Confirmed Pass
                              </span>
                            )}

                            {ev.fests && (
                              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                {ev.fests.name}
                              </span>
                            )}

                            {hasEnded && (
                              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 font-medium">
                                Ended
                              </span>
                            )}
                          </div>

                          <h3 className="text-base font-bold text-neutral-900 pt-0.5">
                            {ev.title}
                          </h3>
                          <p className="text-xs text-neutral-500">
                            {ev.club_or_dept || 'Campus'}
                          </p>
                        </div>

                        {/* QR Thumbnail */}
                        {!isWaitlisted && (
                          <button
                            onClick={() => setSelectedTicketId(reg.id)}
                            className="p-1.5 rounded border border-neutral-200 bg-white hover:border-[#A4161A] shadow-xs cursor-pointer shrink-0"
                            title="View QR pass"
                          >
                            <QRCodeSVG value={reg.qr_token} size={52} level="M" />
                          </button>
                        )}
                      </div>

                      {/* Waitlist Notice */}
                      {isWaitlisted && (
                        <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-1">
                          <div className="font-semibold flex items-center gap-1.5">
                            <Hourglass className="h-3.5 w-3.5 text-amber-700" />
                            Waitlist Position #{waitlistRank}
                          </div>
                          <p className="text-[11px] text-amber-800">
                            You will be automatically confirmed if another attendee cancels before start time.
                          </p>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="space-y-1 pt-2 border-t border-neutral-100 text-xs text-neutral-600">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                          <span>{ev.halls?.name || 'Campus Venue'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-mono">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>{dateStr} • {startTimeStr} – {endTimeStr}</span>
                        </div>
                      </div>

                      {isCheckedIn && (
                        <div className="rounded bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                          <span>Checked in at {new Date(reg.checked_in_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                        </div>
                      )}

                      {/* Review Section */}
                      {isCheckedIn && hasEnded && (
                        <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 text-xs space-y-1.5">
                          {userReview ? (
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1 text-amber-600 font-semibold">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      className={`h-3 w-3 ${
                                        i < userReview.rating
                                          ? 'fill-amber-500 text-amber-500'
                                          : 'text-neutral-300'
                                      }`}
                                    />
                                  ))}
                                  <span className="text-neutral-700 ml-1 font-mono text-[11px]">
                                    ({userReview.rating}/5)
                                  </span>
                                </div>
                                {userReview.comment && (
                                  <p className="mt-1 text-neutral-600 text-[11px] italic line-clamp-2">
                                    &ldquo;{userReview.comment}&rdquo;
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => handleOpenReviewModal(ev.id, ev.title)}
                                className="text-[11px] font-semibold text-[#A4161A] hover:underline cursor-pointer shrink-0"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-neutral-600 text-[11px]">
                                Submit event feedback
                              </span>
                              <button
                                onClick={() => handleOpenReviewModal(ev.id, ev.title)}
                                className="inline-flex items-center gap-1 rounded bg-[#A4161A] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer shrink-0"
                              >
                                <Star className="h-3 w-3 fill-white" />
                                Review
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-2">
                      {!isWaitlisted ? (
                        <button
                          onClick={() => setSelectedTicketId(reg.id)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded bg-[#A4161A] py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          View Pass
                        </button>
                      ) : (
                        <div className="text-xs text-neutral-500 font-medium">
                          Pass locked on waitlist
                        </div>
                      )}

                      {!hasStarted && !isCheckedIn && (
                        <button
                          onClick={() => handleCancelRegistration(reg.id, ev.title, isWaitlisted)}
                          disabled={cancellingId === reg.id}
                          className="rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-red-50 transition-colors cursor-pointer"
                          title={isWaitlisted ? 'Leave Waitlist' : 'Cancel Registration'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 2. VOLUNTEER ROLES VIEW */}
      {activeViewTab === 'volunteering' && (
        <div>
          {volunteerRoles.length === 0 ? (
            <div className="rounded-md border border-neutral-200 bg-white p-12 text-center shadow-xs">
              <HandHelping className="mx-auto h-10 w-10 text-neutral-300" />
              <h3 className="mt-3 text-base font-semibold text-neutral-900">
                No volunteer applications
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Apply for volunteer openings on upcoming campus events.
              </p>
              <Link
                href="/events"
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#A4161A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
              >
                <Compass className="h-3.5 w-3.5" /> Find Opportunities
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {volunteerRoles.map((vol) => {
                const ev = vol.events;
                if (!ev) return null;

                const { dateStr, startTimeStr, endTimeStr } = formatEventDate(ev.start_time, ev.end_time);
                const isAccepted = vol.status === 'accepted';

                return (
                  <div
                    key={vol.id}
                    className="flex flex-col justify-between overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs"
                  >
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {isAccepted ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                                <CheckCircle2 className="h-3 w-3" /> Accepted
                              </span>
                            ) : vol.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] font-medium text-[#991B1B]">
                                <AlertCircle className="h-3 w-3" /> Not selected
                              </span>
                            ) : vol.status === 'withdrawn' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                                Withdrawn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                <Clock className="h-3 w-3" /> Applied (pending)
                              </span>
                            )}
                          </div>

                          <h3 className="text-base font-bold text-neutral-900 pt-0.5">
                            {ev.title}
                          </h3>
                          <p className="text-xs text-neutral-500">
                            Coordinator: {ev.organizer_email}
                          </p>
                        </div>

                        <div className="flex h-8 w-8 items-center justify-center rounded bg-neutral-100 text-[#A4161A] shrink-0">
                          <HandHelping className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-neutral-100 text-xs text-neutral-600">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-[#A4161A] shrink-0" />
                          <span>{ev.halls?.name || 'Campus Venue'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>{dateStr} • {startTimeStr} – {endTimeStr}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-neutral-50 border-t border-neutral-200">
                      {isAccepted ? (
                        <div className="space-y-1">
                          <Link
                            href={`/organizer/scan/${vol.event_id}`}
                            className="flex items-center justify-center gap-2 rounded bg-emerald-700 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors shadow-xs"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            Scan attendance
                          </Link>
                          {(() => {
                            const nowTime = Date.now();
                            const evStartMs = ev.start_time ? new Date(ev.start_time).getTime() : 0;
                            const evEndMs = ev.end_time ? new Date(ev.end_time).getTime() : 0;
                            const isScanWindow = evStartMs > 0 && evEndMs > 0 && (nowTime >= evStartMs - 30 * 60 * 1000 && nowTime <= evEndMs + 30 * 60 * 1000);
                            return !isScanWindow ? (
                              <p className="text-[10px] text-neutral-500 text-center italic">
                                Scanning opens 30 min before the event starts and closes 30 min after it ends
                              </p>
                            ) : null;
                          })()}
                        </div>
                      ) : (
                        <div className="text-xs text-center text-neutral-500">
                          {vol.status === 'rejected'
                            ? 'Application not selected.'
                            : vol.status === 'withdrawn'
                            ? 'Application withdrawn.'
                            : 'Pending organizer review.'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LEAVE A REVIEW MODAL */}
      {reviewingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-md bg-white p-6 shadow-lg border border-neutral-200 space-y-4">
            <button
              onClick={() => setReviewingEvent(null)}
              className="absolute top-4 right-4 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div>
              <h2 className="text-lg font-bold text-neutral-900">
                Event Feedback: {reviewingEvent.title}
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Feedback is anonymous to organizers.
              </p>
            </div>

            {reviewError && (
              <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-[#991B1B] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                  Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50 cursor-pointer"
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
                  <span className="font-semibold text-xs text-neutral-800 ml-1">
                    {reviewRating} of 5
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-800 mb-1">
                  Comments (Optional)
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share feedback on session structure, content, and logistics..."
                  rows={3}
                  className="w-full rounded border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-[#A4161A] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setReviewingEvent(null)}
                  className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="inline-flex items-center gap-1.5 rounded bg-[#A4161A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submittingReview ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Feedback'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL SCREEN HIGH-CONTRAST QR PASS MODAL (Rendered via Portal to avoid unmounting/flicker) */}
      {mounted &&
        selectedTicket &&
        selectedTicket.events &&
        selectedTicket.status === 'confirmed' &&
        createPortal(
          <div
            key={selectedTicket.id}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          >
            <div className="relative w-full max-w-sm rounded-md bg-white p-6 text-neutral-900 shadow-xl border border-neutral-200 space-y-4">
              <button
                onClick={() => setSelectedTicketId(null)}
                className="absolute top-4 right-4 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Header & Student Roll / Name */}
              <div className="text-center space-y-1 pt-1">
                <div className="inline-block rounded bg-[#A4161A] px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
                  Digital Event Pass
                </div>

                <h2 className="text-lg font-bold text-neutral-900 leading-snug pt-1">
                  {selectedTicket.events.title}
                </h2>

                <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-2 text-xs">
                  <div className="font-bold text-sm text-neutral-900">
                    {profile?.name || selectedTicket.student_email}
                  </div>
                  <div className="font-mono text-xs font-semibold text-[#A4161A] mt-0.5">
                    Roll No: {selectedTicket.roll_no || profile?.roll_no || 'N/A'}
                  </div>
                </div>
              </div>

              {/* HIGH-CONTRAST MEMOIZED QR CODE */}
              <div className="flex flex-col items-center justify-center rounded border border-neutral-300 bg-white p-4">
                <div className="p-2 bg-white">
                  <MemoizedQRCode token={selectedTicket.qr_token} />
                </div>

                <span className="mt-2 font-mono text-[10px] text-neutral-500 select-all">
                  TOKEN: {selectedTicket.qr_token}
                </span>
              </div>

              {/* Venue and Timing */}
              <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 space-y-1 text-xs text-neutral-700">
                <div className="flex items-center justify-between font-medium">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                    {selectedTicket.events.halls?.name || 'Campus Venue'}
                  </span>
                  {selectedTicket.checked_in_at ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Checked In
                    </span>
                  ) : (
                    <span className="text-[#A4161A] font-medium">Ready for scan</span>
                  )}
                </div>

                <div className="text-[11px] text-neutral-500 font-mono">
                  {new Date(selectedTicket.events.start_time).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })} • {new Date(selectedTicket.events.start_time).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </div>
              </div>

              <p className="text-center text-[11px] text-neutral-500">
                Present this code at the hall entrance for check-in verification.
              </p>

              <button
                onClick={() => setSelectedTicketId(null)}
                className="w-full rounded bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
