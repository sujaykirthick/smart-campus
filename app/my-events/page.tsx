'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Sparkles,
  ShieldCheck,
  X,
  Compass,
  Hourglass,
  HandHelping,
  Camera,
  Layers,
  Star,
  MessageSquarePlus,
  Loader2,
} from 'lucide-react';

interface WaitlistRankMap {
  [registrationId: string]: number; // 1-indexed position
}

export default function MyEventsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [volunteerRoles, setVolunteerRoles] = useState<Volunteer[]>([]);
  const [waitlistRanks, setWaitlistRanks] = useState<WaitlistRankMap>({});
  const [userReviews, setUserReviews] = useState<Record<string, Review>>({});
  const [loading, setLoading] = useState(true);
  const [activeViewTab, setActiveViewTab] = useState<'passes' | 'volunteering'>('passes');
  const [selectedTicket, setSelectedTicket] = useState<Registration | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const loadData = useCallback(async () => {
    setLoading(true);
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
              halls (
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
              halls (
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
      const loadedRegs = (regsRes.data as unknown as Registration[]) || [];
      setRegistrations(loadedRegs);

      if (volsRes.data) {
        setVolunteerRoles(volsRes.data as unknown as Volunteer[]);
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

      // If a ticket was currently opened in modal, refresh its data
      if (selectedTicket) {
        const updated = loadedRegs.find((r) => r.id === selectedTicket.id);
        if (updated && updated.status === 'confirmed') {
          setSelectedTicket(updated);
        } else {
          setSelectedTicket(null);
        }
      }
    } catch (err: any) {
      console.error('Error fetching registrations:', err);
      setErrorMsg(err?.message || 'Failed to load your registrations.');
    } finally {
      setLoading(false);
    }
  }, [supabase, router, selectedTicket]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancelRegistration = async (regId: string, eventTitle: string, isWaitlist: boolean) => {
    const actionLabel = isWaitlist ? 'leave the waitlist for' : 'cancel your confirmed pass for';
    if (!confirm(`Are you sure you want to ${actionLabel} "${eventTitle}"?`)) return;

    setCancellingId(regId);
    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', regId);

      if (error) throw error;

      if (selectedTicket?.id === regId) {
        setSelectedTicket(null);
      }
      loadData();
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
        // Update existing review
        const { error } = await supabase
          .from('reviews')
          .update({
            rating: reviewRating,
            comment: reviewComment.trim() || null,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new review
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
      setReviewError(err?.message || 'Failed to submit review. You must have checked in to review ended events.');
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header Banner */}
      <div className="overflow-hidden rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A24B]/30 bg-[#FDF8ED] px-3.5 py-1 text-xs font-bold text-[#A07C28]">
              <QrCode className="h-3.5 w-3.5" />
              Student Digital Wallet &amp; Volunteering
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2B1B17]">
              My Passes &amp; Activity
            </h1>
            <p className="text-xs sm:text-sm text-[#7A6A62]">
              Digital event passes, real-time waitlist standings, post-event feedback, and volunteer scanner roles
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/events"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-4 py-2.5 text-xs font-bold text-[#2B1B17] shadow-xs hover:border-[#B3202A] hover:text-[#B3202A] hover:bg-[#FFFFFF] transition-colors"
            >
              <Compass className="h-4 w-4" /> Browse Events
            </Link>

            <button
              onClick={loadData}
              className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-2.5 text-[#7A6A62] shadow-xs hover:border-[#B3202A] hover:text-[#B3202A] hover:bg-[#FFFFFF] transition-colors cursor-pointer"
              title="Refresh tickets"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* User identification badge bar */}
        {profile && (
          <div className="mt-6 pt-4 border-t border-[#EADFD6] flex flex-wrap items-center gap-6 text-xs text-[#7A6A62]">
            <div>
              <span className="text-[#A3938B] font-medium">Student Name: </span>
              <span className="font-bold text-[#2B1B17]">{profile.name || profile.email}</span>
            </div>
            {profile.roll_no && (
              <div>
                <span className="text-[#A3938B] font-medium">Roll Number: </span>
                <span className="font-mono font-bold text-[#B3202A]">{profile.roll_no}</span>
              </div>
            )}
            <div>
              <span className="text-[#A3938B] font-medium">Email: </span>
              <span className="font-mono text-[#2B1B17]">{profile.email}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Switcher: Event Passes vs Volunteer Roles (Pill Tabs) */}
      <div className="flex items-center gap-2 border-b border-[#EADFD6] pb-2">
        <button
          onClick={() => setActiveViewTab('passes')}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeViewTab === 'passes'
              ? 'bg-[#B3202A] text-white shadow-xs'
              : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#7A6A62] hover:text-[#2B1B17] hover:border-[#B3202A]'
          }`}
        >
          <QrCode className="h-3.5 w-3.5" />
          Event Passes ({registrations.length})
        </button>

        <button
          onClick={() => setActiveViewTab('volunteering')}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeViewTab === 'volunteering'
              ? 'bg-[#B3202A] text-white shadow-xs'
              : 'bg-[#FFFFFF] border border-[#EADFD6] text-[#7A6A62] hover:text-[#2B1B17] hover:border-[#B3202A]'
          }`}
        >
          <HandHelping className="h-3.5 w-3.5" />
          Volunteer Roles ({volunteerRoles.length})
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2] p-4 text-xs text-[#7F1D1D] flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-[#7F1D1D] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. PASSES VIEW */}
      {activeViewTab === 'passes' && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 w-full animate-pulse rounded-2xl bg-[#EADFD6]/40" />
              ))}
            </div>
          ) : registrations.length === 0 ? (
            <div className="rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] p-12 text-center shadow-xs">
              <QrCode className="mx-auto h-12 w-12 text-[#D5C5B8]" />
              <h3 className="mt-3 font-serif text-lg font-bold text-[#2B1B17]">
                No registered events yet
              </h3>
              <p className="mt-1 text-xs text-[#7A6A62]">
                Browse the campus feed and register for exciting events to get your digital QR passes.
              </p>
              <Link
                href="/events"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#B3202A] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#8E1A22] transition-colors"
              >
                <Compass className="h-4 w-4" /> Explore Events
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#EADFD6] bg-[#FFFFFF] shadow-xs transition-all hover:shadow-md hover:border-[#B3202A]/40"
                  >
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isWaitlisted ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-2.5 py-0.5 text-[10px] font-bold text-[#B45309]">
                                <Hourglass className="h-3 w-3" /> #{waitlistRank} on waitlist
                              </span>
                            ) : isCheckedIn ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] border border-[#BBF7D0] px-2.5 py-0.5 text-[10px] font-bold text-[#15803D]">
                                <CheckCircle2 className="h-3 w-3" /> Checked In
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF8ED] border border-[#C9A24B]/40 px-2.5 py-0.5 text-[10px] font-bold text-[#A07C28]">
                                <ShieldCheck className="h-3 w-3" /> Confirmed Pass
                              </span>
                            )}

                            {ev.fests && (
                              <span className="rounded-md bg-[#C9A24B] px-2 py-0.5 text-[10px] font-bold text-[#2B1B17]">
                                {ev.fests.name}
                              </span>
                            )}

                            {hasEnded && (
                              <span className="rounded-md bg-[#FAF5F0] border border-[#EADFD6] px-2 py-0.5 text-[10px] font-bold text-[#7A6A62]">
                                Ended
                              </span>
                            )}
                          </div>

                          <h3 className="font-serif text-lg font-bold text-[#2B1B17] pt-1">
                            {ev.title}
                          </h3>
                          <p className="text-xs text-[#7A6A62] font-semibold">
                            Organized by {ev.club_or_dept || 'Campus'}
                          </p>
                        </div>

                        {/* QR Thumbnail (Only for Confirmed passes before event ends) */}
                        {!isWaitlisted && (
                          <button
                            onClick={() => setSelectedTicket(reg)}
                            className="p-2 rounded-xl bg-white border border-[#EADFD6] hover:border-[#B3202A] shadow-xs cursor-pointer shrink-0 transition-transform hover:scale-105"
                            title="Click to view QR code"
                          >
                            <QRCodeSVG value={reg.qr_token} size={64} level="M" />
                          </button>
                        )}
                      </div>

                      {/* Waitlist Status Notice */}
                      {isWaitlisted && (
                        <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7] p-3 text-xs text-[#B45309] space-y-1">
                          <div className="font-bold flex items-center gap-1.5">
                            <Hourglass className="h-3.5 w-3.5 text-[#B45309]" />
                            Waitlist Standing: Position #{waitlistRank}
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            You will be automatically promoted to confirmed if another attendee cancels before the event. Your QR pass will be unlocked upon promotion.
                          </p>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="space-y-1.5 pt-2 border-t border-[#EADFD6] text-xs text-[#7A6A62]">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-[#B3202A] shrink-0" />
                          <span>{ev.halls?.name || 'Campus Venue'}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <Clock className="h-3.5 w-3.5 text-[#7A6A62] shrink-0" />
                          <span>{dateStr} • {startTimeStr} – {endTimeStr}</span>
                        </div>
                      </div>

                      {isCheckedIn && (
                        <div className="rounded-lg bg-[#DCFCE7] border border-[#BBF7D0] p-2 text-[11px] text-[#15803D] flex items-center gap-1.5 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#15803D] shrink-0" />
                          <span>Attendance recorded at {new Date(reg.checked_in_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                        </div>
                      )}

                      {/* Student Review Section if event ended and student attended */}
                      {isCheckedIn && hasEnded && (
                        <div className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-3 text-xs space-y-2">
                          {userReview ? (
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1 text-[#C9A24B] font-bold">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      className={`h-3.5 w-3.5 ${
                                        i < userReview.rating
                                          ? 'fill-[#C9A24B] text-[#C9A24B]'
                                          : 'text-[#D5C5B8]'
                                      }`}
                                    />
                                  ))}
                                  <span className="text-[#2B1B17] ml-1 font-mono text-[11px]">
                                    ({userReview.rating}/5)
                                  </span>
                                </div>
                                {userReview.comment && (
                                  <p className="mt-1 text-[#7A6A62] text-[11px] italic line-clamp-2">
                                    &ldquo;{userReview.comment}&rdquo;
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => handleOpenReviewModal(ev.id, ev.title)}
                                className="text-[11px] font-bold text-[#B3202A] hover:underline cursor-pointer shrink-0"
                              >
                                Edit Review
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[#7A6A62] text-[11px]">
                                Attended this event? Share feedback!
                              </span>
                              <button
                                onClick={() => handleOpenReviewModal(ev.id, ev.title)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#B3202A] px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-[#8E1A22] transition-colors cursor-pointer shrink-0"
                              >
                                <Star className="h-3 w-3 fill-white" />
                                Leave a review
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Buttons */}
                    <div className="p-4 bg-[#FFFAF5] border-t border-[#EADFD6] flex items-center justify-between gap-3">
                      {!isWaitlisted ? (
                        <button
                          onClick={() => setSelectedTicket(reg)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#B3202A] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] transition-colors cursor-pointer"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Open QR Pass
                        </button>
                      ) : (
                        <div className="text-xs text-[#7A6A62] font-semibold italic">
                          Pass locked while on waitlist
                        </div>
                      )}

                      {/* If attended and ended, provide review action */}
                      {isCheckedIn && hasEnded && !userReview && (
                        <button
                          onClick={() => handleOpenReviewModal(ev.id, ev.title)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#B3202A] bg-white px-3 py-2 text-xs font-bold text-[#B3202A] hover:bg-[#FAF0F0] transition-colors cursor-pointer"
                        >
                          <Star className="h-3.5 w-3.5 fill-[#C9A24B] text-[#C9A24B]" />
                          Review
                        </button>
                      )}

                      {!hasStarted && !isCheckedIn && (
                        <button
                          onClick={() => handleCancelRegistration(reg.id, ev.title, isWaitlisted)}
                          disabled={cancellingId === reg.id}
                          className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-xs font-bold text-[#7F1D1D] hover:bg-[#FEE2E2] transition-colors cursor-pointer"
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
            <div className="rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] p-12 text-center shadow-xs">
              <HandHelping className="mx-auto h-12 w-12 text-[#D5C5B8]" />
              <h3 className="mt-3 font-serif text-lg font-bold text-[#2B1B17]">
                No volunteer applications yet
              </h3>
              <p className="mt-1 text-xs text-[#7A6A62]">
                Browse campus events requesting student volunteers to apply and assist event coordinators.
              </p>
              <Link
                href="/events"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#B3202A] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#8E1A22] transition-colors"
              >
                <Compass className="h-4 w-4" /> Find Volunteer Opportunities
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {volunteerRoles.map((vol) => {
                const ev = vol.events;
                if (!ev) return null;

                const { dateStr, startTimeStr, endTimeStr } = formatEventDate(ev.start_time, ev.end_time);
                const isAccepted = vol.status === 'accepted';

                return (
                  <div
                    key={vol.id}
                    className="flex flex-col justify-between overflow-hidden rounded-2xl border border-[#EADFD6] bg-[#FFFFFF] shadow-xs"
                  >
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {isAccepted ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] border border-[#BBF7D0] px-2.5 py-0.5 text-[10px] font-bold text-[#15803D]">
                                <CheckCircle2 className="h-3 w-3" /> Accepted Volunteer
                              </span>
                            ) : vol.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] border border-[#FECACA] px-2.5 py-0.5 text-[10px] font-bold text-[#7F1D1D]">
                                <AlertCircle className="h-3 w-3" /> Application Declined
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-2.5 py-0.5 text-[10px] font-bold text-[#B45309]">
                                <Clock className="h-3 w-3" /> Application Pending
                              </span>
                            )}
                          </div>

                          <h3 className="font-serif text-lg font-bold text-[#2B1B17] pt-1">
                            {ev.title}
                          </h3>
                          <p className="text-xs text-[#7A6A62] font-semibold">
                            Coordinator: {ev.organizer_email}
                          </p>
                        </div>

                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAF0F0] text-[#B3202A] shrink-0">
                          <HandHelping className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-[#EADFD6] text-xs text-[#7A6A62]">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-[#B3202A] shrink-0" />
                          <span>{ev.halls?.name || 'Campus Venue'}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <Clock className="h-3.5 w-3.5 text-[#7A6A62] shrink-0" />
                          <span>{dateStr} • {startTimeStr} – {endTimeStr}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-[#FFFAF5] border-t border-[#EADFD6]">
                      {isAccepted ? (
                        <Link
                          href={`/organizer/scan/${vol.event_id}`}
                          className="flex items-center justify-center gap-2 rounded-xl bg-[#15803D] py-2.5 text-xs font-bold text-white shadow hover:bg-[#166534] transition-colors"
                        >
                          <Camera className="h-4 w-4" />
                          Scan Attendance (Volunteer Scanner)
                        </Link>
                      ) : (
                        <div className="text-xs text-center text-[#7A6A62]">
                          {vol.status === 'rejected'
                            ? 'The organizer has filled all available volunteer slots.'
                            : 'Waiting for organizer approval.'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-3xl bg-[#FFFFFF] p-6 shadow-2xl border border-[#EADFD6] space-y-5">
            <button
              onClick={() => setReviewingEvent(null)}
              className="absolute top-4 right-4 rounded-full bg-[#FFFAF5] p-2 text-[#7A6A62] hover:bg-[#FAF0F0] hover:text-[#B3202A] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FDF8ED] border border-[#C9A24B]/30 px-3 py-1 text-xs font-bold text-[#A07C28]">
                <Star className="h-3.5 w-3.5 fill-[#C9A24B]" />
                Event Feedback
              </div>
              <h2 className="font-serif text-xl font-bold text-[#2B1B17]">
                Review {reviewingEvent.title}
              </h2>
              <p className="text-xs text-[#7A6A62]">
                Your feedback is anonymous to organizers and helps improve future campus events.
              </p>
            </div>

            {reviewError && (
              <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2] p-3 text-xs text-[#7F1D1D] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[#7F1D1D] shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitReview} className="space-y-4">
              {/* Star Rating Selector (1 to 5) */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B17] mb-2">
                  Rating (1 to 5 Stars)
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-2 rounded-xl border border-[#EADFD6] bg-[#FFFAF5] hover:bg-[#FDF8ED] transition-all cursor-pointer group"
                    >
                      <Star
                        className={`h-7 w-7 transition-transform group-hover:scale-110 ${
                          star <= reviewRating
                            ? 'fill-[#C9A24B] text-[#C9A24B]'
                            : 'text-[#D5C5B8]'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="font-bold text-sm text-[#2B1B17] ml-2">
                    {reviewRating} of 5
                  </span>
                </div>
              </div>

              {/* Optional Comment */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B17] mb-1.5">
                  Your Comments (Optional)
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="What worked well? What could be improved for next time?"
                  rows={4}
                  className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-3 text-xs text-[#2B1B17] focus:border-[#B3202A] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EADFD6]">
                <button
                  type="button"
                  onClick={() => setReviewingEvent(null)}
                  className="rounded-xl border border-[#EADFD6] bg-[#FFFFFF] px-4 py-2 text-xs font-semibold text-[#7A6A62] hover:bg-[#FFFAF5] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#B3202A] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submittingReview ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Review'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL SCREEN HIGH-CONTRAST QR PASS MODAL (Mobile First) */}
      {selectedTicket && selectedTicket.events && selectedTicket.status === 'confirmed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#FFFFFF] p-6 text-[#2B1B17] shadow-2xl border-4 border-[#2B1B17] space-y-5">
            {/* Close Button */}
            <button
              onClick={() => setSelectedTicket(null)}
              className="absolute top-4 right-4 rounded-full bg-[#FFFAF5] p-2 text-[#7A6A62] hover:bg-[#FAF0F0] hover:text-[#B3202A] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Ticket Header & Student Roll / Name */}
            <div className="text-center space-y-1.5 pt-2">
              <div className="inline-flex items-center gap-1 rounded-full bg-[#B3202A] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <ShieldCheck className="h-3.5 w-3.5 text-[#E5C378]" />
                GENESIS DIGITAL PASS
              </div>

              <h2 className="font-serif text-xl font-extrabold text-[#2B1B17] tracking-tight leading-snug pt-1">
                {selectedTicket.events.title}
              </h2>

              <div className="mt-2 rounded-xl bg-[#FFFAF5] border border-[#EADFD6] p-2.5 text-xs text-[#2B1B17] font-medium">
                <div className="font-extrabold text-sm text-[#2B1B17] tracking-wide">
                  {profile?.name || selectedTicket.student_email}
                </div>
                <div className="font-mono text-xs font-bold text-[#B3202A] mt-0.5">
                  Roll No: {selectedTicket.roll_no || profile?.roll_no || 'N/A'}
                </div>
              </div>
            </div>

            {/* BRIGHTNESS-FRIENDLY HIGH-CONTRAST QR CODE */}
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 border-2 border-[#2B1B17] shadow-inner">
              <div className="p-3 bg-white rounded-xl">
                <QRCodeSVG
                  value={selectedTicket.qr_token}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <span className="mt-2 font-mono text-[10px] text-[#7A6A62] tracking-wider select-all">
                TOKEN: {selectedTicket.qr_token}
              </span>
            </div>

            {/* Venue and Timing */}
            <div className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-3 space-y-1.5 text-xs text-[#2B1B17]">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-[#B3202A]" />
                  {selectedTicket.events.halls?.name || 'Campus Venue'}
                </span>
                {selectedTicket.checked_in_at ? (
                  <span className="text-[#15803D] font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Checked In
                  </span>
                ) : (
                  <span className="text-[#B3202A] font-bold">Ready for scan</span>
                )}
              </div>

              <div className="text-[11px] text-[#7A6A62] font-mono">
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

            {/* Check-in prompt */}
            <div className="text-center text-[11px] text-[#7A6A62]">
              Present this QR code to the event coordinator at the hall entrance.
            </div>

            <button
              onClick={() => setSelectedTicket(null)}
              className="w-full rounded-xl bg-[#2B1B17] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#B3202A] transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
