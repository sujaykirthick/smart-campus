'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Registration, Hall, AllowedUser } from '@/lib/types';
import ApprovalTracker from '@/components/ApprovalTracker';
import EventFormModal from '@/components/EventFormModal';
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  Tabs,
  DataTable,
  EmptyState,
  Skeleton,
  useToast,
} from '@/components/ui';
import { formatEventDate, formatHall } from '@/lib/format';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  XCircle,
  Hourglass,
  HandHelping,
  Camera,
  FileSpreadsheet,
  TrendingUp,
  Edit3,
  Search,
  AlertTriangle,
  AlertCircle,
  Download,
  Loader2,
  Building2,
  RefreshCw,
  ExternalLink,
  Info,
  ChevronRight,
  Sparkles,
  QrCode,
} from 'lucide-react';

interface VolunteerApplicant {
  id: string;
  name: string;
  roll_no: string | null;
  email: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  applied_at: string;
}

interface RegistrationWithUser extends Registration {
  student_name?: string;
  department_name?: string;
}

type TabKey = 'registrations' | 'volunteers' | 'attendance' | 'insights' | 'edit';

export default function HostEventDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { showToast } = useToast();

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationWithUser[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerApplicant[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [currentUser, setCurrentUser] = useState<AllowedUser | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isApprover, setIsApprover] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active tab: Registrations, Volunteers, Attendance, Insights, Edit
  const [activeTab, setActiveTab] = useState<TabKey>('registrations');

  // Search & Filter in Registrations tab
  const [regSearch, setRegSearch] = useState('');
  const [regFilter, setRegFilter] = useState<'all' | 'confirmed' | 'waitlisted' | 'scanned'>('all');

  // Volunteer action state
  const [volActionLoadingId, setVolActionLoadingId] = useState<string | null>(null);

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        router.push('/login');
        return;
      }

      // Fetch user profile
      const { data: profile } = await supabase
        .from('allowed_users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      const userProfile: AllowedUser = profile || {
        email: user.email,
        role: 'student',
        name: user.email.split('@')[0],
        club_name: null,
        department: null,
        roll_no: null,
      };
      setCurrentUser(userProfile);

      // Fetch event
      const { data: eventData, error: evErr } = await supabase
        .from('events')
        .select(`
          *,
          halls:halls!events_hall_id_fkey(id, name, capacity, location),
          requested_hall:halls!events_requested_hall_id_fkey(id, name, capacity, location),
          fests(id, name),
          organizations(id, name, type),
          approvals:event_approvals(*)
        `)
        .eq('id', eventId)
        .maybeSingle();

      if (evErr || !eventData) {
        router.push('/organizer');
        return;
      }

      const ownerCheck = eventData.organizer_email.toLowerCase().trim() === user.email.toLowerCase().trim();
      const approverCheck = ['student_affairs', 'event_office', 'cd'].includes(userProfile.role);

      if (!ownerCheck && !approverCheck) {
        showToast('error', 'Unauthorized: Only event hosts and approvers can view this dashboard');
        router.push('/events');
        return;
      }

      setIsOwner(ownerCheck);
      setIsApprover(approverCheck);
      setEvent(eventData as CampusEvent);

      // Fetch halls for edit modal
      const { data: allHalls } = await supabase.from('halls').select('*').order('name');
      if (allHalls) setHalls(allHalls);

      // Fetch registrations for this event
      const { data: regsData } = await supabase
        .from('registrations')
        .select('*')
        .eq('event_id', eventId)
        .order('registered_at', { ascending: true });

      // Fetch users to enrich registration names
      const { data: allUsers } = await supabase.from('allowed_users').select('email, name, roll_no, department');
      const usersMap = new Map((allUsers || []).map((u) => [u.email.toLowerCase().trim(), u]));

      if (regsData) {
        const enriched: RegistrationWithUser[] = regsData.map((r) => {
          const u = usersMap.get(r.student_email.toLowerCase().trim());
          return {
            ...r,
            student_name: u?.name || r.student_email.split('@')[0],
            department_name: u?.department || undefined,
          };
        });
        setRegistrations(enriched);
      }

      // Fetch volunteers via security definer RPC
      const { data: volsData, error: volErr } = await supabase.rpc('list_event_volunteers', {
        p_event_id: eventId,
      });

      if (!volErr && volsData) {
        setVolunteers(volsData as VolunteerApplicant[]);
      }
    } catch (err: any) {
      console.error('Error loading host event dashboard:', err);
      showToast('error', err?.message || 'Failed to load dashboard');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [supabase, eventId, router, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle volunteer decisions
  const handleDecideVolunteer = async (volunteerId: string, decision: 'accepted' | 'rejected' | 'pending') => {
    if (!isOwner) {
      showToast('error', 'Only the event owner can manage volunteer applications');
      return;
    }

    setVolActionLoadingId(volunteerId);

    try {
      const { data, error } = await supabase.rpc('decide_volunteer', {
        p_volunteer_id: volunteerId,
        p_decision: decision,
      });

      if (error) {
        showToast('error', error.message);
        return;
      }

      showToast('success', `Applicant marked as ${decision}. Total accepted: ${data}`);
      await loadData(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update decision');
    } finally {
      setVolActionLoadingId(null);
    }
  };

  // CSV Attendance Download
  const handleDownloadAttendanceCSV = () => {
    if (!event) return;

    const confirmedRegs = registrations.filter((r) => r.status === 'confirmed');
    const headers = ['S.No', 'Roll Number', 'Student Name', 'Email', 'Department', 'Status', 'Check-in Time'];
    const rows = confirmedRegs.map((r, index) => [
      index + 1,
      r.roll_no || 'N/A',
      `"${r.student_name || r.student_email}"`,
      r.student_email,
      `"${r.department_name || 'General'}"`,
      r.checked_in_at ? 'Scanned' : 'Not Scanned',
      r.checked_in_at ? new Date(r.checked_in_at).toLocaleString() : 'N/A',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${event.title.replace(/\s+/g, '_')}_attendance.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('success', 'Attendance CSV downloaded');
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    const waitlisted = registrations.filter((r) => r.status === 'waitlisted');
    const scanned = confirmed.filter((r) => r.checked_in_at !== null);
    const acceptedVols = volunteers.filter((v) => v.status === 'accepted');
    const pendingVols = volunteers.filter((v) => v.status === 'pending');
    const neededVols = event?.volunteers_needed || 0;

    return {
      confirmedCount: confirmed.length,
      waitlistedCount: waitlisted.length,
      scannedCount: scanned.length,
      acceptedVolsCount: acceptedVols.length,
      pendingVolsCount: pendingVols.length,
      neededVols,
    };
  }, [registrations, volunteers, event]);

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      const q = regSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.student_email.toLowerCase().includes(q) ||
        (r.student_name && r.student_name.toLowerCase().includes(q)) ||
        (r.roll_no && r.roll_no.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (regFilter === 'confirmed') return r.status === 'confirmed';
      if (regFilter === 'waitlisted') return r.status === 'waitlisted';
      if (regFilter === 'scanned') return r.status === 'confirmed' && r.checked_in_at !== null;
      return true;
    });
  }, [registrations, regSearch, regFilter]);

  if (loading || !event) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#A4161A]" />
        <div className="text-xs text-neutral-500 font-medium">Loading host dashboard...</div>
      </div>
    );
  }

  const hall = event.halls;
  const tabsList = [
    { id: 'registrations', label: 'Registrations', count: registrations.length },
    { id: 'volunteers', label: 'Volunteers', count: volunteers.length },
    { id: 'attendance', label: 'Attendance' },
    { id: 'insights', label: 'Insights' },
    { id: 'edit', label: 'Edit' },
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Top Header */}
      <PageHeader
        title={event.title}
        badge={<StatusBadge status={event.status as any} />}
        description={`${formatHall(hall?.name, hall?.capacity)} • ${formatEventDate(event.start_time, event.end_time)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/organizer">
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-4 w-4" /> All Events
              </Button>
            </Link>
            {event.status === 'approved' && (
              <Link href={`/organizer/scan/${event.id}`}>
                <Button variant="primary" size="sm">
                  <Camera className="h-4 w-4" /> Live Scanner
                </Button>
              </Link>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadData(false)}
              aria-label="Refresh dashboard"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* 4 SUMMARY CARDS AT THE TOP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Registered */}
        <Card className="p-4 sm:p-5">
          <div className="text-xs font-medium text-neutral-500">Registered Attendees</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-neutral-900">
              {metrics.confirmedCount}
            </span>
            <span className="text-xs text-neutral-500">
              / {hall?.capacity || '—'} cap
            </span>
          </div>
          <div className="mt-2 text-[11px] text-neutral-600 font-medium">
            {hall?.capacity
              ? `${Math.min(100, Math.round((metrics.confirmedCount / hall.capacity) * 100))}% venue capacity`
              : 'Confirmed passes'}
          </div>
        </Card>

        {/* Card 2: Waitlisted */}
        <Card className="p-4 sm:p-5 border-amber-200 bg-amber-50/30">
          <div className="text-xs font-medium text-amber-800">Waitlisted Students</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-900">
              {metrics.waitlistedCount}
            </span>
            <span className="text-xs text-amber-700">in queue</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-800 font-medium">
            Auto-promoted on cancellations
          </div>
        </Card>

        {/* Card 3: Scanned */}
        <Card className="p-4 sm:p-5 border-emerald-200 bg-emerald-50/30">
          <div className="text-xs font-medium text-emerald-800">Scanned & Verified</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-900">
              {metrics.scannedCount}
            </span>
            <span className="text-xs text-emerald-700">checked in</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-800 font-medium">
            {metrics.confirmedCount > 0
              ? `${Math.round((metrics.scannedCount / metrics.confirmedCount) * 100)}% attendance turnout`
              : 'Awaiting event start'}
          </div>
        </Card>

        {/* Card 4: Volunteers */}
        <Card className="p-4 sm:p-5">
          <div className="text-xs font-medium text-neutral-500">Volunteers Accepted</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-neutral-900">
              {metrics.acceptedVolsCount}
            </span>
            <span className="text-xs text-neutral-500">
              / {metrics.neededVols} quota
            </span>
          </div>
          <div className="mt-2 text-[11px] font-medium">
            {metrics.pendingVolsCount > 0 ? (
              <span className="text-amber-700 font-semibold">
                {metrics.pendingVolsCount} pending applicant{metrics.pendingVolsCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-neutral-600">All decided</span>
            )}
          </div>
        </Card>
      </div>

      {/* DASHBOARD TABS */}
      <Tabs
        tabs={tabsList}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as TabKey)}
        variant="underline"
      />

      {/* TAB 1: REGISTRATIONS */}
      {activeTab === 'registrations' && (
        <section aria-label="Registrations" className="space-y-4">
          {/* Controls Filter Bar */}
          <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search name, roll no, or email..."
                value={regSearch}
                onChange={(e) => setRegSearch(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 py-2 text-xs text-neutral-900 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant={regFilter === 'all' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setRegFilter('all')}
              >
                All ({registrations.length})
              </Button>
              <Button
                variant={regFilter === 'confirmed' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setRegFilter('confirmed')}
              >
                Confirmed ({metrics.confirmedCount})
              </Button>
              <Button
                variant={regFilter === 'waitlisted' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setRegFilter('waitlisted')}
              >
                Waitlist ({metrics.waitlistedCount})
              </Button>
              <Button
                variant={regFilter === 'scanned' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setRegFilter('scanned')}
              >
                Scanned ({metrics.scannedCount})
              </Button>
            </div>
          </Card>

          {/* Registrations Data Table */}
          <DataTable>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Roll No</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Pass Status</th>
                  <th className="px-4 py-3">Check-In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-neutral-500">
                      No attendees found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map((reg) => {
                    const isWaitlisted = reg.status === 'waitlisted';
                    const isScanned = !!reg.checked_in_at;

                    return (
                      <tr key={reg.id} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900">
                            {reg.student_name || reg.student_email.split('@')[0]}
                          </div>
                          <div className="font-mono text-[11px] text-neutral-500">
                            {reg.student_email}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-neutral-800">
                          {reg.roll_no || '—'}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          {reg.department_name || 'General'}
                        </td>
                        <td className="px-4 py-3">
                          {isWaitlisted ? (
                            <StatusBadge status="waitlisted" label="Waitlisted" />
                          ) : (
                            <StatusBadge status="approved" label="Confirmed" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isScanned ? (
                            <span className="inline-flex items-center gap-1 font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 text-[11px]">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              {new Date(reg.checked_in_at!).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              })}
                            </span>
                          ) : (
                            <span className="text-neutral-400 font-medium text-[11px]">
                              Pending scan
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </DataTable>
        </section>
      )}

      {/* TAB 2: VOLUNTEERS */}
      {activeTab === 'volunteers' && (
        <section aria-label="Volunteer Management" className="space-y-4">
          <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <HandHelping className="h-4 w-4 text-[#A4161A]" />
                Event Volunteers
              </h2>
              <p className="text-xs text-neutral-500">
                Accepted {metrics.acceptedVolsCount} of {metrics.neededVols} quota
              </p>
            </div>
            {metrics.acceptedVolsCount >= metrics.neededVols && metrics.neededVols > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Quota Met
              </span>
            ) : (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-md">
                {metrics.neededVols - metrics.acceptedVolsCount} open spot{metrics.neededVols - metrics.acceptedVolsCount === 1 ? '' : 's'}
              </span>
            )}
          </Card>

          <DataTable>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Roll No</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {volunteers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-neutral-500">
                      No volunteer applications received yet.
                    </td>
                  </tr>
                ) : (
                  volunteers.map((vol) => {
                    const isAccepted = vol.status === 'accepted';
                    const isRejected = vol.status === 'rejected';
                    const isWithdrawn = vol.status === 'withdrawn';
                    const isBusy = volActionLoadingId === vol.id;

                    return (
                      <tr key={vol.id} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900">{vol.name}</div>
                          <div className="font-mono text-[11px] text-neutral-500">{vol.email}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-neutral-800">
                          {vol.roll_no || '—'}
                        </td>
                        <td className="px-4 py-3 text-neutral-500 text-[11px]">
                          {new Date(vol.applied_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {isAccepted ? (
                            <StatusBadge status="approved" label="Accepted" />
                          ) : isRejected ? (
                            <StatusBadge status="rejected" label="Rejected" />
                          ) : isWithdrawn ? (
                            <StatusBadge status="draft" label="Withdrawn" />
                          ) : (
                            <StatusBadge status="pending" label="Pending" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isOwner && !isWithdrawn && (
                            <div className="flex items-center justify-end gap-1.5">
                              {!isAccepted && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleDecideVolunteer(vol.id, 'accepted')}
                                  disabled={isBusy}
                                >
                                  Accept
                                </Button>
                              )}
                              {!isRejected && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDecideVolunteer(vol.id, 'rejected')}
                                  disabled={isBusy}
                                >
                                  Reject
                                </Button>
                              )}
                              {(isAccepted || isRejected) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDecideVolunteer(vol.id, 'pending')}
                                  disabled={isBusy}
                                >
                                  Reset
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </DataTable>
        </section>
      )}

      {/* TAB 3: ATTENDANCE & OD */}
      {activeTab === 'attendance' && (
        <section aria-label="Attendance and OD" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Scanner Card */}
            <Card className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#A4161A]">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900">
                      Live Attendance Scanner
                    </h2>
                    <p className="text-xs text-neutral-500">Camera-based QR verification</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Scan digital student passes at the entrance hall. Accepted volunteers and organizers can both operate this scanner simultaneously.
              </p>
              <div>
                <Link href={`/organizer/scan/${event.id}`}>
                  <Button variant="primary" size="md">
                    <Camera className="h-4 w-4" /> Open Camera Scanner
                  </Button>
                </Link>
              </div>
            </Card>

            {/* OD Export Card */}
            <Card className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900">
                      On-Duty (OD) Roster Export
                    </h2>
                    <p className="text-xs text-neutral-500">Official university format</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Download the complete verified check-in roster formatted with student roll numbers, departments, and scan timestamps.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="md" onClick={handleDownloadAttendanceCSV}>
                  <Download className="h-4 w-4 text-[#A4161A]" /> Export CSV
                </Button>
                <Link href={`/organizer/events/${event.id}/od`}>
                  <Button variant="ghost" size="md">
                    OD Roster View <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* TAB 4: INSIGHTS */}
      {activeTab === 'insights' && (
        <section aria-label="Event Insights" className="space-y-6">
          <Card className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[#A4161A]" />
                  Session Performance & Analytics
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Attendee turn-out rates, student reviews, and AI session synthesis.
                </p>
              </div>

              <Link href={`/organizer/events/${event.id}/insights`}>
                <Button variant="primary" size="sm">
                  <Sparkles className="h-4 w-4" /> View Full AI Insights
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Confirmed Attendees</div>
                <div className="text-2xl font-extrabold text-neutral-900 mt-1">
                  {metrics.confirmedCount}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Actual Turnout Rate</div>
                <div className="text-2xl font-extrabold text-emerald-700 mt-1">
                  {metrics.confirmedCount > 0
                    ? `${Math.round((metrics.scannedCount / metrics.confirmedCount) * 100)}%`
                    : '—'}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">No-Show Rate</div>
                <div className="text-2xl font-extrabold text-neutral-700 mt-1">
                  {metrics.confirmedCount > 0
                    ? `${Math.max(0, 100 - Math.round((metrics.scannedCount / metrics.confirmedCount) * 100))}%`
                    : '—'}
                </div>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* TAB 5: EDIT */}
      {activeTab === 'edit' && (
        <section aria-label="Edit Event Proposal" className="space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  Proposal Details & Settings
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Update event description, venue request, schedule, or volunteer requirements.
                </p>
              </div>

              {isOwner ? (
                <Button variant="primary" size="sm" onClick={() => setEditModalOpen(true)}>
                  <Edit3 className="h-4 w-4" /> Edit Event
                </Button>
              ) : (
                <span className="text-xs text-neutral-400 italic">Read-only view</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-neutral-100 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-600">Organizer:</span>
                  <span className="font-mono text-neutral-900">{event.organizer_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-600">Organization / Club:</span>
                  <span className="text-neutral-900">{event.organizations?.name || event.club_or_dept || 'Standalone'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-600">Venue Allocated:</span>
                  <span className="text-neutral-900">{hall?.name || 'Pending'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-600">Volunteers Needed:</span>
                  <span className="text-neutral-900">{event.volunteers_needed || 0} students</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-600">Start Time:</span>
                  <span className="text-neutral-900">{new Date(event.start_time).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-600">End Time:</span>
                  <span className="text-neutral-900">{new Date(event.end_time).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {event.description && (
              <div className="pt-3 border-t border-neutral-100">
                <span className="text-xs font-semibold text-neutral-600 block mb-1">
                  Description:
                </span>
                <p className="text-xs text-neutral-700 whitespace-pre-line leading-relaxed">
                  {event.description}
                </p>
              </div>
            )}
          </Card>

          {/* Approval Workflow Progress Card */}
          <Card className="p-6 space-y-3">
            <h2 className="text-sm font-bold text-neutral-900">Approval Workflow Progress</h2>
            <ApprovalTracker event={event} approvals={event.approvals || []} />
          </Card>
        </section>
      )}

      {/* Edit Event Form Modal */}
      {editModalOpen && (
        <EventFormModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSaved={async () => {
            setEditModalOpen(false);
            showToast('success', 'Event proposal updated');
            await loadData(false);
          }}
          initialEvent={event}
          halls={halls}
          userEmail={currentUser?.email || ''}
          userRole={currentUser?.role || 'student'}
          clubOrDept={event.organizations?.name || event.club_or_dept || ''}
        />
      )}
    </div>
  );
}
