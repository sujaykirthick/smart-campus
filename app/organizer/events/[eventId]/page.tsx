'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Registration, Hall, AllowedUser } from '@/lib/types';
import ApprovalTracker from '@/components/ApprovalTracker';
import EventFormModal from '@/components/EventFormModal';
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

export default function HostEventDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationWithUser[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerApplicant[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [currentUser, setCurrentUser] = useState<AllowedUser | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isApprover, setIsApprover] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'registrations' | 'volunteers' | 'attendance'>('overview');

  // Search & Filter in Registrations tab
  const [regSearch, setRegSearch] = useState('');
  const [regFilter, setRegFilter] = useState<'all' | 'confirmed' | 'waitlisted' | 'scanned'>('all');

  // Volunteer action state
  const [volActionLoadingId, setVolActionLoadingId] = useState<string | null>(null);
  const [volActionError, setVolActionError] = useState<string | null>(null);
  const [volActionSuccess, setVolActionSuccess] = useState<string | null>(null);

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setVolActionError(null);

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
        alert('Unauthorized: Only the event host or university approvers can view this dashboard.');
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
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [supabase, eventId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle volunteer decisions
  const handleDecideVolunteer = async (volunteerId: string, decision: 'accepted' | 'rejected' | 'pending') => {
    if (!isOwner) {
      alert('Read-only view: Only the event owner can manage volunteer applications.');
      return;
    }

    setVolActionLoadingId(volunteerId);
    setVolActionError(null);
    setVolActionSuccess(null);

    try {
      const { data, error } = await supabase.rpc('decide_volunteer', {
        p_volunteer_id: volunteerId,
        p_decision: decision,
      });

      if (error) {
        setVolActionError(error.message);
        return;
      }

      setVolActionSuccess(`Applicant marked as ${decision}. New accepted total: ${data}`);
      await loadData(true);
    } catch (err: any) {
      setVolActionError(err?.message || 'Failed to update volunteer decision.');
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
      // Search
      const q = regSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.student_email.toLowerCase().includes(q) ||
        (r.student_name && r.student_name.toLowerCase().includes(q)) ||
        (r.roll_no && r.roll_no.toLowerCase().includes(q));

      if (!matchSearch) return false;

      // Status Filter
      if (regFilter === 'confirmed') return r.status === 'confirmed';
      if (regFilter === 'waitlisted') return r.status === 'waitlisted';
      if (regFilter === 'scanned') return r.status === 'confirmed' && r.checked_in_at !== null;
      return true;
    });
  }, [registrations, regSearch, regFilter]);

  if (loading || !event) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#A4161A]" />
        <div className="text-xs text-neutral-500">Loading host dashboard...</div>
      </div>
    );
  }

  const hall = event.halls;
  const startD = new Date(event.start_time);
  const endD = new Date(event.end_time);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link
              href="/organizer"
              className="mt-1 flex h-8 w-8 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors shrink-0"
              title="Back to My Events"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Host Dashboard
                </span>

                {isApprover && !isOwner && (
                  <span className="inline-flex items-center rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    Read-Only Approver View
                  </span>
                )}

                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold ${
                    event.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : event.status === 'submitted'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : event.status === 'rejected'
                      ? 'bg-red-100 text-[#991B1B] border border-red-300'
                      : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
                  }`}
                >
                  {event.status.toUpperCase()}
                </span>

                <span className="text-[11px] text-neutral-500 font-mono">
                  Org: {event.organizations?.name || event.club_or_dept || 'Standalone'}
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                {event.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 pt-0.5">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                  {hall?.name || 'Campus Venue'} {hall?.capacity ? `(${hall.capacity} capacity)` : ''}
                </span>
                <span className="flex items-center gap-1 font-mono text-[11px] text-neutral-500">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  {startD.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} •{' '}
                  {startD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} –{' '}
                  {endD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {event.status === 'approved' && (
              <>
                <Link
                  href={`/organizer/scan/${event.id}`}
                  className="inline-flex items-center gap-1.5 rounded bg-[#A4161A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
                >
                  <Camera className="h-3.5 w-3.5" /> Live Scanner
                </Link>

                <Link
                  href={`/organizer/events/${event.id}/od`}
                  className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> OD Roster
                </Link>
              </>
            )}

            <Link
              href={`/organizer/events/${event.id}/insights`}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <TrendingUp className="h-3.5 w-3.5 text-[#A4161A]" /> Insights
            </Link>

            {isOwner && (
              <button
                onClick={() => setEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit Event
              </button>
            )}

            <button
              onClick={() => loadData(false)}
              className="rounded border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
              title="Refresh dashboard"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Primary Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-200">
          <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-3">
            <div className="text-[11px] font-medium text-neutral-500">Confirmed Attendees</div>
            <div className="text-xl font-bold text-neutral-900 mt-0.5">{metrics.confirmedCount}</div>
            <div className="text-[10px] text-neutral-500">of {hall?.capacity || 'N/A'} venue capacity</div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
            <div className="text-[11px] font-medium text-amber-800">Waitlisted Students</div>
            <div className="text-xl font-bold text-amber-900 mt-0.5">{metrics.waitlistedCount}</div>
            <div className="text-[10px] text-amber-700">Auto-promoted on cancellation</div>
          </div>

          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="text-[11px] font-medium text-emerald-800">Scanned &amp; Verified</div>
            <div className="text-xl font-bold text-emerald-900 mt-0.5">{metrics.scannedCount}</div>
            <div className="text-[10px] text-emerald-700">
              {metrics.confirmedCount > 0
                ? `${Math.round((metrics.scannedCount / metrics.confirmedCount) * 100)}% attendance rate`
                : 'Awaiting event check-in'}
            </div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-3">
            <div className="text-[11px] font-medium text-neutral-500">Volunteers Accepted</div>
            <div className="text-xl font-bold text-neutral-900 mt-0.5">
              {metrics.acceptedVolsCount} <span className="text-xs font-normal text-neutral-500">/ {metrics.neededVols}</span>
            </div>
            <div className="text-[10px] text-neutral-500">
              {metrics.pendingVolsCount > 0 ? (
                <span className="font-semibold text-amber-700">{metrics.pendingVolsCount} pending review</span>
              ) : (
                'All applications decided'
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-200 pt-2 -mb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#A4161A] text-[#A4161A]'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Overview
          </button>

          <button
            onClick={() => setActiveTab('registrations')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'registrations'
                ? 'border-[#A4161A] text-[#A4161A]'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Registrations ({registrations.length})
          </button>

          <button
            onClick={() => setActiveTab('volunteers')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'volunteers'
                ? 'border-[#A4161A] text-[#A4161A]'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>Volunteers ({volunteers.length})</span>
            {metrics.pendingVolsCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-bold text-white">
                {metrics.pendingVolsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'attendance'
                ? 'border-[#A4161A] text-[#A4161A]'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Attendance &amp; OD
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Approval Progress Tracker */}
          <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-neutral-900">Approval Workflow Progress</h2>
            <ApprovalTracker event={event} approvals={event.approvals || []} />
          </div>

          {/* Rejection notice if applicable */}
          {event.status === 'rejected' && event.rejection_reason && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-[#991B1B] flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-[#991B1B] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-sm">Event Proposal Rejected</span>
                <p>{event.rejection_reason}</p>
                <button
                  onClick={() => setEditModalOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded bg-[#A4161A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#851215]"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit and Resubmit Proposal
                </button>
              </div>
            </div>
          )}

          {/* Event Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-3 text-xs">
              <h2 className="text-sm font-bold text-neutral-900">Event Overview</h2>
              <p className="text-neutral-600 leading-relaxed whitespace-pre-line">
                {event.description || 'No description provided.'}
              </p>

              <div className="pt-2 border-t border-neutral-100 space-y-2 text-neutral-700">
                <div className="flex justify-between">
                  <span className="font-semibold">Organizer Email:</span>
                  <span className="font-mono">{event.organizer_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Organizer Type:</span>
                  <span className="capitalize">{event.organizer_type || 'Standalone'}</span>
                </div>
                {event.registration_link && (
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">External Link:</span>
                    <a
                      href={event.registration_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#A4161A] hover:underline flex items-center gap-1"
                    >
                      Registration Portal <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-3 text-xs">
              <h2 className="text-sm font-bold text-neutral-900">Venue &amp; Logistics</h2>
              <div className="space-y-2 text-neutral-700">
                <div className="flex justify-between">
                  <span className="font-semibold">Allocated Venue:</span>
                  <span>{hall?.name || 'Pending assignment'}</span>
                </div>
                {event.requested_hall && event.requested_hall.id !== hall?.id && (
                  <div className="flex justify-between text-neutral-500">
                    <span>Originally Requested:</span>
                    <span>{event.requested_hall.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-semibold">Venue Capacity:</span>
                  <span>{hall?.capacity || 'N/A'} seats</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Volunteers Required:</span>
                  <span>{event.volunteers_needed || 0} students</span>
                </div>
              </div>

              {event.status === 'approved' && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 flex items-start gap-2 mt-4">
                  <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    Note: Changing venue or schedule on an approved event resets status to submitted for re-approval.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REGISTRATIONS */}
      {activeTab === 'registrations' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search attendee by name, roll no, or email..."
                value={regSearch}
                onChange={(e) => setRegSearch(e.target.value)}
                className="w-full rounded border border-neutral-300 bg-white pl-9 pr-3 py-1.5 text-xs text-neutral-900 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setRegFilter('all')}
                className={`px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                  regFilter === 'all'
                    ? 'border-[#A4161A] bg-[#A4161A] text-white font-semibold'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                All ({registrations.length})
              </button>
              <button
                onClick={() => setRegFilter('confirmed')}
                className={`px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                  regFilter === 'confirmed'
                    ? 'border-emerald-600 bg-emerald-600 text-white font-semibold'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                Confirmed ({metrics.confirmedCount})
              </button>
              <button
                onClick={() => setRegFilter('waitlisted')}
                className={`px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                  regFilter === 'waitlisted'
                    ? 'border-amber-600 bg-amber-600 text-white font-semibold'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                Waitlist ({metrics.waitlistedCount})
              </button>
              <button
                onClick={() => setRegFilter('scanned')}
                className={`px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                  regFilter === 'scanned'
                    ? 'border-blue-600 bg-blue-600 text-white font-semibold'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                Scanned ({metrics.scannedCount})
              </button>
            </div>
          </div>

          {/* Attendee Table */}
          <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs">
              <thead className="bg-neutral-50 font-semibold text-neutral-700">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Roll Number</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Registration Status</th>
                  <th className="px-4 py-3">Check-In Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                      No registrations found matching the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map((reg) => {
                    const isWaitlisted = reg.status === 'waitlisted';
                    const isScanned = !!reg.checked_in_at;

                    return (
                      <tr key={reg.id} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-3 font-medium text-neutral-900">
                          {reg.student_name || reg.student_email.split('@')[0]}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-neutral-600">
                          {reg.roll_no || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-neutral-600 font-mono text-[11px]">
                          {reg.student_email}
                        </td>
                        <td className="px-4 py-3">
                          {isWaitlisted ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              <Hourglass className="h-3 w-3" /> Waitlisted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                              <CheckCircle2 className="h-3 w-3" /> Confirmed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isScanned ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium font-mono">
                              <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                              {new Date(reg.checked_in_at!).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              })}
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[11px]">Pending scan</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: VOLUNTEERS */}
      {activeTab === 'volunteers' && (
        <div className="space-y-4">
          {/* Header & Soft Warning Banner */}
          <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <HandHelping className="h-4 w-4 text-[#A4161A]" />
                  Volunteer Applications
                </h2>
                <p className="text-xs text-neutral-500">
                  Accepted {metrics.acceptedVolsCount} of {metrics.neededVols} needed volunteers
                </p>
              </div>

              <div className="text-xs">
                {metrics.neededVols === 0 ? (
                  <span className="text-neutral-500">This event does not have volunteers requested.</span>
                ) : metrics.acceptedVolsCount >= metrics.neededVols ? (
                  <span className="rounded bg-amber-100 border border-amber-300 px-2.5 py-1 text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                    Volunteer quota filled ({metrics.acceptedVolsCount}/{metrics.neededVols})
                  </span>
                ) : (
                  <span className="rounded bg-emerald-100 border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-900">
                    {metrics.neededVols - metrics.acceptedVolsCount} more needed
                  </span>
                )}
              </div>
            </div>

            {/* Error / Success Feedback */}
            {volActionError && (
              <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-[#991B1B] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0" />
                <span>{volActionError}</span>
              </div>
            )}

            {volActionSuccess && (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>{volActionSuccess}</span>
              </div>
            )}
          </div>

          {/* Volunteers Table */}
          <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs">
              <thead className="bg-neutral-50 font-semibold text-neutral-700">
                <tr>
                  <th className="px-4 py-3">Applicant Name</th>
                  <th className="px-4 py-3">Roll Number</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Applied At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {volunteers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      No volunteer applications submitted yet.
                    </td>
                  </tr>
                ) : (
                  volunteers.map((vol) => {
                    const isPending = vol.status === 'pending';
                    const isAccepted = vol.status === 'accepted';
                    const isRejected = vol.status === 'rejected';
                    const isWithdrawn = vol.status === 'withdrawn';
                    const isBusy = volActionLoadingId === vol.id;

                    return (
                      <tr key={vol.id} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-3 font-medium text-neutral-900">{vol.name}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-neutral-600">
                          {vol.roll_no || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-neutral-600 font-mono text-[11px]">
                          {vol.email}
                        </td>
                        <td className="px-4 py-3 text-neutral-500 text-[11px] font-mono">
                          {new Date(vol.applied_at).toLocaleDateString()} •{' '}
                          {new Date(vol.applied_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          {isAccepted ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                              <CheckCircle2 className="h-3 w-3" /> Accepted
                            </span>
                          ) : isRejected ? (
                            <span className="inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] font-semibold text-[#991B1B]">
                              <XCircle className="h-3 w-3" /> Rejected
                            </span>
                          ) : isWithdrawn ? (
                            <span className="inline-flex items-center gap-1 rounded bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                              Withdrawn
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              <Clock className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isOwner && !isWithdrawn && (
                            <div className="flex items-center justify-end gap-1.5">
                              {!isAccepted && (
                                <button
                                  onClick={() => handleDecideVolunteer(vol.id, 'accepted')}
                                  disabled={isBusy}
                                  className="rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                                >
                                  {isBusy ? '...' : 'Accept'}
                                </button>
                              )}

                              {!isRejected && (
                                <button
                                  onClick={() => handleDecideVolunteer(vol.id, 'rejected')}
                                  disabled={isBusy}
                                  className="rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-[#991B1B] hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                                >
                                  {isBusy ? '...' : 'Reject'}
                                </button>
                              )}

                              {(isAccepted || isRejected) && (
                                <button
                                  onClick={() => handleDecideVolunteer(vol.id, 'pending')}
                                  disabled={isBusy}
                                  className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
                                  title="Move back to pending review"
                                >
                                  Reset
                                </button>
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
          </div>
        </div>
      )}

      {/* TAB 4: ATTENDANCE & OD */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Scanner Launch Card */}
            <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Camera className="h-4 w-4 text-[#A4161A]" />
                  Live Attendance Check-In
                </h2>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
                  Camera QR
                </span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Open the live check-in scanner on mobile or laptop. Organizers and accepted student volunteers can scan attendee passes.
              </p>
              <div className="pt-2">
                <Link
                  href={`/organizer/scan/${event.id}`}
                  className="inline-flex items-center gap-2 rounded bg-[#A4161A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
                >
                  <Camera className="h-4 w-4" /> Open Attendance Scanner
                </Link>
              </div>
            </div>

            {/* OD Attendance CSV Export Card */}
            <div className="rounded-md border border-neutral-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                  On-Duty (OD) Export
                </h2>
                <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                  CSV Export
                </span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Download the complete attendance roster formatted for college administration and department on-duty submissions.
              </p>
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  onClick={handleDownloadAttendanceCSV}
                  className="inline-flex items-center gap-2 rounded border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  <Download className="h-4 w-4 text-[#A4161A]" /> Download CSV Now
                </button>
                <Link
                  href={`/organizer/events/${event.id}/od`}
                  className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  Open Dedicated OD Page
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Form Modal */}
      {editModalOpen && (
        <EventFormModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSaved={async () => {
            setEditModalOpen(false);
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
