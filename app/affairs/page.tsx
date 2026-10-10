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
  ExternalLink,
  AlertTriangle,
  FileCheck2,
  RefreshCw,
  Building2,
  Plus,
  ToggleLeft,
  ToggleRight,
  Layers,
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
      alert('Please specify why this proposal cannot be approved.');
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

      if (error) throw error;

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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header Banner */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
              <Shield className="h-3.5 w-3.5 text-[#A4161A]" />
              Student Welfare (Affairs)
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Event Approval &amp; Fest Management
            </h1>
            <p className="text-xs text-neutral-500 font-mono">
              {profile?.email || 'affairs@demo.edu'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 text-xs min-w-[120px]">
              <div className="text-neutral-500">Pending Review</div>
              <div className="text-lg font-bold text-[#A4161A] mt-0.5">
                {submittedEvents.length} Proposals
              </div>
            </div>

            <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 text-xs min-w-[120px]">
              <div className="text-neutral-500">Active Fests</div>
              <div className="text-lg font-bold text-neutral-900 mt-0.5">
                {activeFestsCount} / {fests.length}
              </div>
            </div>

            <button
              onClick={loadData}
              className="rounded-md border border-neutral-300 bg-white p-2 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
              title="Refresh queue"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex items-center gap-2 border-t border-neutral-200 pt-3">
          <button
            onClick={() => setActiveSection('queue')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeSection === 'queue'
                ? 'bg-neutral-900 text-white font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            Approval Queue ({submittedEvents.length})
          </button>

          <button
            onClick={() => setActiveSection('fests')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeSection === 'fests'
                ? 'bg-neutral-900 text-white font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Manage Fests ({fests.length})
          </button>
        </div>
      </div>

      {/* SECTION 1: PROPOSALS APPROVAL QUEUE */}
      {activeSection === 'queue' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <h2 className="text-base font-bold text-neutral-900">
              Pending Event Proposals ({submittedEvents.length})
            </h2>
            <span className="text-xs text-neutral-500">First approved proposal books the venue slot</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200"
                />
              ))}
            </div>
          ) : submittedEvents.length === 0 ? (
            <div className="rounded-md border border-neutral-200 bg-white p-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <h3 className="mt-3 text-base font-semibold text-neutral-900">
                Queue Empty
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                No event proposals currently pending review.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {submittedEvents.map((event) => {
                const startFmt = formatDateTime(event.start_time);
                const endFmt = formatDateTime(event.end_time);
                const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
                const festObj = fests.find((f) => f.id === event.fest_id) || event.fests;
                const hasError = actionError?.id === event.id;

                return (
                  <div
                    key={event.id}
                    className={`overflow-hidden rounded-md border bg-white shadow-xs ${
                      hasError ? 'border-red-400' : 'border-neutral-200'
                    }`}
                  >
                    <div className="p-5 space-y-4">
                      {/* Clash Error Banner if approval failed */}
                      {hasError && (
                        <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
                          <div>
                            <p className="font-semibold">Approval Conflict</p>
                            <p className="mt-0.5">{actionError.message}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        {/* Left: Poster + Full Details */}
                        <div className="flex flex-col sm:flex-row items-start gap-4 flex-1">
                          {event.poster_url ? (
                            <div className="h-28 w-28 rounded overflow-hidden border border-neutral-200 shrink-0 bg-neutral-100">
                              <img
                                src={event.poster_url}
                                alt={event.title}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400 border border-neutral-200">
                              <Building2 className="h-8 w-8" />
                            </div>
                          )}

                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                                <Clock className="h-3 w-3 text-amber-700" /> Submitted
                              </span>

                              {festObj && (
                                <span className="inline-flex items-center rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
                                  Fest: {festObj.name}
                                </span>
                              )}

                              <span className="text-xs text-neutral-500">
                                Organizer: <span className="text-neutral-800 font-medium">{event.club_or_dept || 'Official'}</span> ({event.organizer_email})
                              </span>
                            </div>

                            <h3 className="text-lg font-bold text-neutral-900">
                              {event.title}
                            </h3>

                            {event.description && (
                              <p className="text-xs leading-relaxed text-neutral-600 line-clamp-2">
                                {event.description}
                              </p>
                            )}

                            {/* Metadata Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                              <div className="flex items-center gap-1.5 font-medium text-neutral-800">
                                <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                                <span>{hall?.name || 'Venue'}</span>
                                <span className="text-neutral-500 font-normal">
                                  ({hall?.capacity} seats, {hall?.location})
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 font-mono text-neutral-600 text-[11px]">
                                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                                <span>{startFmt.date}</span>
                                <span className="font-semibold text-neutral-800">{startFmt.time} – {endFmt.time}</span>
                              </div>
                            </div>

                            {event.registration_link && (
                              <div className="pt-0.5">
                                <a
                                  href={event.registration_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-[#A4161A] hover:underline font-medium"
                                >
                                  <ExternalLink className="h-3 w-3" /> Registration URL
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Decision Actions */}
                        <div className="flex flex-row lg:flex-col items-center gap-2 shrink-0 self-stretch lg:self-start border-t lg:border-t-0 lg:border-l border-neutral-200 lg:pl-4 pt-3 lg:pt-0">
                          <button
                            onClick={() => handleApprove(event)}
                            disabled={processingId === event.id}
                            className="flex-1 lg:w-32 rounded bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {processingId === event.id ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleOpenRejectDialog(event)}
                            disabled={processingId === event.id}
                            className="flex-1 lg:w-32 rounded border border-red-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#991B1B] hover:bg-red-50 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5 text-[#991B1B]" /> Reject
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
            <div className="space-y-3 pt-4">
              <div className="border-b border-neutral-200 pb-2">
                <h2 className="text-base font-bold text-neutral-900">
                  Recently Approved Events ({recentApproved.length})
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentApproved.map((event) => {
                  const startFmt = formatDateTime(event.start_time);
                  const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
                  const festObj = fests.find((f) => f.id === event.fest_id) || event.fests;

                  return (
                    <div
                      key={event.id}
                      className="rounded-md border border-neutral-200 bg-white p-3.5 shadow-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                        <span className="text-neutral-500 font-mono text-[11px]">{startFmt.date}</span>
                      </div>
                      <h4 className="font-bold text-sm text-neutral-900 truncate">
                        {event.title}
                      </h4>
                      <div className="text-xs text-neutral-500 truncate flex items-center gap-1.5">
                        <span>{hall?.name}</span>
                        {festObj && (
                          <span className="text-neutral-700 font-medium">
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create New Fest Form Card */}
            <div className="lg:col-span-1">
              <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-200 pb-2.5">
                  <Plus className="h-4 w-4 text-[#A4161A]" />
                  <h3 className="font-bold text-sm text-neutral-900">
                    Create New Fest
                  </h3>
                </div>

                {festError && (
                  <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-[#991B1B]">
                    {festError}
                  </div>
                )}

                {festSuccess && (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
                    {festSuccess}
                  </div>
                )}

                <form onSubmit={handleCreateFest} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-800 mb-1">
                      Fest Name <span className="text-[#A4161A]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newFestName}
                      onChange={(e) => setNewFestName(e.target.value)}
                      placeholder="e.g. Anokha 2026, Amritotsavam"
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-neutral-800 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={newFestStart}
                        onChange={(e) => setNewFestStart(e.target.value)}
                        className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 focus:border-[#A4161A] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-neutral-800 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={newFestEnd}
                        onChange={(e) => setNewFestEnd(e.target.value)}
                        className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 focus:border-[#A4161A] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded border border-neutral-200 bg-neutral-50">
                    <div>
                      <div className="font-semibold text-neutral-900">Activate Fest</div>
                      <div className="text-[11px] text-neutral-500">Allow proposals under this fest</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewFestActive(!newFestActive)}
                      className="text-[#A4161A] cursor-pointer"
                    >
                      {newFestActive ? (
                        <ToggleRight className="h-6 w-6 text-[#A4161A]" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-neutral-400" />
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingFest}
                    className="w-full rounded bg-[#A4161A] py-2 text-xs font-semibold text-white hover:bg-[#851215] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {creatingFest ? 'Creating...' : 'Create Fest'}
                  </button>
                </form>
              </div>
            </div>

            {/* Fests List with On/Off Switch */}
            <div className="lg:col-span-2 space-y-3">
              <div className="border-b border-neutral-200 pb-2">
                <h3 className="font-bold text-base text-neutral-900">
                  Campus Fests Directory ({fests.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fests.map((fest) => {
                  return (
                    <div
                      key={fest.id}
                      className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-sm text-neutral-900">
                              {fest.name}
                            </h4>
                            {fest.is_active ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                                Active
                              </span>
                            ) : (
                              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                                Inactive
                              </span>
                            )}
                          </div>

                          {(fest.start_date || fest.end_date) && (
                            <div className="text-xs text-neutral-500 font-mono">
                              {fest.start_date || 'TBD'} &rarr; {fest.end_date || 'TBD'}
                            </div>
                          )}
                        </div>

                        {/* On/Off Toggle Button */}
                        <button
                          onClick={() => handleToggleFest(fest)}
                          className="cursor-pointer"
                          title={fest.is_active ? 'Deactivate Fest' : 'Activate Fest'}
                        >
                          {fest.is_active ? (
                            <ToggleRight className="h-6 w-6 text-[#A4161A]" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-neutral-400" />
                          )}
                        </button>
                      </div>

                      <div className="mt-3 pt-2 border-t border-neutral-100 text-[11px] text-neutral-500 flex items-center justify-between">
                        <span>
                          {fest.is_active ? 'Open for proposals' : 'Hidden from proposals'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg overflow-hidden rounded-md border border-neutral-200 bg-white p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-[#991B1B]">
              <XCircle className="h-5 w-5 text-[#991B1B]" />
              <h3 className="text-base font-bold text-neutral-900">
                Reject Event Proposal
              </h3>
            </div>

            <p className="text-xs text-neutral-600">
              Rejecting &ldquo;<span className="font-semibold text-neutral-900">{rejectingEvent.title}</span>&rdquo;.
              Please state the reason for rejection to guide the organizer on necessary adjustments.
            </p>

            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1">
                Rejection Reason (Required) <span className="text-[#A4161A]">*</span>
              </label>
              <textarea
                rows={4}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Specify remarks, requested schedule/venue modifications, or policy compliance issues..."
                className="w-full rounded border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setRejectingEvent(null)}
                className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!rejectionReason.trim() || processingId === rejectingEvent.id}
                onClick={handleConfirmReject}
                className="rounded bg-[#A4161A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] disabled:opacity-50 transition-colors cursor-pointer"
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
