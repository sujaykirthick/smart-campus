'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, AllowedUser, UserRole, Volunteer } from '@/lib/types';
import EventFormModal from '@/components/EventFormModal';
import {
  Calendar,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  MapPin,
  Edit3,
  Trash2,
  Send,
  ExternalLink,
  Building2,
  RefreshCw,
  QrCode,
  FileSpreadsheet,
  Users,
  HandHelping,
  Hourglass,
  UserCheck,
  UserX,
  X,
  Loader2,
  TrendingUp,
} from 'lucide-react';

interface EventStats {
  registered: number;
  waitlisted: number;
}

export default function OrganizerPage() {
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, EventStats>>({});
  const [volunteersByEvent, setVolunteersByEvent] = useState<Record<string, Volunteer[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'rejected'>('all');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CampusEvent | null>(null);

  // Volunteers Management Modal
  const [managingVolunteersEvent, setManagingVolunteersEvent] = useState<CampusEvent | null>(null);
  const [updatingVolId, setUpdatingVolId] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [profileRes, eventsRes, hallsRes, statsRes, volsRes, usersRes] = await Promise.all([
        supabase.from('allowed_users').select('*').eq('email', user.email).maybeSingle(),
        supabase
          .from('events')
          .select('*, halls(id, name, capacity, location), fests(id, name, is_active)')
          .eq('organizer_email', user.email)
          .order('created_at', { ascending: false }),
        supabase.from('halls').select('*').order('name', { ascending: true }),
        supabase.from('event_registration_counts').select('*'),
        supabase.from('volunteers').select('*').order('applied_at', { ascending: false }),
        supabase.from('allowed_users').select('*'),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
      } else {
        setProfile({
          email: user.email,
          role: (user.user_metadata?.role as UserRole) || 'club',
          name: user.user_metadata?.name || user.email.split('@')[0],
          club_name: null,
          department: null,
          roll_no: null,
        });
      }

      if (eventsRes.data) {
        setEvents(eventsRes.data as CampusEvent[]);
      }

      if (hallsRes.data) {
        setHalls(hallsRes.data);
      }

      if (statsRes.data) {
        const statsMap: Record<string, EventStats> = {};
        statsRes.data.forEach((r: { event_id: string; registered_count: number; waitlist_count?: number }) => {
          statsMap[r.event_id] = {
            registered: Number(r.registered_count) || 0,
            waitlisted: Number(r.waitlist_count) || 0,
          };
        });
        setEventStats(statsMap);
      }

      // Map users for volunteer applicant profiles
      const usersMap = new Map<string, AllowedUser>();
      if (usersRes.data) {
        usersRes.data.forEach((u) => usersMap.set(u.email, u));
      }

      if (volsRes.data) {
        const volMap: Record<string, Volunteer[]> = {};
        volsRes.data.forEach((v: any) => {
          const u = usersMap.get(v.student_email);
          const enriched: Volunteer = {
            ...v,
            student_name: u?.name || v.student_email.split('@')[0],
            roll_no: u?.roll_no || null,
          };
          if (!volMap[v.event_id]) volMap[v.event_id] = [];
          volMap[v.event_id].push(enriched);
        });
        setVolunteersByEvent(volMap);
      }
    } catch (err) {
      console.error('Error loading organizer data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (event: CampusEvent) => {
    setEditingEvent(event);
    setModalOpen(true);
  };

  const handleDeleteDraft = async (id: string) => {
    if (!confirm('Are you sure you want to delete this draft event?')) return;
    try {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete event.');
    }
  };

  const handleDirectSubmit = async (event: CampusEvent) => {
    try {
      const { error } = await supabase
        .from('events')
        .update({
          status: 'submitted',
          ...(event.status === 'rejected' ? { rejection_reason: null } : {}),
        })
        .eq('id', event.id);

      if (error) throw error;
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to submit event.');
    }
  };

  // Update Volunteer Status (Accept / Reject)
  const handleUpdateVolunteerStatus = async (volunteerId: string, newStatus: 'accepted' | 'rejected') => {
    setUpdatingVolId(volunteerId);
    try {
      const { error } = await supabase
        .from('volunteers')
        .update({ status: newStatus })
        .eq('id', volunteerId);

      if (error) throw error;
      loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to update volunteer status.');
    } finally {
      setUpdatingVolId(null);
    }
  };

  const counts = useMemo(() => {
    return {
      all: events.length,
      draft: events.filter((e) => e.status === 'draft').length,
      submitted: events.filter((e) => e.status === 'submitted').length,
      approved: events.filter((e) => e.status === 'approved').length,
      rejected: events.filter((e) => e.status === 'rejected').length,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (activeTab === 'all') return events;
    return events.filter((e) => e.status === activeTab);
  }, [events, activeTab]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3 w-3 text-emerald-700" /> Approved
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
            <Clock className="h-3 w-3 text-amber-700" /> Submitted (In Review)
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-[#991B1B]">
            <AlertCircle className="h-3 w-3 text-[#991B1B]" /> Revision Required
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
            <FileText className="h-3 w-3 text-neutral-500" /> Draft
          </span>
        );
    }
  };

  const orgName = profile?.club_name || profile?.department || profile?.name || 'Organizer';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header Profile Banner */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
              Role: {(profile?.role || 'club').toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              {orgName} Dashboard
            </h1>
            <p className="text-xs text-neutral-500 font-mono">
              {profile?.email}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/organizer/insights"
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <TrendingUp className="h-4 w-4 text-[#A4161A]" />
              Analytics &amp; AI
            </Link>

            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A4161A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Propose Event
            </button>

            <button
              onClick={loadData}
              className="rounded-md border border-neutral-300 bg-white p-2 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
              title="Refresh dashboard"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-neutral-200 text-xs">
          <button
            onClick={() => setActiveTab('draft')}
            className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
              activeTab === 'draft'
                ? 'border-[#A4161A] bg-neutral-100 text-neutral-900 font-semibold'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <div className="text-neutral-500">Drafts</div>
            <div className="text-xl font-bold text-neutral-900 mt-0.5">{counts.draft}</div>
          </button>

          <button
            onClick={() => setActiveTab('submitted')}
            className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
              activeTab === 'submitted'
                ? 'border-[#A4161A] bg-amber-50 text-amber-900 font-semibold'
                : 'border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-50'
            }`}
          >
            <div className="text-amber-700">Submitted (In Review)</div>
            <div className="text-xl font-bold text-amber-900 mt-0.5">{counts.submitted}</div>
          </button>

          <button
            onClick={() => setActiveTab('approved')}
            className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
              activeTab === 'approved'
                ? 'border-[#A4161A] bg-emerald-50 text-emerald-900 font-semibold'
                : 'border-emerald-200 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            <div className="text-emerald-700">Approved Events</div>
            <div className="text-xl font-bold text-emerald-900 mt-0.5">{counts.approved}</div>
          </button>

          <button
            onClick={() => setActiveTab('rejected')}
            className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
              activeTab === 'rejected'
                ? 'border-[#A4161A] bg-red-50 text-[#991B1B] font-semibold'
                : 'border-red-200 bg-red-50/50 text-[#991B1B] hover:bg-red-50'
            }`}
          >
            <div className="text-[#991B1B]">Action Required</div>
            <div className="text-xl font-bold text-[#991B1B] mt-0.5">{counts.rejected}</div>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-200 pb-2 overflow-x-auto text-xs">
        {(['all', 'draft', 'submitted', 'approved', 'rejected'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded px-3 py-1.5 font-medium capitalize transition-colors cursor-pointer ${
              activeTab === tab
                ? 'bg-neutral-900 text-white font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            {tab === 'all' ? `All (${counts.all})` : `${tab} (${counts[tab]})`}
          </button>
        ))}
      </div>

      {/* Events List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200"
            />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-neutral-300" />
          <h3 className="mt-3 text-base font-semibold text-neutral-900">
            No {activeTab !== 'all' ? activeTab : ''} events found
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            {activeTab === 'draft'
              ? 'You have no saved drafts.'
              : 'Create an event proposal to submit for review.'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#A4161A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Propose Event
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredEvents.map((event) => {
            const startFmt = formatDateTime(event.start_time);
            const endFmt = formatDateTime(event.end_time);
            const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
            const stats = eventStats[event.id] || { registered: 0, waitlisted: 0 };
            const vols = volunteersByEvent[event.id] || [];
            const acceptedVolsCount = vols.filter((v) => v.status === 'accepted').length;
            const volunteersNeeded = event.volunteers_needed || 0;

            return (
              <div
                key={event.id}
                className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    {/* Left: Poster + Details */}
                    <div className="flex items-start gap-4 flex-1">
                      {event.poster_url ? (
                        <img
                          src={event.poster_url}
                          alt={event.title}
                          className="h-20 w-20 rounded object-cover border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-neutral-100 border border-neutral-200 text-neutral-500">
                          <Building2 className="h-6 w-6 text-neutral-400" />
                        </div>
                      )}

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getStatusBadge(event.status)}
                          {event.fests && (
                            <span className="inline-flex items-center rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
                              Fest: {event.fests.name}
                            </span>
                          )}

                          {event.status === 'approved' && (
                            <>
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                                <Users className="h-3 w-3" /> {stats.registered} confirmed
                              </span>

                              {stats.waitlisted > 0 && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                                  <Hourglass className="h-3 w-3" /> {stats.waitlisted} waitlisted
                                </span>
                              )}

                              {volunteersNeeded > 0 && (
                                <button
                                  onClick={() => setManagingVolunteersEvent(event)}
                                  className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800 border border-neutral-300 hover:bg-neutral-200 transition-colors cursor-pointer"
                                >
                                  <HandHelping className="h-3 w-3 text-[#A4161A]" /> Volunteers: {acceptedVolsCount}/{volunteersNeeded}
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-neutral-900 truncate">
                          {event.title}
                        </h3>

                        {event.description && (
                          <p className="text-xs text-neutral-500 line-clamp-1">
                            {event.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 pt-1">
                          <div className="flex items-center gap-1 text-neutral-800 font-medium">
                            <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                            {hall?.name || 'Venue'} {hall?.capacity ? `(${hall.capacity} seats)` : ''}
                          </div>

                          <div className="flex items-center gap-1 font-mono text-[11px] text-neutral-500">
                            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                            {startFmt.date} • {startFmt.time} – {endFmt.time}
                          </div>

                          {event.registration_link && (
                            <a
                              href={event.registration_link}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[#A4161A] font-medium hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Registration Link
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 self-end md:self-start shrink-0">
                      {event.status === 'approved' && (
                        <>
                          <Link
                            href={`/organizer/scan/${event.id}`}
                            className="inline-flex items-center gap-1 rounded bg-[#A4161A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer"
                          >
                            <QrCode className="h-3.5 w-3.5" /> Scan Pass
                          </Link>

                          <Link
                            href={`/organizer/events/${event.id}/od`}
                            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" /> OD
                          </Link>

                          <Link
                            href={`/organizer/events/${event.id}/insights`}
                            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                          >
                            Insights
                          </Link>

                          {volunteersNeeded > 0 && (
                            <button
                              onClick={() => setManagingVolunteersEvent(event)}
                              className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                            >
                              <HandHelping className="h-3.5 w-3.5 text-[#A4161A]" /> ({vols.length})
                            </button>
                          )}
                        </>
                      )}

                      {event.status === 'rejected' && (
                        <button
                          onClick={() => handleDirectSubmit(event)}
                          className="flex items-center gap-1 rounded bg-[#A4161A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" /> Resubmit
                        </button>
                      )}

                      {event.status === 'draft' && (
                        <button
                          onClick={() => handleDirectSubmit(event)}
                          className="flex items-center gap-1 rounded bg-[#A4161A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" /> Submit
                        </button>
                      )}

                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEdit(event)}
                        className="flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </button>

                      {/* Delete Draft Button */}
                      {event.status === 'draft' && (
                        <button
                          onClick={() => handleDeleteDraft(event.id)}
                          className="rounded border border-red-200 bg-red-50 p-1.5 text-[#991B1B] hover:bg-red-100 transition-colors cursor-pointer"
                          title="Delete draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rejection Reason Box */}
                  {event.status === 'rejected' && event.rejection_reason && (
                    <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
                      <div>
                        <span className="font-semibold">Review Remarks: </span>
                        <span>{event.rejection_reason}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Form Modal */}
      {modalOpen && (
        <EventFormModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={loadData}
          initialEvent={editingEvent}
          halls={halls}
          userEmail={profile?.email || ''}
          userRole={profile?.role || 'club'}
          clubOrDept={orgName}
        />
      )}

      {/* Volunteer Applicants Management Modal */}
      {managingVolunteersEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-2xl rounded-md border border-neutral-200 bg-white shadow-lg my-6">
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-5 py-3.5">
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Volunteer Applicants
                </h3>
                <p className="text-xs text-neutral-500">
                  {managingVolunteersEvent.title} • {managingVolunteersEvent.volunteers_needed || 0} requested
                </p>
              </div>

              <button
                onClick={() => setManagingVolunteersEvent(null)}
                className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5 space-y-3">
              {(!volunteersByEvent[managingVolunteersEvent.id] || volunteersByEvent[managingVolunteersEvent.id].length === 0) ? (
                <div className="rounded border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500">
                  No volunteer applications received for this event.
                </div>
              ) : (
                <div className="divide-y divide-neutral-200 rounded border border-neutral-200 overflow-hidden">
                  {volunteersByEvent[managingVolunteersEvent.id].map((vol) => (
                    <div key={vol.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-neutral-900">
                            {vol.student_name || vol.student_email}
                          </span>
                          {vol.status === 'accepted' ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 border border-emerald-200">
                              Accepted
                            </span>
                          ) : vol.status === 'rejected' ? (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-[#991B1B] border border-red-200">
                              Rejected
                            </span>
                          ) : (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                              Pending
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 font-mono">
                          {vol.roll_no && <span>Roll: {vol.roll_no}</span>}
                          <span>{vol.student_email}</span>
                          <span className="font-sans text-[11px]">
                            Applied {new Date(vol.applied_at).toLocaleDateString('en-US')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {vol.status !== 'accepted' && (
                          <button
                            onClick={() => handleUpdateVolunteerStatus(vol.id, 'accepted')}
                            disabled={updatingVolId === vol.id}
                            className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {updatingVolId === vol.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                            Accept
                          </button>
                        )}

                        {vol.status !== 'rejected' && (
                          <button
                            onClick={() => handleUpdateVolunteerStatus(vol.id, 'rejected')}
                            disabled={updatingVolId === vol.id}
                            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-[#991B1B] hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {updatingVolId === vol.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-2.5">
              <button
                onClick={() => setManagingVolunteersEvent(null)}
                className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
