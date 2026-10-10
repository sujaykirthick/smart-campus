'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, AllowedUser, UserRole, Volunteer } from '@/lib/types';
import EventFormModal from '@/components/EventFormModal';
import {
  Sparkles,
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
  Check,
  Loader2,
  TrendingUp,
  BarChart3,
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
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" /> Approved
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            <Clock className="h-3.5 w-3.5 text-amber-700" /> Submitted (In Review)
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-bold text-red-900">
            <AlertCircle className="h-3.5 w-3.5 text-[#8E1A22]" /> Action Required (Rejected)
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFAF5] border border-[#EADFD6] px-2.5 py-0.5 text-xs font-semibold text-[#7A6A62]">
            <FileText className="h-3.5 w-3.5 text-[#7A6A62]" /> Draft
          </span>
        );
    }
  };

  const orgName = profile?.club_name || profile?.department || profile?.name || 'Organizer';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header Profile Banner */}
      <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-gradient-to-br from-[#FFFAF5] via-white to-[#FFFAF5]/50 p-6 sm:p-8 shadow-xs relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B3202A] via-[#C9A24B] to-[#B3202A]" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A24B]/40 bg-[#FFFAF5] px-3 py-1 text-xs font-semibold text-[#8E1A22]">
              <Sparkles className="h-3.5 w-3.5 text-[#C9A24B]" />
              Role: {(profile?.role || 'club').toUpperCase()}
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2B1B17]">
              {orgName} Portal
            </h1>
            <p className="text-sm text-[#7A6A62]">
              Logged in as <span className="font-mono font-medium text-[#2B1B17]">{profile?.email}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/organizer/insights"
              className="inline-flex items-center gap-2 rounded-xl border border-[#C9A24B]/50 bg-white px-4 py-2.5 text-sm font-semibold text-[#8E1A22] shadow-xs hover:bg-[#FFFAF5] transition-colors"
            >
              <TrendingUp className="h-4 w-4 text-[#C9A24B]" />
              Club Analytics & AI
            </Link>

            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B3202A] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#8E1A22] transition-all hover:scale-[1.01] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Propose New Event
            </button>

            <button
              onClick={loadData}
              className="rounded-xl border border-[#EADFD6] bg-white p-2.5 text-[#7A6A62] shadow-xs hover:bg-[#FFFAF5] hover:text-[#2B1B17] transition-colors cursor-pointer"
              title="Refresh events"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-[#EADFD6] text-xs">
          <button
            onClick={() => setActiveTab('draft')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeTab === 'draft'
                ? 'border-[#B3202A] bg-[#B3202A] text-white shadow-xs'
                : 'border-[#EADFD6] bg-white text-[#2B1B17] hover:bg-[#FFFAF5]'
            }`}
          >
            <div className="font-medium opacity-80">Drafts</div>
            <div className="font-serif text-2xl font-bold mt-0.5">{counts.draft}</div>
          </button>

          <button
            onClick={() => setActiveTab('submitted')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeTab === 'submitted'
                ? 'border-[#B3202A] bg-[#B3202A] text-white shadow-xs'
                : 'border-amber-200 bg-amber-50/60 text-amber-900 hover:bg-amber-50'
            }`}
          >
            <div className="font-medium opacity-80">Submitted (Pending)</div>
            <div className="font-serif text-2xl font-bold mt-0.5">{counts.submitted}</div>
          </button>

          <button
            onClick={() => setActiveTab('approved')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeTab === 'approved'
                ? 'border-[#B3202A] bg-[#B3202A] text-white shadow-xs'
                : 'border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-50'
            }`}
          >
            <div className="font-medium opacity-80">Approved Events</div>
            <div className="font-serif text-2xl font-bold mt-0.5">{counts.approved}</div>
          </button>

          <button
            onClick={() => setActiveTab('rejected')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeTab === 'rejected'
                ? 'border-[#B3202A] bg-[#B3202A] text-white shadow-xs'
                : 'border-red-200 bg-red-50/60 text-red-900 hover:bg-red-50'
            }`}
          >
            <div className="font-medium opacity-80">Rejected / Revisions</div>
            <div className="font-serif text-2xl font-bold mt-0.5">{counts.rejected}</div>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#EADFD6] pb-3 overflow-x-auto text-sm">
        {(['all', 'draft', 'submitted', 'approved', 'rejected'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-1.5 font-medium capitalize transition-all cursor-pointer ${
              activeTab === tab
                ? 'bg-[#B3202A] text-white shadow-xs font-semibold'
                : 'text-[#7A6A62] hover:bg-[#EADFD6]/40 hover:text-[#2B1B17]'
            }`}
          >
            {tab === 'all' ? `All (${counts.all})` : `${tab} (${counts[tab]})`}
          </button>
        ))}
      </div>

      {/* Events List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 w-full animate-pulse rounded-2xl bg-[#EADFD6]/50"
            />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-[#EADFD6] bg-white p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-[#EADFD6]" />
          <h3 className="mt-3 font-serif text-lg font-bold text-[#2B1B17]">
            No {activeTab !== 'all' ? activeTab : ''} events found
          </h3>
          <p className="mt-1 text-sm text-[#7A6A62]">
            {activeTab === 'draft'
              ? 'You have no saved drafts.'
              : 'Create your first event proposal to get started.'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#B3202A] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#8E1A22] transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Propose Event
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
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
                className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-white shadow-xs transition-all hover:border-[#C9A24B]/60 hover:shadow-md"
              >
                <div className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    {/* Left: Poster + Details */}
                    <div className="flex items-start gap-4 flex-1">
                      {event.poster_url ? (
                        <img
                          src={event.poster_url}
                          alt={event.title}
                          className="h-24 w-24 rounded-xl object-cover border border-[#EADFD6] shrink-0"
                        />
                      ) : (
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-[#FFFAF5] border border-[#EADFD6] text-[#7A6A62]">
                          <Building2 className="h-8 w-8 text-[#B3202A]/60" />
                        </div>
                      )}

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {getStatusBadge(event.status)}
                          {event.fests && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#FFFAF5] px-2.5 py-0.5 text-xs font-semibold text-[#8E1A22] border border-[#C9A24B]/50">
                              <Sparkles className="h-3 w-3 text-[#C9A24B]" /> Fest: {event.fests.name}
                            </span>
                          )}

                          {event.status === 'approved' && (
                            <>
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                                <Users className="h-3 w-3" /> {stats.registered} confirmed
                              </span>

                              {stats.waitlisted > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                                  <Hourglass className="h-3 w-3" /> {stats.waitlisted} on waitlist
                                </span>
                              )}

                              {volunteersNeeded > 0 && (
                                <button
                                  onClick={() => setManagingVolunteersEvent(event)}
                                  className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800 border border-sky-200 hover:bg-sky-100 transition-colors cursor-pointer"
                                >
                                  <HandHelping className="h-3 w-3" /> Volunteers: {acceptedVolsCount}/{volunteersNeeded} accepted ({vols.length} applicants)
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        <h3 className="font-serif text-lg font-bold text-[#2B1B17] truncate">
                          {event.title}
                        </h3>

                        {event.description && (
                          <p className="text-xs text-[#7A6A62] line-clamp-2">
                            {event.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-xs text-[#7A6A62] pt-1">
                          <div className="flex items-center gap-1 font-medium text-[#2B1B17]">
                            <MapPin className="h-3.5 w-3.5 text-[#B3202A]" />
                            {hall?.name || 'Hall'} {hall?.capacity ? `(${hall.capacity} seats)` : ''}
                          </div>

                          <div className="flex items-center gap-1 font-mono text-[#7A6A62]">
                            <Calendar className="h-3.5 w-3.5 text-[#C9A24B]" />
                            {startFmt.date} • {startFmt.time} – {endFmt.time}
                          </div>

                          {event.registration_link && (
                            <a
                              href={event.registration_link}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[#B3202A] font-medium hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Registration Link
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-2 self-end md:self-start shrink-0">
                      {/* Approved Event Action Links */}
                      {event.status === 'approved' && (
                        <>
                          <Link
                            href={`/organizer/scan/${event.id}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#B3202A] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#8E1A22] transition-colors cursor-pointer"
                          >
                            <QrCode className="h-3.5 w-3.5" /> Scan QR
                          </Link>

                          <Link
                            href={`/organizer/events/${event.id}/od`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-xs"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" /> OD List
                          </Link>

                          <Link
                            href={`/organizer/events/${event.id}/insights`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#C9A24B]/40 bg-[#FFFAF5] px-3 py-1.5 text-xs font-semibold text-[#8E1A22] hover:bg-[#EADFD6]/40 transition-colors shadow-xs"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-[#C9A24B]" /> Insights & AI
                          </Link>

                          {volunteersNeeded > 0 && (
                            <button
                              onClick={() => setManagingVolunteersEvent(event)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer"
                            >
                              <HandHelping className="h-3.5 w-3.5" /> Volunteers ({vols.length})
                            </button>
                          )}
                        </>
                      )}

                      {/* Rejection Reason Alert if rejected */}
                      {event.status === 'rejected' && (
                        <button
                          onClick={() => handleDirectSubmit(event)}
                          className="flex items-center gap-1 rounded-xl bg-[#B3202A] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#8E1A22] transition-colors cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" /> Resubmit
                        </button>
                      )}

                      {event.status === 'draft' && (
                        <button
                          onClick={() => handleDirectSubmit(event)}
                          className="flex items-center gap-1 rounded-xl bg-[#B3202A] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#8E1A22] transition-colors cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" /> Submit
                        </button>
                      )}

                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEdit(event)}
                        className="flex items-center gap-1 rounded-xl border border-[#EADFD6] bg-white px-3 py-1.5 text-xs font-medium text-[#2B1B17] shadow-xs hover:bg-[#FFFAF5] hover:text-[#B3202A] cursor-pointer transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </button>

                      {/* Delete Draft Button */}
                      {event.status === 'draft' && (
                        <button
                          onClick={() => handleDeleteDraft(event.id)}
                          className="rounded-xl border border-red-200 bg-red-50 p-1.5 text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                          title="Delete draft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rejection Reason Notice Box */}
                  {event.status === 'rejected' && event.rejection_reason && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-900 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 shrink-0 text-[#8E1A22] mt-0.5" />
                      <div>
                        <span className="font-bold">Feedback from Student Welfare: </span>
                        <span>{event.rejection_reason}</span>
                        <div className="mt-1 text-[11px] text-red-800">
                          Please click &ldquo;Edit&rdquo; to adjust your proposal and resubmit for approval.
                        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-2xl border border-[#EADFD6] bg-white shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#EADFD6] bg-[#FFFAF5] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B3202A] text-white">
                  <HandHelping className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                    Volunteer Applicants
                  </h3>
                  <p className="text-xs text-[#7A6A62]">
                    {managingVolunteersEvent.title} • {managingVolunteersEvent.volunteers_needed || 0} volunteers needed
                  </p>
                </div>
              </div>

              <button
                onClick={() => setManagingVolunteersEvent(null)}
                className="rounded-lg p-1.5 text-[#7A6A62] hover:bg-[#EADFD6]/50 hover:text-[#2B1B17] transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6 space-y-4">
              {(!volunteersByEvent[managingVolunteersEvent.id] || volunteersByEvent[managingVolunteersEvent.id].length === 0) ? (
                <div className="rounded-xl border border-dashed border-[#EADFD6] p-8 text-center text-xs text-[#7A6A62]">
                  <HandHelping className="mx-auto h-8 w-8 text-[#EADFD6] mb-2" />
                  No students have applied to volunteer for this event yet.
                </div>
              ) : (
                <div className="divide-y divide-[#EADFD6] rounded-xl border border-[#EADFD6] overflow-hidden">
                  {volunteersByEvent[managingVolunteersEvent.id].map((vol) => (
                    <div key={vol.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#2B1B17]">
                            {vol.student_name || vol.student_email}
                          </span>
                          {vol.status === 'accepted' ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                              Accepted
                            </span>
                          ) : vol.status === 'rejected' ? (
                            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-800 border border-red-200">
                              Rejected
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                              Pending
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-[#7A6A62] font-mono">
                          {vol.roll_no && <span>Roll: {vol.roll_no}</span>}
                          <span>{vol.student_email}</span>
                          <span className="font-sans text-[11px] text-[#7A6A62]/80">
                            Applied {new Date(vol.applied_at).toLocaleDateString('en-US')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {vol.status !== 'accepted' && (
                          <button
                            onClick={() => handleUpdateVolunteerStatus(vol.id, 'accepted')}
                            disabled={updatingVolId === vol.id}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {updatingVolId === vol.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                            Accept
                          </button>
                        )}

                        {vol.status !== 'rejected' && (
                          <button
                            onClick={() => handleUpdateVolunteerStatus(vol.id, 'rejected')}
                            disabled={updatingVolId === vol.id}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {updatingVolId === vol.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-[#EADFD6] bg-[#FFFAF5] px-6 py-3">
              <button
                onClick={() => setManagingVolunteersEvent(null)}
                className="rounded-xl bg-[#2B1B17] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-black transition-colors cursor-pointer"
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
