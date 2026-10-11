'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, AllowedUser, UserRole, Volunteer } from '@/lib/types';
import EventFormModal from '@/components/EventFormModal';
import ApprovalTracker from '@/components/ApprovalTracker';
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
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

interface EventStats {
  registered: number;
  waitlisted: number;
}

export default function OrganizerPage() {
  const { showToast } = useToast();
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

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [profileRes, eventsRes, hallsRes, statsRes] = await Promise.all([
        supabase.from('allowed_users').select('*').eq('email', user.email).maybeSingle(),
        supabase
          .from('events')
          .select('*, halls:halls!events_hall_id_fkey(id, name, capacity, location), requested_hall:halls!events_requested_hall_id_fkey(id, name, capacity, location), fests(id, name, is_active), organizations(id, name, type), approvals:event_approvals(*)')
          .eq('organizer_email', user.email)
          .order('created_at', { ascending: false }),
        supabase.from('halls').select('*').order('name', { ascending: true }),
        supabase.from('event_registration_counts').select('*'),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
      } else {
        setProfile({
          email: user.email,
          role: (user.user_metadata?.role as UserRole) || 'student',
          name: user.user_metadata?.name || user.email.split('@')[0],
          club_name: null,
          department: null,
          roll_no: null,
        });
      }

      const loadedEvents = (eventsRes.data as CampusEvent[]) || [];
      setEvents(loadedEvents);

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

      const approvedVolEvents = loadedEvents.filter(
        (e) => e.status === 'approved' && (e.volunteers_needed || 0) > 0
      );

      const volMap: Record<string, Volunteer[]> = {};
      await Promise.all(
        approvedVolEvents.map(async (ev) => {
          const { data: vList } = await supabase.rpc('list_event_volunteers', {
            p_event_id: ev.id,
          });
          if (vList) {
            volMap[ev.id] = vList.map((v: any) => ({
              id: v.id,
              event_id: ev.id,
              student_email: v.email,
              student_name: v.name,
              roll_no: v.roll_no,
              status: v.status,
              applied_at: v.applied_at,
            }));
          }
        })
      );
      setVolunteersByEvent(volMap);
    } catch (err: any) {
      console.error('Error loading organizer data:', err);
      showToast('error', err?.message || 'Failed to load host dashboard');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [supabase, showToast]);

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
      showToast('success', 'Draft deleted');
      loadData();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to delete event');
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
      showToast('success', 'Proposal submitted for administrative review');
      loadData();
    } catch (err: any) {
      let msg = err?.message || 'Failed to submit event.';
      if (
        msg.includes('Another event has booked this hall') ||
        msg.includes('already booked for that time') ||
        msg.includes('events_hall_time_no_overlap') ||
        msg.includes('exclusion')
      ) {
        msg = 'Another event has booked this hall for that time. Please choose a different hall or time.';
      }
      showToast('error', msg);
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

  const orgName = profile?.club_name || profile?.department || profile?.name || 'Organizer';

  const filterTabs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'draft', label: 'Drafts', count: counts.draft },
    { id: 'submitted', label: 'Submitted', count: counts.submitted },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Action Required', count: counts.rejected },
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`${orgName} Hub`}
        description={`Manage event proposals, volunteers, and attendance scanning for ${profile?.email}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/organizer/insights">
              <Button variant="secondary" size="sm">
                <TrendingUp className="h-4 w-4 text-[#A4161A]" /> Analytics &amp; AI
              </Button>
            </Link>

            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" /> Propose Event
            </Button>

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

      {/* Status Filter Tabs */}
      <Tabs
        tabs={filterTabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
        variant="pills"
      />

      {/* Events List */}
      {loading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6 text-neutral-400" />}
          title={`No ${activeTab !== 'all' ? activeTab : ''} events found`}
          description={
            activeTab === 'draft'
              ? 'You do not have any saved drafts.'
              : 'Create a new campus event proposal to begin the approval process.'
          }
          action={
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" /> Propose Event
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredEvents.map((event) => {
            const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
            const stats = eventStats[event.id] || { registered: 0, waitlisted: 0 };
            const vols = volunteersByEvent[event.id] || [];
            const acceptedVolsCount = vols.filter((v) => v.status === 'accepted').length;
            const pendingVolsCount = vols.filter((v) => v.status === 'pending').length;
            const volunteersNeeded = event.volunteers_needed || 0;

            return (
              <Card key={event.id} className="overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    {/* Left details */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {event.poster_url ? (
                        <img
                          src={event.poster_url}
                          alt={event.title}
                          className="h-20 w-28 rounded-lg object-cover border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-400">
                          <Building2 className="h-6 w-6" />
                        </div>
                      )}

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={event.status as any} />
                          {(event.organizations?.name || event.club_or_dept) && (
                            <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-800">
                              {event.organizations?.name || event.club_or_dept}
                            </span>
                          )}
                          {event.fests && (
                            <span className="rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                              {event.fests.name}
                            </span>
                          )}
                          {stats.registered > 0 && (
                            <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                              {stats.registered} registered
                            </span>
                          )}
                          {stats.waitlisted > 0 && (
                            <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              {stats.waitlisted} waitlisted
                            </span>
                          )}
                          {pendingVolsCount > 0 && (
                            <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                              {pendingVolsCount} pending volunteers
                            </span>
                          )}
                        </div>

                        <h2 className="text-base font-bold text-neutral-900 truncate">
                          <Link
                            href={`/organizer/events/${event.id}`}
                            className="hover:text-[#A4161A] transition-colors"
                          >
                            {event.title}
                          </Link>
                        </h2>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
                          <div className="flex items-center gap-1 text-neutral-800 font-medium">
                            <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                            {formatHall(hall?.name, hall?.capacity)}
                          </div>
                          <div className="flex items-center gap-1 text-neutral-500 font-mono text-[11px]">
                            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                            {formatEventDate(event.start_time, event.end_time)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right actions */}
                    <div className="flex flex-wrap items-center gap-2 self-end md:self-start shrink-0">
                      <Link href={`/organizer/events/${event.id}`}>
                        <Button variant="primary" size="sm">
                          Dashboard <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>

                      {event.status === 'approved' && (
                        <Link href={`/organizer/scan/${event.id}`}>
                          <Button variant="secondary" size="sm">
                            <QrCode className="h-4 w-4 text-[#A4161A]" /> Scan
                          </Button>
                        </Link>
                      )}

                      {(event.status === 'draft' || event.status === 'rejected') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleDirectSubmit(event)}
                        >
                          <Send className="h-4 w-4" /> Submit
                        </Button>
                      )}

                      <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(event)}>
                        <Edit3 className="h-4 w-4" /> Edit
                      </Button>

                      {event.status === 'draft' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteDraft(event.id)}
                          aria-label="Delete draft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Rejection remarks */}
                  {event.status === 'rejected' && event.rejection_reason && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
                      <div>
                        <span className="font-bold">Review Remarks: </span>
                        <span>{event.rejection_reason}</span>
                      </div>
                    </div>
                  )}

                  {/* Approval Tracker */}
                  <div className="mt-4 pt-3 border-t border-neutral-100">
                    <ApprovalTracker event={event} approvals={event.approvals || []} />
                  </div>
                </div>
              </Card>
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
          userRole={profile?.role || 'student'}
          clubOrDept={orgName}
        />
      )}
    </div>
  );
}
