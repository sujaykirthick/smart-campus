'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, AllowedUser, Fest, PublicHallBooking, Organization, OrganizationMember, CourseCodeDepartment } from '@/lib/types';
import ApprovalTracker from '@/components/ApprovalTracker';
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
  Layers,
  Lock,
  Edit,
  Save,
  AlertCircle,
  Users,
  UserPlus,
  Trash2,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

export default function ApprovalsPage() {
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [bookings, setBookings] = useState<PublicHallBooking[]>([]);
  const [fests, setFests] = useState<Fest[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);
  const [courseCodeDepts, setCourseCodeDepts] = useState<CourseCodeDepartment[]>([]);
  const [allAllowedUsers, setAllAllowedUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'decided' | 'fests' | 'organizers'>('pending');

  // Stage filter (defaults to role's stage, but can switch)
  const [selectedStage, setSelectedStage] = useState<'all' | 'student_affairs' | 'event_office' | 'cd'>('all');

  // Reject Dialog state
  const [rejectingEvent, setRejectingEvent] = useState<CampusEvent | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  // Event Office Venue Override State per event ID
  const [venueChanges, setVenueChanges] = useState<Record<string, { hallId: string; note: string }>>({});
  const [savingVenueId, setSavingVenueId] = useState<string | null>(null);
  const [venueSuccessMsg, setVenueSuccessMsg] = useState<{ id: string; message: string } | null>(null);

  // Fest Management State
  const [newFestName, setNewFestName] = useState('');
  const [newFestStart, setNewFestStart] = useState('');
  const [newFestEnd, setNewFestEnd] = useState('');
  const [newFestActive, setNewFestActive] = useState(false);
  const [creatingFest, setCreatingFest] = useState(false);
  const [festError, setFestError] = useState<string | null>(null);
  const [festSuccess, setFestSuccess] = useState<string | null>(null);

  // Organizers Management State
  const [newMemberInputs, setNewMemberInputs] = useState<Record<string, { email: string; role: 'lead' | 'member' }>>({});
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);
  const [memberActionMsg, setMemberActionMsg] = useState<{ id: string; type: 'error' | 'success'; text: string } | null>(null);

  // Course Code Mapping State
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseDeptId, setNewCourseDeptId] = useState('');
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingMsg, setMappingMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [profileRes, eventsRes, hallsRes, bookingsRes, festsRes, orgsRes, membersRes, ccdRes, allowedUsersRes] = await Promise.all([
        supabase.from('allowed_users').select('*').eq('email', user.email).maybeSingle(),
        supabase
          .from('events')
          .select('*, halls:halls!events_hall_id_fkey(id, name, capacity, location), requested_hall:halls!events_requested_hall_id_fkey(id, name, capacity, location), fests(id, name, is_active), organizations(id, name, type), approvals:event_approvals(*)')
          .in('status', ['submitted', 'approved', 'rejected'])
          .order('created_at', { ascending: false }),
        supabase.from('halls').select('*').order('name', { ascending: true }),
        supabase.from('public_hall_bookings').select('*'),
        supabase.from('fests').select('*').order('created_at', { ascending: false }),
        supabase.from('organizations').select('*').order('name', { ascending: true }),
        supabase.from('organization_members').select('*').order('created_at', { ascending: true }),
        supabase.from('course_code_departments').select('*, organizations(id, name, type)').order('course_code', { ascending: true }),
        supabase.from('allowed_users').select('*').order('name', { ascending: true }),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        // Default stage tab by role
        if (profileRes.data.role === 'event_office') {
          setSelectedStage('event_office');
        } else if (profileRes.data.role === 'cd') {
          setSelectedStage('cd');
        } else if (profileRes.data.role === 'affairs' || profileRes.data.role === 'student_affairs') {
          setSelectedStage('student_affairs');
        }
      }

      if (eventsRes.data) {
        setEvents(eventsRes.data as CampusEvent[]);
      }

      if (hallsRes.data) {
        setHalls(hallsRes.data);
      }

      if (bookingsRes.data) {
        setBookings(bookingsRes.data);
      }

      if (festsRes.data) {
        setFests(festsRes.data);
      }

      if (orgsRes.data) {
        setOrganizations(orgsRes.data as Organization[]);
      }

      if (membersRes.data) {
        setOrgMembers(membersRes.data as OrganizationMember[]);
      }

      if (ccdRes.data) {
        setCourseCodeDepts(ccdRes.data as CourseCodeDepartment[]);
      }

      if (allowedUsersRes.data) {
        setAllAllowedUsers(allowedUsersRes.data as AllowedUser[]);
      }
    } catch (err) {
      console.error('Error loading approvals queue:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler: Add Club Member
  const handleAddClubMember = async (clubId: string) => {
    const input = newMemberInputs[clubId];
    const email = input?.email?.trim().toLowerCase();
    const role = input?.role || 'member';

    if (!email) {
      setMemberActionMsg({ id: clubId, type: 'error', text: 'Please enter a student or faculty email.' });
      return;
    }

    setMemberActionLoading(clubId);
    setMemberActionMsg(null);

    try {
      const { error } = await supabase.rpc('add_club_member', {
        p_org_id: clubId,
        p_email: email,
        p_member_role: role,
      });

      if (error) {
        setMemberActionMsg({ id: clubId, type: 'error', text: error.message });
        return;
      }

      setMemberActionMsg({ id: clubId, type: 'success', text: `Added ${email} (${role}) to club.` });
      setNewMemberInputs({ ...newMemberInputs, [clubId]: { email: '', role: 'member' } });
      loadData();
    } catch (err: any) {
      setMemberActionMsg({ id: clubId, type: 'error', text: err?.message || 'Failed to add club member.' });
    } finally {
      setMemberActionLoading(null);
    }
  };

  // Handler: Change Club Member Role
  const handleChangeMemberRole = async (clubId: string, memberEmail: string, currentRole: 'lead' | 'member') => {
    const cleanEmail = memberEmail.trim().toLowerCase();
    const newRole = currentRole === 'lead' ? 'member' : 'lead';
    setMemberActionLoading(`${clubId}-${cleanEmail}`);
    setMemberActionMsg(null);

    try {
      const { error } = await supabase.rpc('set_club_member_role', {
        p_org_id: clubId,
        p_email: cleanEmail,
        p_member_role: newRole,
      });

      if (error) {
        setMemberActionMsg({ id: clubId, type: 'error', text: error.message });
        return;
      }

      setMemberActionMsg({ id: clubId, type: 'success', text: `Updated ${cleanEmail} role to ${newRole}.` });
      loadData();
    } catch (err: any) {
      setMemberActionMsg({ id: clubId, type: 'error', text: err?.message || 'Failed to update member role.' });
    } finally {
      setMemberActionLoading(null);
    }
  };

  // Handler: Remove Club Member
  const handleRemoveClubMember = async (clubId: string, memberEmail: string) => {
    const cleanEmail = memberEmail.trim().toLowerCase();
    if (!confirm(`Are you sure you want to remove ${cleanEmail} from this club?`)) return;

    setMemberActionLoading(`${clubId}-${cleanEmail}`);
    setMemberActionMsg(null);

    try {
      const { error } = await supabase.rpc('remove_club_member', {
        p_org_id: clubId,
        p_email: cleanEmail,
      });

      if (error) {
        setMemberActionMsg({ id: clubId, type: 'error', text: error.message });
        return;
      }

      setMemberActionMsg({ id: clubId, type: 'success', text: `Removed ${cleanEmail} from club.` });
      loadData();
    } catch (err: any) {
      setMemberActionMsg({ id: clubId, type: 'error', text: err?.message || 'Failed to remove member.' });
    } finally {
      setMemberActionLoading(null);
    }
  };

  // Handler: Add / Update Course Code Department Mapping
  const handleAddCourseCodeMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCourseCode.trim().toLowerCase();
    if (!code || !newCourseDeptId) {
      setMappingMsg({ type: 'error', text: 'Course code and department are required.' });
      return;
    }

    setMappingLoading(true);
    setMappingMsg(null);

    try {
      const { error } = await supabase.from('course_code_departments').upsert({
        course_code: code,
        organization_id: newCourseDeptId,
      }, { onConflict: 'course_code' });

      if (error) throw error;

      setMappingMsg({ type: 'success', text: `Mapping saved for course code "${code}".` });
      setNewCourseCode('');
      setNewCourseDeptId('');
      loadData();
    } catch (err: any) {
      setMappingMsg({ type: 'error', text: err?.message || 'Failed to save mapping.' });
    } finally {
      setMappingLoading(false);
    }
  };

  // Handler: Delete Course Code Mapping
  const handleDeleteCourseCodeMapping = async (code: string) => {
    if (!confirm(`Are you sure you want to delete course code mapping "${code}"?`)) return;

    setMappingLoading(true);
    setMappingMsg(null);

    try {
      const { error } = await supabase.from('course_code_departments').delete().eq('course_code', code);
      if (error) throw error;

      setMappingMsg({ type: 'success', text: `Deleted course code mapping "${code}".` });
      loadData();
    } catch (err: any) {
      setMappingMsg({ type: 'error', text: err?.message || 'Failed to delete mapping.' });
    } finally {
      setMappingLoading(false);
    }
  };

  // Compute free halls for a given event's time interval
  const getFreeHallsForEvent = useCallback(
    (event: CampusEvent) => {
      const eventStart = new Date(event.start_time).getTime();
      const eventEnd = new Date(event.end_time).getTime();

      return halls.filter((hall) => {
        // Find if any booking for this hall overlaps and is locked
        const hasOverlap = bookings.some((b) => {
          if (b.hall_id !== hall.id) return false;
          // Ignore the current event itself
          if (b.event_id && b.event_id === event.id) return false;

          const bStart = new Date(b.start_time).getTime();
          const bEnd = new Date(b.end_time).getTime();

          const overlaps = eventStart < bEnd && eventEnd > bStart;
          const isLocked = b.status === 'booked' || b.status === 'approved' || b.approval_stage === 'cd';
          return overlaps && isLocked;
        });

        return !hasOverlap;
      });
    },
    [halls, bookings]
  );

  // Handle Venue Override Save (calls set_event_venue)
  const handleSaveVenue = async (eventId: string) => {
    const change = venueChanges[eventId];
    if (!change || !change.hallId) return;

    setSavingVenueId(eventId);
    setActionError(null);
    setVenueSuccessMsg(null);

    try {
      const { error } = await supabase.rpc('set_event_venue', {
        p_event_id: eventId,
        p_hall_id: change.hallId,
        p_note: change.note?.trim() || null,
      });

      if (error) {
        setActionError({ id: eventId, message: error.message });
        return;
      }

      setVenueSuccessMsg({ id: eventId, message: 'Venue successfully updated.' });
      loadData();
    } catch (err) {
      console.error('Error saving venue:', err);
      setActionError({
        id: eventId,
        message: err instanceof Error ? err.message : 'Failed to update venue.',
      });
    } finally {
      setSavingVenueId(null);
    }
  };

  // Handle Approve (calls decide_event)
  const handleApprove = async (event: CampusEvent) => {
    setProcessingId(event.id);
    setActionError(null);
    setVenueSuccessMsg(null);

    try {
      const { data, error } = await supabase.rpc('decide_event', {
        p_event_id: event.id,
        p_decision: 'approved',
        p_reason: null,
      });

      if (error) {
        let customMsg = error.message;
        if (
          error.message.includes('already booked for that time by another event') ||
          error.message.includes('events_hall_time_no_overlap') ||
          error.message.includes('exclusion')
        ) {
          customMsg =
            'This hall is already booked for that time by another event. Please change the venue and approve again.';
        }
        setActionError({ id: event.id, message: customMsg });
        return;
      }

      loadData();
    } catch (err) {
      console.error('Error approving event:', err);
      setActionError({
        id: event.id,
        message: err instanceof Error ? err.message : 'Failed to approve event.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject (calls decide_event)
  const handleConfirmReject = async () => {
    if (!rejectingEvent) return;
    if (!rejectionReason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }

    setProcessingId(rejectingEvent.id);
    setActionError(null);

    try {
      const { error } = await supabase.rpc('decide_event', {
        p_event_id: rejectingEvent.id,
        p_decision: 'rejected',
        p_reason: rejectionReason.trim(),
      });

      if (error) {
        setActionError({ id: rejectingEvent.id, message: error.message });
        return;
      }

      setRejectingEvent(null);
      setRejectionReason('');
      loadData();
    } catch (err) {
      console.error('Error rejecting event:', err);
      setActionError({
        id: rejectingEvent.id,
        message: err instanceof Error ? err.message : 'Failed to reject event.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Toggle Fest Active/Inactive
  const handleToggleFest = async (festId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('fests')
        .update({ is_active: !currentStatus })
        .eq('id', festId);

      if (error) throw error;
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update fest status.');
    }
  };

  // Create New Fest
  const handleCreateFest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFestName.trim()) {
      setFestError('Fest name is required.');
      return;
    }

    setCreatingFest(true);
    setFestError(null);
    setFestSuccess(null);

    try {
      const { error } = await supabase.from('fests').insert({
        name: newFestName.trim(),
        is_active: newFestActive,
        start_date: newFestStart || null,
        end_date: newFestEnd || null,
      });

      if (error) throw error;

      setFestSuccess(`Fest "${newFestName.trim()}" created successfully!`);
      setNewFestName('');
      setNewFestStart('');
      setNewFestEnd('');
      setNewFestActive(false);
      loadData();
    } catch (err: unknown) {
      setFestError(err instanceof Error ? err.message : 'Failed to create fest.');
    } finally {
      setCreatingFest(false);
    }
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  };

  const roleTitle = useMemo(() => {
    switch (profile?.role) {
      case 'event_office':
        return 'Campus Event Office';
      case 'cd':
        return 'Campus Director Office';
      case 'affairs':
      case 'student_affairs':
      default:
        return 'Student Welfare Directorate';
    }
  }, [profile?.role]);

  // Filter events based on active tab and stage
  const pendingEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.status !== 'submitted') return false;
      const stage = e.approval_stage || 'student_affairs';
      if (selectedStage === 'all') return true;
      return stage === selectedStage;
    });
  }, [events, selectedStage]);

  const decidedEvents = useMemo(() => {
    return events.filter((e) => e.status === 'approved' || e.status === 'rejected');
  }, [events]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header Banner */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#A4161A] text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
                  {roleTitle}
                </h1>
                <span className="rounded bg-red-50 text-[#A4161A] border border-red-200 px-2 py-0.5 text-xs font-semibold">
                  Approval Queue
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm text-neutral-500">
                Multi-stage review chain: Student Welfare → Event Office → Campus Director
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Queue
            </button>
          </div>
        </div>
      </div>

      {/* Main Tabs: Queue vs Decided vs Fests */}
      <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`rounded px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-[#A4161A] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            Pending Review ({pendingEvents.length})
          </button>

          <button
            onClick={() => setActiveTab('decided')}
            className={`rounded px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'decided'
                ? 'bg-[#A4161A] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            Decided History ({decidedEvents.length})
          </button>

          <button
            onClick={() => setActiveTab('fests')}
            className={`rounded px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'fests'
                ? 'bg-[#A4161A] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            Fests Management ({fests.length})
          </button>

          {(profile?.role === 'student_affairs' || profile?.role === 'affairs') && (
            <button
              onClick={() => setActiveTab('organizers')}
              className={`rounded px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'organizers'
                  ? 'bg-[#A4161A] text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              Organizers (Clubs &amp; Depts)
            </button>
          )}
        </div>

        {/* Stage Filter Buttons if in Pending tab */}
        {activeTab === 'pending' && (
          <div className="hidden sm:flex items-center gap-1 text-xs">
            <span className="text-neutral-400 mr-1 text-[11px]">Stage:</span>
            {(['all', 'student_affairs', 'event_office', 'cd'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStage(st)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                  selectedStage === st
                    ? 'bg-neutral-900 text-white font-bold'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {st === 'all'
                  ? 'All Stages'
                  : st === 'student_affairs'
                  ? '1. Welfare'
                  : st === 'event_office'
                  ? '2. Event Office'
                  : '3. CD'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TAB CONTENT: PENDING REVIEW */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200"
                />
              ))}
            </div>
          ) : pendingEvents.length === 0 ? (
            <div className="rounded-md border border-neutral-200 bg-white p-12 text-center shadow-xs">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <h3 className="mt-3 text-base font-semibold text-neutral-900">Queue is Clear</h3>
              <p className="mt-1 text-xs text-neutral-500">
                No event proposals currently awaiting decision at the selected stage.
              </p>
            </div>
          ) : (
            pendingEvents.map((event) => {
              const startFmt = formatDateTime(event.start_time);
              const endFmt = formatDateTime(event.end_time);
              const currentHall = halls.find((h) => h.id === event.hall_id) || event.halls;
              const requestedHall =
                halls.find((h) => h.id === (event.requested_hall_id || event.hall_id)) ||
                event.requested_hall ||
                currentHall;
              const stage = event.approval_stage || 'student_affairs';

              const freeHalls = getFreeHallsForEvent(event);
              const changeState = venueChanges[event.id] || {
                hallId: event.hall_id,
                note: '',
              };
              const selectedOverrideHall = halls.find((h) => h.id === changeState.hallId);
              const capacityLowerWarning =
                selectedOverrideHall &&
                requestedHall &&
                selectedOverrideHall.capacity < requestedHall.capacity;

              const isEventOfficeStage = stage === 'event_office';
              const canRoleDecide =
                (profile?.role === 'student_affairs' || profile?.role === 'affairs') &&
                stage === 'student_affairs'
                  ? true
                  : profile?.role === 'event_office' && stage === 'event_office'
                  ? true
                  : profile?.role === 'cd' && stage === 'cd'
                  ? true
                  : profile?.role === 'affairs'; // fallback admin

              return (
                <div
                  key={event.id}
                  className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs"
                >
                  <div className="p-5 sm:p-6 space-y-4">
                    {/* Top Row: Event Meta + Stage Badge */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-neutral-200 pb-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 text-xs font-semibold">
                            Stage: {stage === 'student_affairs' ? '1. Student Welfare' : stage === 'event_office' ? '2. Event Office' : '3. Campus Director (CD)'}
                          </span>
                          {event.fests && (
                            <span className="rounded bg-neutral-100 text-neutral-800 px-2 py-0.5 text-xs font-medium">
                              Fest: {event.fests.name}
                            </span>
                          )}
                          <span className="text-xs text-neutral-600 font-medium">
                            Organized by:{' '}
                            <strong className="text-neutral-900">
                              {event.organizations?.name || event.club_or_dept || (event.organizer_type === 'standalone' ? 'Standalone' : 'Campus Event')}
                            </strong>{' '}
                            <span className="text-neutral-400 font-mono">({event.organizer_email})</span>
                          </span>
                        </div>
                        <h2 className="text-lg font-bold text-neutral-900">{event.title}</h2>
                      </div>

                      {/* Schedule info */}
                      <div className="text-xs text-neutral-600 sm:text-right font-mono bg-neutral-50 sm:bg-transparent p-2 sm:p-0 rounded">
                        <div className="font-semibold text-neutral-900">{startFmt.date}</div>
                        <div>
                          {startFmt.time} – {endFmt.time}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {event.description && (
                      <p className="text-xs text-neutral-600">{event.description}</p>
                    )}

                    {/* Venue Details Box */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-neutral-50 p-3.5 rounded border border-neutral-200">
                      <div>
                        <div className="font-semibold text-neutral-700 flex items-center gap-1.5 mb-1">
                          <Building2 className="h-4 w-4 text-[#A4161A]" />
                          <span>Venue Allocation</span>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-neutral-900 font-bold">
                            Current Hall: {currentHall?.name || 'Unassigned'} ({currentHall?.capacity || 0} seats)
                          </div>
                          {requestedHall && requestedHall.id !== currentHall?.id && (
                            <div className="text-neutral-500 text-[11px]">
                              Originally Requested: {requestedHall.name} ({requestedHall.capacity} seats)
                            </div>
                          )}
                          <div className="text-neutral-500 text-[11px]">
                            Location: {currentHall?.location || 'Campus venue'}
                          </div>
                        </div>
                      </div>

                      {/* Approval Chain Stepper Inline */}
                      <div>
                        <ApprovalTracker event={event} approvals={event.approvals || []} />
                      </div>
                    </div>

                    {/* EVENT OFFICE VENUE OVERRIDE SECTION (Requirement 5) */}
                    {isEventOfficeStage && profile?.role === 'event_office' && (
                      <div className="rounded border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Edit className="h-4 w-4 text-blue-700" />
                            <span className="text-xs font-bold text-blue-900">
                              Event Office Venue Control
                            </span>
                          </div>
                          <span className="text-[11px] text-blue-700">
                            Requested: {requestedHall?.name} ({requestedHall?.capacity} seats)
                          </span>
                        </div>

                        {/* Error banner next to venue control if approval failed (Requirement 5) */}
                        {actionError && actionError.id === event.id && (
                          <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
                            <div>
                              <span className="font-bold">Booking Clash Error: </span>
                              <span>{actionError.message}</span>
                            </div>
                          </div>
                        )}

                        {/* Success notification */}
                        {venueSuccessMsg && venueSuccessMsg.id === event.id && (
                          <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
                            ✓ {venueSuccessMsg.message}
                          </div>
                        )}

                        {/* Capacity warning if chosen capacity < requested capacity */}
                        {capacityLowerWarning && (
                          <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                            <div>
                              <span className="font-semibold">Capacity Warning: </span>
                              <span>
                                The selected hall ({selectedOverrideHall?.name}, {selectedOverrideHall?.capacity} seats) has lower capacity than the requested hall ({requestedHall?.name}, {requestedHall?.capacity} seats).
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Dropdown of free halls for that time */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="sm:col-span-1">
                            <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                              Select Free Venue
                            </label>
                            <select
                              value={changeState.hallId}
                              onChange={(e) =>
                                setVenueChanges({
                                  ...venueChanges,
                                  [event.id]: { ...changeState, hallId: e.target.value },
                                })
                              }
                              className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A4161A] cursor-pointer"
                            >
                              {freeHalls.map((h) => (
                                <option key={h.id} value={h.id}>
                                  {h.name} ({h.capacity} seats) {h.id === event.hall_id ? ' [Current]' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                              <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                                Change Note (Optional)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Moved to larger hall for guest capacity"
                                value={changeState.note}
                                onChange={(e) =>
                                  setVenueChanges({
                                    ...venueChanges,
                                    [event.id]: { ...changeState, note: e.target.value },
                                  })
                                }
                                className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A4161A]"
                              />
                            </div>

                            <button
                              onClick={() => handleSaveVenue(event.id)}
                              disabled={savingVenueId === event.id || changeState.hallId === event.hall_id}
                              className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                            >
                              {savingVenueId === event.id ? 'Saving...' : 'Save Venue'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Error Banner if not in Event Office box */}
                    {actionError && actionError.id === event.id && !isEventOfficeStage && (
                      <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
                        <div>
                          <span className="font-bold">Error: </span>
                          <span>{actionError.message}</span>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="text-xs text-neutral-500">
                        {stage === 'cd'
                          ? 'Campus Director approval will reserve hall and publish live.'
                          : stage === 'event_office'
                          ? 'Event Office approval locks the hall slot and forwards to CD.'
                          : 'Student Welfare approval validates requirements and forwards to Event Office.'}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setRejectingEvent(event);
                            setRejectionReason('');
                          }}
                          disabled={processingId === event.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#991B1B] hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" /> Reject Event
                        </button>

                        <button
                          onClick={() => handleApprove(event)}
                          disabled={processingId === event.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#A4161A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {processingId === event.id
                            ? 'Processing...'
                            : stage === 'cd'
                            ? 'Final Approve (Publish)'
                            : 'Approve Stage'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB CONTENT: DECIDED HISTORY */}
      {activeTab === 'decided' && (
        <div className="space-y-3">
          {decidedEvents.length === 0 ? (
            <div className="rounded-md border border-neutral-200 bg-white p-12 text-center text-xs text-neutral-500">
              No historical decisions recorded yet.
            </div>
          ) : (
            decidedEvents.map((event) => {
              const startFmt = formatDateTime(event.start_time);
              const hall = halls.find((h) => h.id === event.hall_id) || event.halls;

              return (
                <div
                  key={event.id}
                  className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          event.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-[#991B1B] border border-red-200'
                        }`}
                      >
                        {event.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                      <h3 className="font-bold text-neutral-900 text-sm">{event.title}</h3>
                    </div>
                    <span className="text-xs text-neutral-500 font-mono">{startFmt.date}</span>
                  </div>

                  <div className="text-xs text-neutral-600 flex items-center gap-3">
                    <span>Venue: {hall?.name}</span>
                    <span>Organizer: {event.organizer_email}</span>
                  </div>

                  {event.rejection_reason && (
                    <div className="text-xs text-[#991B1B] bg-red-50 p-2 rounded border border-red-200">
                      Rejection Remarks: {event.rejection_reason}
                    </div>
                  )}

                  <ApprovalTracker event={event} approvals={event.approvals || []} />
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB CONTENT: FESTS MANAGEMENT */}
      {activeTab === 'fests' && (
        <div className="space-y-6">
          {/* Create New Fest Form */}
          <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-bold text-neutral-900 mb-1">Create New Campus Fest</h2>
            <p className="text-xs text-neutral-500 mb-4">
              Events submitted under an active fest will be grouped and badged automatically.
            </p>

            {festSuccess && (
              <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                {festSuccess}
              </div>
            )}
            {festError && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B]">
                {festError}
              </div>
            )}

            <form onSubmit={handleCreateFest} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fest Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pragyan 2026"
                    value={newFestName}
                    onChange={(e) => setNewFestName(e.target.value)}
                    className="w-full rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A4161A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newFestStart}
                    onChange={(e) => setNewFestStart(e.target.value)}
                    className="w-full rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A4161A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newFestEnd}
                    onChange={(e) => setNewFestEnd(e.target.value)}
                    className="w-full rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A4161A]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newFestActive}
                    onChange={(e) => setNewFestActive(e.target.checked)}
                    className="rounded border-neutral-300 text-[#A4161A] focus:ring-[#A4161A]"
                  />
                  <span className="text-xs font-medium text-neutral-700">
                    Set as active immediately (allow event proposals)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={creatingFest}
                  className="rounded bg-[#A4161A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer"
                >
                  {creatingFest ? 'Creating...' : 'Create Fest'}
                </button>
              </div>
            </form>
          </div>

          {/* Fests List */}
          <div className="rounded-md border border-neutral-200 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200 bg-neutral-50 font-bold text-xs text-neutral-800">
              Configured Campus Fests
            </div>
            <div className="divide-y divide-neutral-200">
              {fests.map((fest) => (
                <div key={fest.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-neutral-900">{fest.name}</div>
                    <div className="text-xs text-neutral-500 font-mono">
                      {fest.start_date || 'No start'} – {fest.end_date || 'No end'}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleFest(fest.id, fest.is_active)}
                    className={`rounded px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                      fest.is_active
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-300 hover:bg-neutral-200'
                    }`}
                  >
                    {fest.is_active ? 'Active (Click to Deactivate)' : 'Inactive (Click to Activate)'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: ORGANIZERS MANAGEMENT (CLUBS & DEPARTMENTS) */}
      {activeTab === 'organizers' && (
        <div className="space-y-8">
          {/* 1. CLUBS SECTION */}
          <div className="space-y-4">
            <div className="border-b border-neutral-200 pb-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#A4161A]" />
                <h2 className="text-base font-bold text-neutral-900">
                  Student Club Memberships
                </h2>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Manage club executive leads and student members. Only whitelisted demo students can be enrolled.
              </p>
            </div>

            {organizations.filter((o) => o.type === 'club').length === 0 ? (
              <div className="rounded-md border border-neutral-200 bg-white p-8 text-center text-xs text-neutral-500">
                No club organizations registered in the system yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {organizations
                  .filter((o) => o.type === 'club')
                  .map((club) => {
                    const members = orgMembers.filter((m) => m.organization_id === club.id);
                    const actionState = memberActionMsg?.id === club.id ? memberActionMsg : null;
                    const isClubLoading = memberActionLoading === club.id;
                    const inputState = newMemberInputs[club.id] || { email: '', role: 'member' };

                    return (
                      <div
                        key={club.id}
                        className="rounded-md border border-neutral-200 bg-white shadow-xs overflow-hidden"
                      >
                        {/* Club Header */}
                        <div className="p-4 sm:p-5 border-b border-neutral-200 bg-neutral-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-neutral-900">{club.name}</h3>
                              <span className="rounded bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">
                                {members.length} {members.length === 1 ? 'Member' : 'Members'}
                              </span>
                            </div>
                            {club.faculty_coordinator && (
                              <p className="text-xs text-neutral-500 mt-0.5">
                                Faculty Coordinator: <strong className="text-neutral-700">{club.faculty_coordinator}</strong>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Status Message Banner for this club */}
                        {actionState && (
                          <div
                            className={`m-4 rounded border p-3 text-xs flex items-start gap-2 ${
                              actionState.type === 'error'
                                ? 'border-red-200 bg-red-50 text-[#991B1B]'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            {actionState.type === 'error' ? (
                              <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
                            )}
                            <span>{actionState.text}</span>
                          </div>
                        )}

                        {/* Members Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 font-semibold">
                              <tr>
                                <th className="px-4 py-2.5">Member Name</th>
                                <th className="px-4 py-2.5">Email</th>
                                <th className="px-4 py-2.5 text-center">Role</th>
                                <th className="px-4 py-2.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {members.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-neutral-400 italic">
                                    No members enrolled yet for {club.name}.
                                  </td>
                                </tr>
                              ) : (
                                members.map((m) => {
                                  const userProfile = allAllowedUsers.find(
                                    (u) => u.email.toLowerCase() === m.email.toLowerCase()
                                  );
                                  const isOpLoading = memberActionLoading === `${club.id}-${m.email}`;

                                  return (
                                    <tr key={m.email} className="hover:bg-neutral-50 transition-colors">
                                      <td className="px-4 py-2.5 font-medium text-neutral-900">
                                        {userProfile?.name || 'Student'}
                                        {userProfile?.roll_no && (
                                          <div className="text-[11px] text-neutral-400 font-mono">
                                            {userProfile.roll_no}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 font-mono text-neutral-700">{m.email}</td>
                                      <td className="px-4 py-2.5 text-center">
                                        <span
                                          className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                                            m.member_role === 'lead'
                                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                              : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                                          }`}
                                        >
                                          {m.member_role}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-right space-x-2">
                                        <button
                                          onClick={() => handleChangeMemberRole(club.id, m.email, m.member_role)}
                                          disabled={isOpLoading}
                                          className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
                                        >
                                          Set as {m.member_role === 'lead' ? 'Member' : 'Lead'}
                                        </button>
                                        <button
                                          onClick={() => handleRemoveClubMember(club.id, m.email)}
                                          disabled={isOpLoading}
                                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-[#991B1B] hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                                        >
                                          <Trash2 className="h-3 w-3" /> Remove
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Add Member Form for this club */}
                        <div className="p-4 bg-neutral-50 border-t border-neutral-200">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleAddClubMember(club.id);
                            }}
                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs"
                          >
                            <input
                              type="email"
                              required
                              placeholder="Enter student email (e.g. student1@demo.edu)"
                              value={inputState.email}
                              onChange={(e) =>
                                setNewMemberInputs({
                                  ...newMemberInputs,
                                  [club.id]: { ...inputState, email: e.target.value },
                                })
                              }
                              className="flex-1 rounded border border-neutral-300 bg-white px-3 py-1.5 text-neutral-900 focus:outline-none focus:border-[#A4161A]"
                            />
                            <select
                              value={inputState.role}
                              onChange={(e) =>
                                setNewMemberInputs({
                                  ...newMemberInputs,
                                  [club.id]: {
                                    ...inputState,
                                    role: e.target.value as 'lead' | 'member',
                                  },
                                })
                              }
                              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-neutral-900 focus:outline-none focus:border-[#A4161A] cursor-pointer"
                            >
                              <option value="member">Member</option>
                              <option value="lead">Lead</option>
                            </select>
                            <button
                              type="submit"
                              disabled={isClubLoading || !inputState.email.trim()}
                              className="inline-flex items-center justify-center gap-1.5 rounded bg-[#A4161A] px-3.5 py-1.5 font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              {isClubLoading ? 'Adding...' : 'Add Member'}
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* 2. DEPARTMENTS SECTION */}
          <div className="space-y-6 pt-4 border-t border-neutral-200">
            <div>
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-[#A4161A]" />
                <h2 className="text-base font-bold text-neutral-900">
                  Academic Department Mappings &amp; Student Rosters
                </h2>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Department membership is derived automatically from student roll number course codes (e.g. &ldquo;cb.ps.i5das24049&rdquo; → course code &ldquo;i5das&rdquo; → Data Science &amp; AI).
              </p>
            </div>

            {/* Unmappable Students Warning Box (Prompt Requirement) */}
            {(() => {
              const students = allAllowedUsers.filter((u) => u.role === 'student');
              const unmappable = students
                .map((st) => {
                  if (!st.roll_no) {
                    return { student: st, reason: 'Missing roll number on user record' };
                  }
                  const parts = st.roll_no.trim().toLowerCase().split('.');
                  if (parts.length < 3) {
                    return { student: st, reason: `Invalid roll format (requires dot-separated syntax like cb.ps.i5das24049)` };
                  }
                  const part3 = parts[2];
                  if (!/^[a-z0-9]+[0-9]{5}$/.test(part3)) {
                    return { student: st, reason: `Unrecognized part3 syntax in roll "${st.roll_no}" (expected code+5 digits)` };
                  }
                  const code = part3.substring(0, part3.length - 5);
                  const mapped = courseCodeDepts.find((m) => m.course_code.toLowerCase() === code.toLowerCase());
                  if (!mapped) {
                    return { student: st, reason: `Course code "${code}" is not registered in course_code_departments mapping table` };
                  }
                  return null;
                })
                .filter(Boolean) as { student: AllowedUser; reason: string }[];

              if (unmappable.length === 0) return null;

              return (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    <span>Warning: {unmappable.length} Student(s) With Unmappable Roll Numbers</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    The following students cannot be mapped to any academic department because their roll number format is unrecognized or their course code is not registered in the mapping table below:
                  </p>
                  <div className="divide-y divide-amber-200 rounded border border-amber-200 bg-white">
                    {unmappable.map(({ student, reason }) => (
                      <div key={student.email} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <strong className="text-neutral-900">{student.name || 'Student'}</strong>{' '}
                          <span className="text-neutral-500 font-mono">({student.email})</span>
                          <div className="text-[11px] text-neutral-600 font-mono">
                            Roll No: {student.roll_no || '<None>'}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-[#991B1B] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                          {reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Course Code Department Mapping Editor (Prompt Requirement) */}
            <div className="rounded-md border border-neutral-200 bg-white shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Course Code Mapping Table Editor (course_code_departments)
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Defines which course code extracted from student roll numbers maps to which academic department.
                  </p>
                </div>
              </div>

              {mappingMsg && (
                <div
                  className={`rounded border p-3 text-xs flex items-center gap-2 ${
                    mappingMsg.type === 'error'
                      ? 'border-red-200 bg-red-50 text-[#991B1B]'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {mappingMsg.type === 'error' ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B]" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  )}
                  <span>{mappingMsg.text}</span>
                </div>
              )}

              {/* Add Mapping Form */}
              <form
                onSubmit={handleAddCourseCodeMapping}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-neutral-50 p-3 rounded border border-neutral-200 text-xs"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Course Code (e.g. i5das, u4cse)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. i5das"
                    value={newCourseCode}
                    onChange={(e) => setNewCourseCode(e.target.value)}
                    className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-neutral-900 font-mono focus:outline-none focus:border-[#A4161A]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Map to Department
                  </label>
                  <select
                    required
                    value={newCourseDeptId}
                    onChange={(e) => setNewCourseDeptId(e.target.value)}
                    className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-neutral-900 focus:outline-none focus:border-[#A4161A] cursor-pointer"
                  >
                    <option value="" disabled>
                      -- Select Department --
                    </option>
                    {organizations
                      .filter((o) => o.type === 'department')
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={mappingLoading || !newCourseCode.trim() || !newCourseDeptId}
                    className="w-full rounded bg-[#A4161A] px-3.5 py-1.5 font-semibold text-white hover:bg-[#851215] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {mappingLoading ? 'Saving...' : 'Save Course Mapping'}
                  </button>
                </div>
              </form>

              {/* Existing Mappings List */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
                    <tr>
                      <th className="px-4 py-2">Course Code</th>
                      <th className="px-4 py-2">Mapped Department</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {courseCodeDepts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-4 text-center text-xs text-neutral-400 italic">
                          No course code mappings configured.
                        </td>
                      </tr>
                    ) : (
                      courseCodeDepts.map((ccd) => {
                        const dept = organizations.find((o) => o.id === ccd.organization_id);
                        return (
                          <tr key={ccd.course_code} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-4 py-2 font-mono font-semibold text-neutral-900">
                              {ccd.course_code}
                            </td>
                            <td className="px-4 py-2 text-neutral-800">{dept?.name || 'Department'}</td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => handleDeleteCourseCodeMapping(ccd.course_code)}
                                disabled={mappingLoading}
                                className="inline-flex items-center gap-1 text-[11px] text-[#991B1B] hover:text-[#7f1d1d] transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Derived Student Rosters per Department */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-neutral-900">
                Mapped Students Per Department (Derived via Roll Numbers)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {organizations
                  .filter((o) => o.type === 'department')
                  .map((dept) => {
                    // Find all course codes mapped to this dept
                    const deptCodes = courseCodeDepts
                      .filter((c) => c.organization_id === dept.id)
                      .map((c) => c.course_code.toLowerCase());

                    // Find students whose roll numbers match
                    const deptStudents = allAllowedUsers.filter((u) => {
                      if (u.role !== 'student' || !u.roll_no) return false;
                      const parts = u.roll_no.toLowerCase().split('.');
                      if (parts.length < 3) return false;
                      const p3 = parts[2];
                      if (!/^[a-z0-9]+[0-9]{5}$/.test(p3)) return false;
                      const code = p3.substring(0, p3.length - 5);
                      return deptCodes.includes(code);
                    });

                    return (
                      <div
                        key={dept.id}
                        className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                          <div>
                            <h4 className="font-bold text-sm text-neutral-900">{dept.name}</h4>
                            <div className="text-[11px] text-neutral-400 font-mono">
                              Codes: {deptCodes.length > 0 ? deptCodes.join(', ') : 'None'}
                            </div>
                          </div>
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
                            {deptStudents.length} Students
                          </span>
                        </div>

                        {deptStudents.length === 0 ? (
                          <div className="text-xs text-neutral-400 italic py-2 text-center">
                            No students currently mapped to {dept.name}.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 divide-y divide-neutral-100">
                            {deptStudents.map((st) => (
                              <div key={st.email} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                                <div>
                                  <div className="font-medium text-neutral-900">{st.name || 'Student'}</div>
                                  <div className="text-[11px] text-neutral-400 font-mono">{st.email}</div>
                                </div>
                                <span className="font-mono text-[11px] text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                                  {st.roll_no}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-md rounded-md border border-neutral-200 bg-white p-6 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-neutral-900">
              Reject Event Proposal
            </h3>
            <p className="text-xs text-neutral-500">
              Provide feedback for &ldquo;{rejectingEvent.title}&rdquo;. The organizer will see this feedback to submit a revision.
            </p>

            <textarea
              rows={4}
              required
              placeholder="e.g. Hall clashes with University Convocation, please reschedule to next week."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:outline-none focus:border-[#A4161A]"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectingEvent(null)}
                className="rounded border border-neutral-300 px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={processingId === rejectingEvent.id || !rejectionReason.trim()}
                className="rounded bg-[#A4161A] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#851215] transition-colors cursor-pointer disabled:opacity-50"
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
