'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, AllowedUser, Fest } from '@/lib/types';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  MapPin,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  FileCheck2,
  RefreshCw,
  Building2,
  Plus,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

export default function AffairsPage() {
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [submittedEvents, setSubmittedEvents] = useState<CampusEvent[]>([]);
  const [recentApproved, setRecentApproved] = useState<CampusEvent[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [fests, setFests] = useState<Fest[]>([]);
  const [loading, setLoading] = useState(true);

  // Active section tab: Queue vs Fests
  const [activeSection, setActiveSection] = useState<'queue' | 'fests'>('queue');

  // Reject Dialog state
  const [rejectingEvent, setRejectingEvent] = useState<CampusEvent | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  // Create Fest Form State
  const [newFestName, setNewFestName] = useState('');
  const [newFestStart, setNewFestStart] = useState('');
  const [newFestEnd, setNewFestEnd] = useState('');
  const [newFestActive, setNewFestActive] = useState(false);
  const [creatingFest, setCreatingFest] = useState(false);
  const [festError, setFestError] = useState<string | null>(null);
  const [festSuccess, setFestSuccess] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [profileRes, eventsRes, hallsRes, festsRes] = await Promise.all([
        supabase.from('allowed_users').select('*').eq('email', user.email).maybeSingle(),
        supabase
          .from('events')
          .select('*, halls(id, name, capacity, location), fests(id, name, is_active)')
          .in('status', ['submitted', 'approved', 'rejected'])
          .order('created_at', { ascending: false }),
        supabase.from('halls').select('*').order('name', { ascending: true }),
        supabase.from('fests').select('*').order('created_at', { ascending: false }),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
      }

      if (eventsRes.data) {
        const all = eventsRes.data as CampusEvent[];
        setSubmittedEvents(all.filter((e) => e.status === 'submitted'));
        setRecentApproved(all.filter((e) => e.status === 'approved').slice(0, 10));
      }

      if (hallsRes.data) {
        setHalls(hallsRes.data);
      }

      if (festsRes.data) {
        setFests(festsRes.data);
      }
    } catch (err) {
      console.error('Error loading affairs queue:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (event: CampusEvent) => {
    setProcessingId(event.id);
    setActionError(null);

    try {
      const { error } = await supabase
        .from('events')
        .update({
          status: 'approved',
          rejection_reason: null,
        })
        .eq('id', event.id);

      if (error) {
        let customMsg = error.message;
        if (
          error.message.includes('events_hall_time_no_overlap') ||
          error.message.includes('exclusion') ||
          error.code === '23P01'
        ) {
          customMsg = 'This hall is already booked for that time by another approved event.';
        }
        setActionError({ id: event.id, message: customMsg });
        return;
      }

      await loadData();
    } catch (err: unknown) {
      console.error('Approval failed:', err);
      let msg = err instanceof Error ? err.message : 'Failed to approve event.';
      if (msg.includes('events_hall_time_no_overlap') || msg.includes('exclusion')) {
        msg = 'This hall is already booked for that time by another approved event.';
      }
      setActionError({ id: event.id, message: msg });
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenRejectDialog = (event: CampusEvent) => {
    setRejectingEvent(event);
    setRejectionReason('');
    setActionError(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectingEvent) return;

    if (!rejectionReason.trim()) {
      alert('Please provide a specific reason for rejection to help the organizer adjust their proposal.');
      return;
    }

    setProcessingId(rejectingEvent.id);

    try {
      const { error } = await supabase
        .from('events')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
        })
        .eq('id', rejectingEvent.id);

      if (error) {
        throw error;
      }

      setRejectingEvent(null);
      setRejectionReason('');
      await loadData();
    } catch (err: unknown) {
      console.error('Rejection failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to reject event.');
    } finally {
      setProcessingId(null);
    }
  };

  // Toggle Fest Active / Inactive
  const handleToggleFest = async (fest: Fest) => {
    const nextState = !fest.is_active;

    // Optimistic UI update
    setFests((prev) =>
      prev.map((f) => (f.id === fest.id ? { ...f, is_active: nextState } : f))
    );

    try {
      const { error } = await supabase
        .from('fests')
        .update({ is_active: nextState })
        .eq('id', fest.id);

      if (error) throw error;
    } catch (err: unknown) {
      console.error('Failed to toggle fest status:', err);
      // Revert on failure
      setFests((prev) =>
        prev.map((f) => (f.id === fest.id ? { ...f, is_active: fest.is_active } : f))
      );
      alert(err instanceof Error ? err.message : 'Failed to update fest status.');
    }
  };

  // Create New Fest
  const handleCreateFest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFestError(null);
    setFestSuccess(null);

    if (!newFestName.trim()) {
      setFestError('Fest name is required.');
      return;
    }

    setCreatingFest(true);

    try {
      const payload = {
        name: newFestName.trim(),
        is_active: newFestActive,
        start_date: newFestStart || null,
        end_date: newFestEnd || null,
      };

      const { data, error } = await supabase.from('fests').insert(payload).select().single();

      if (error) throw error;

      if (data) {
        setFests((prev) => [data, ...prev]);
        setFestSuccess(`Fest "${data.name}" successfully created.`);
        setNewFestName('');
        setNewFestStart('');
        setNewFestEnd('');
        setNewFestActive(false);
      }
    } catch (err: unknown) {
      console.error('Failed to create fest:', err);
      setFestError(err instanceof Error ? err.message : 'Failed to create fest.');
    } finally {
      setCreatingFest(false);
    }
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  };

  const activeFestsCount = fests.filter((f) => f.is_active).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header Banner */}
      <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-gradient-to-br from-[#FFFAF5] via-white to-[#FFFAF5]/50 p-6 sm:p-8 shadow-xs relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B3202A] via-[#C9A24B] to-[#B3202A]" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A24B]/40 bg-[#FFFAF5] px-3 py-1 text-xs font-semibold text-[#8E1A22]">
              <Shield className="h-3.5 w-3.5 text-[#C9A24B]" />
              Role: STUDENT WELFARE (AFFAIRS)
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2B1B17]">
              Student Welfare Portal
            </h1>
            <p className="text-sm text-[#7A6A62]">
              Logged in as <span className="font-mono font-medium text-[#2B1B17]">{profile?.email || 'affairs@demo.edu'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-[#EADFD6] bg-white p-3 shadow-xs text-xs min-w-[140px]">
              <div className="text-[#7A6A62] font-medium">Pending Queue</div>
              <div className="font-serif text-xl font-bold text-[#B3202A] mt-0.5">
                {submittedEvents.length} Proposals
              </div>
            </div>

            <div className="rounded-xl border border-[#C9A24B]/30 bg-white p-3 shadow-xs text-xs min-w-[140px]">
              <div className="text-[#7A6A62] font-medium">Active Fests</div>
              <div className="font-serif text-xl font-bold text-[#C9A24B] mt-0.5">
                {activeFestsCount} / {fests.length}
              </div>
            </div>

            <button
              onClick={loadData}
              className="rounded-xl border border-[#EADFD6] bg-white p-2.5 text-[#7A6A62] shadow-xs hover:bg-[#FFFAF5] hover:text-[#2B1B17] transition-colors cursor-pointer"
              title="Refresh portal"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="mt-6 flex items-center gap-3 pt-4 border-t border-[#EADFD6]">
          <button
            onClick={() => setActiveSection('queue')}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeSection === 'queue'
                ? 'bg-[#B3202A] text-white shadow-xs'
                : 'bg-white text-[#7A6A62] border border-[#EADFD6] hover:bg-[#FFFAF5] hover:text-[#2B1B17]'
            }`}
          >
            <FileCheck2 className="h-4 w-4" />
            Approval Queue ({submittedEvents.length})
          </button>

          <button
            onClick={() => setActiveSection('fests')}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeSection === 'fests'
                ? 'bg-[#B3202A] text-white shadow-xs'
                : 'bg-white text-[#7A6A62] border border-[#EADFD6] hover:bg-[#FFFAF5] hover:text-[#2B1B17]'
            }`}
          >
            <Sparkles className="h-4 w-4 text-[#C9A24B]" />
            Manage Fests ({fests.length})
          </button>
        </div>
      </div>

      {/* SECTION 1: PROPOSALS APPROVAL QUEUE */}
      {activeSection === 'queue' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-[#EADFD6] pb-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-[#B3202A]" />
              <h2 className="font-serif text-lg font-bold text-[#2B1B17]">
                Pending Event Proposals ({submittedEvents.length})
              </h2>
            </div>
            <span className="text-xs text-[#7A6A62]">First approved proposal secures venue slot</span>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-44 w-full animate-pulse rounded-2xl bg-[#EADFD6]/50"
                />
              ))}
            </div>
          ) : submittedEvents.length === 0 ? (
            <div className="rounded-2xl border border-[#EADFD6] bg-white p-12 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h3 className="mt-3 font-serif text-lg font-bold text-[#2B1B17]">
                All Caught Up!
              </h3>
              <p className="mt-1 text-sm text-[#7A6A62]">
                There are no event proposals awaiting Student Welfare review right now.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {submittedEvents.map((event) => {
                const startFmt = formatDateTime(event.start_time);
                const endFmt = formatDateTime(event.end_time);
                const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
                const festObj = fests.find((f) => f.id === event.fest_id) || event.fests;
                const hasError = actionError?.id === event.id;

                return (
                  <div
                    key={event.id}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-xs transition-all ${
                      hasError
                        ? 'border-red-400 ring-2 ring-red-200'
                        : 'border-[#EADFD6] hover:border-[#C9A24B]/60'
                    }`}
                  >
                    <div className="p-6 space-y-5">
                      {/* Clash Error Banner if approval failed */}
                      {hasError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-3 animate-in fade-in">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-[#8E1A22] mt-0.5" />
                          <div>
                            <p className="font-bold text-sm">Approval Blocked by Postgres Exclusion Constraint</p>
                            <p className="mt-0.5">{actionError.message}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                        {/* Left: Poster + Full Details */}
                        <div className="flex flex-col sm:flex-row items-start gap-5 flex-1">
                          {event.poster_url ? (
                            <div className="h-32 w-32 sm:h-36 sm:w-36 rounded-2xl overflow-hidden border border-[#EADFD6] shrink-0 bg-[#FFFAF5] shadow-xs">
                              <img
                                src={event.poster_url}
                                alt={event.title}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-32 w-32 sm:h-36 sm:w-36 shrink-0 items-center justify-center rounded-2xl bg-[#FFFAF5] text-[#7A6A62] border border-[#EADFD6]">
                              <Building2 className="h-10 w-10 text-[#B3202A]/60" />
                            </div>
                          )}

                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                                <Clock className="h-3.5 w-3.5 text-amber-700" /> Submitted for Review
                              </span>

                              {festObj && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-[#FFFAF5] px-2.5 py-0.5 text-xs font-semibold text-[#8E1A22] border border-[#C9A24B]/40">
                                  <Sparkles className="h-3 w-3 text-[#C9A24B]" /> Fest: {festObj.name}
                                </span>
                              )}

                              <span className="text-xs font-semibold text-[#7A6A62]">
                                Organizer: <span className="text-[#2B1B17]">{event.club_or_dept || 'Official Body'}</span> ({event.organizer_email})
                              </span>
                            </div>

                            <h3 className="font-serif text-xl font-bold text-[#2B1B17]">
                              {event.title}
                            </h3>

                            {event.description && (
                              <p className="text-xs leading-relaxed text-[#7A6A62]">
                                {event.description}
                              </p>
                            )}

                            {/* Metadata Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-[#2B1B17]">
                                <MapPin className="h-4 w-4 text-[#B3202A]" />
                                <span>{hall?.name || 'Hall Venue'}</span>
                                <span className="text-[#7A6A62] font-normal">
                                  ({hall?.capacity} seats, {hall?.location})
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 font-mono text-[#7A6A62]">
                                <Calendar className="h-4 w-4 text-[#C9A24B]" />
                                <span>{startFmt.date}</span>
                                <span className="font-semibold text-[#2B1B17]">{startFmt.time} – {endFmt.time}</span>
                              </div>
                            </div>

                            {event.registration_link && (
                              <div className="pt-1">
                                <a
                                  href={event.registration_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-[#B3202A] hover:underline font-medium"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" /> View Registration URL
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Decision Actions */}
                        <div className="flex flex-row lg:flex-col items-center gap-3 shrink-0 self-stretch lg:self-start border-t lg:border-t-0 lg:border-l border-[#EADFD6] lg:pl-6 pt-4 lg:pt-0">
                          <button
                            onClick={() => handleApprove(event)}
                            disabled={processingId === event.id}
                            className="flex-1 lg:w-36 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {processingId === event.id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4" /> Approve Event
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleOpenRejectDialog(event)}
                            disabled={processingId === event.id}
                            className="flex-1 lg:w-36 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-900 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <XCircle className="h-4 w-4 text-[#8E1A22]" /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Approved Section */}
          {recentApproved.length > 0 && (
            <div className="space-y-4 pt-6">
              <div className="flex items-center gap-2 border-b border-[#EADFD6] pb-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                <h2 className="font-serif text-lg font-bold text-[#2B1B17]">
                  Recently Approved Events ({recentApproved.length})
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentApproved.map((event) => {
                  const startFmt = formatDateTime(event.start_time);
                  const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
                  const festObj = fests.find((f) => f.id === event.fest_id) || event.fests;

                  return (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs space-y-2 hover:border-[#C9A24B]/50 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                        <span className="text-[#7A6A62] font-mono text-[11px]">{startFmt.date}</span>
                      </div>
                      <h4 className="font-serif font-bold text-sm text-[#2B1B17] truncate">
                        {event.title}
                      </h4>
                      <div className="text-xs text-[#7A6A62] truncate flex items-center gap-2">
                        <span>{hall?.name}</span>
                        {festObj && (
                          <span className="text-[#8E1A22] font-semibold">
                            • {festObj.name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: FESTS MANAGEMENT */}
      {activeSection === 'fests' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Create New Fest Form Card */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-[#EADFD6] bg-white p-6 shadow-xs space-y-4 sticky top-24">
                <div className="flex items-center gap-2 border-b border-[#EADFD6] pb-3">
                  <Plus className="h-5 w-5 text-[#B3202A]" />
                  <h3 className="font-serif font-bold text-base text-[#2B1B17]">
                    Create New Fest
                  </h3>
                </div>

                {festError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                    {festError}
                  </div>
                )}

                {festSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    {festSuccess}
                  </div>
                )}

                <form onSubmit={handleCreateFest} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold uppercase tracking-wider text-[#2B1B17] mb-1">
                      Fest Name <span className="text-[#B3202A]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newFestName}
                      onChange={(e) => setNewFestName(e.target.value)}
                      placeholder="e.g., TechTatva, Milan, Utkrisht"
                      className="w-full rounded-xl border border-[#EADFD6] bg-white px-3 py-2 text-sm text-[#2B1B17] placeholder:text-[#7A6A62]/60 focus:border-[#B3202A] focus:outline-none focus:ring-1 focus:ring-[#B3202A]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold uppercase tracking-wider text-[#2B1B17] mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={newFestStart}
                        onChange={(e) => setNewFestStart(e.target.value)}
                        className="w-full rounded-xl border border-[#EADFD6] bg-white px-2.5 py-1.5 text-xs text-[#2B1B17] focus:border-[#B3202A] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold uppercase tracking-wider text-[#2B1B17] mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={newFestEnd}
                        onChange={(e) => setNewFestEnd(e.target.value)}
                        className="w-full rounded-xl border border-[#EADFD6] bg-white px-2.5 py-1.5 text-xs text-[#2B1B17] focus:border-[#B3202A] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-[#EADFD6] bg-[#FFFAF5]">
                    <div>
                      <div className="font-bold text-[#2B1B17]">Activate Immediately</div>
                      <div className="text-[11px] text-[#7A6A62]">Enable event submissions for this fest</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewFestActive(!newFestActive)}
                      className="text-[#B3202A] cursor-pointer"
                    >
                      {newFestActive ? (
                        <ToggleRight className="h-7 w-7 text-[#B3202A]" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-[#7A6A62]" />
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingFest}
                    className="w-full rounded-xl bg-[#B3202A] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {creatingFest ? 'Creating...' : 'Create Fest'}
                  </button>
                </form>
              </div>
            </div>

            {/* Fests List with On/Off Switch */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between border-b border-[#EADFD6] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#C9A24B]" />
                  <h3 className="font-serif font-bold text-base text-[#2B1B17]">
                    Campus Fests Directory ({fests.length})
                  </h3>
                </div>
                <span className="text-xs text-[#7A6A62]">Toggle to activate / deactivate</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fests.map((fest) => {
                  return (
                    <div
                      key={fest.id}
                      className={`rounded-2xl border p-5 transition-all shadow-xs ${
                        fest.is_active
                          ? 'border-[#C9A24B]/60 bg-[#FFFAF5]'
                          : 'border-[#EADFD6] bg-white opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-serif font-bold text-base text-[#2B1B17]">
                              {fest.name}
                            </h4>
                            {fest.is_active ? (
                              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                                Active
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#FFFAF5] border border-[#EADFD6] px-2 py-0.5 text-[10px] font-bold text-[#7A6A62] uppercase tracking-wider">
                                Inactive
                              </span>
                            )}
                          </div>

                          {(fest.start_date || fest.end_date) && (
                            <div className="text-xs text-[#7A6A62] font-mono">
                              {fest.start_date || 'TBD'} &rarr; {fest.end_date || 'TBD'}
                            </div>
                          )}
                        </div>

                        {/* On/Off Toggle Button */}
                        <button
                          onClick={() => handleToggleFest(fest)}
                          className="flex items-center gap-1 text-xs font-semibold cursor-pointer transition-transform hover:scale-105"
                          title={fest.is_active ? 'Deactivate Fest' : 'Activate Fest'}
                        >
                          {fest.is_active ? (
                            <ToggleRight className="h-8 w-8 text-[#B3202A]" />
                          ) : (
                            <ToggleLeft className="h-8 w-8 text-[#7A6A62]" />
                          )}
                        </button>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#EADFD6] text-[11px] text-[#7A6A62] flex items-center justify-between">
                        <span>
                          {fest.is_active
                            ? 'Organizers can tag new proposals'
                            : 'Hidden from new proposals'}
                        </span>
                        <span className="font-mono">
                          {new Date(fest.created_at || '').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal Dialog */}
      {rejectingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#EADFD6] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#8E1A22]">
              <XCircle className="h-6 w-6 text-[#B3202A]" />
              <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                Reject Event Proposal
              </h3>
            </div>

            <p className="text-xs text-[#7A6A62]">
              Rejecting &ldquo;<span className="font-semibold text-[#2B1B17]">{rejectingEvent.title}</span>&rdquo;.
              Please state why this proposal cannot be approved so the organizer can revise it.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#2B1B17] mb-1.5">
                Rejection Reason (Required) <span className="text-[#B3202A]">*</span>
              </label>
              <textarea
                rows={4}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Requested venue is undergoing sound equipment maintenance on this date. Please reschedule or select Sudhamani Hall."
                className="w-full rounded-xl border border-[#EADFD6] bg-white p-3 text-sm text-[#2B1B17] placeholder:text-[#7A6A62]/60 focus:border-[#B3202A] focus:outline-none focus:ring-1 focus:ring-[#B3202A]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingEvent(null)}
                className="rounded-xl border border-[#EADFD6] bg-white px-4 py-2 text-xs font-semibold text-[#2B1B17] hover:bg-[#FFFAF5] cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!rejectionReason.trim() || processingId === rejectingEvent.id}
                onClick={handleConfirmReject}
                className="rounded-xl bg-[#B3202A] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#8E1A22] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {processingId === rejectingEvent.id ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
