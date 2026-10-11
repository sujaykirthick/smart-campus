'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type {
  CampusEvent,
  Hall,
  AllowedUser,
  Fest,
  PublicHallBooking,
  Organization,
  OrganizationMember,
  CourseCodeDepartment,
} from '@/lib/types';
import ApprovalTracker from '@/components/ApprovalTracker';
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  Tabs,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import { formatEventDate, formatHall, formatSimpleDate } from '@/lib/format';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Users,
  UserPlus,
  Trash2,
  GraduationCap,
  Sparkles,
  AlertCircle,
  Clock,
  Layers,
  MapPin,
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

  // Main page tabs
  const [activeTab, setActiveTab] = useState<'pending' | 'decided' | 'organizers' | 'fests'>('pending');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('all');

  // Selected / Expanded Event ID for side detail or accordion
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Reject Modal state
  const [rejectingEvent, setRejectingEvent] = useState<CampusEvent | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  // Event Office Venue Override State
  const [venueChanges, setVenueChanges] = useState<Record<string, { hallId: string; note: string }>>({});
  const [savingVenueId, setSavingVenueId] = useState<string | null>(null);
  const [venueSuccessMsg, setVenueSuccessMsg] = useState<{ id: string; message: string } | null>(null);

  // Organizers Club Selector State (One club at a time)
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'lead' | 'member'>('member');
  const [memberActionLoading, setMemberActionLoading] = useState(false);
  const [memberActionMsg, setMemberActionMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Course Code Mapping State
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseDeptId, setNewCourseDeptId] = useState('');
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingMsg, setMappingMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Fest Management State
  const [newFestName, setNewFestName] = useState('');
  const [newFestStart, setNewFestStart] = useState('');
  const [newFestEnd, setNewFestEnd] = useState('');
  const [newFestActive, setNewFestActive] = useState(false);
  const [creatingFest, setCreatingFest] = useState(false);
  const [festMsg, setFestMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [
        profileRes,
        eventsRes,
        hallsRes,
        bookingsRes,
        festsRes,
        orgsRes,
        membersRes,
        ccdRes,
        allowedUsersRes,
      ] = await Promise.all([
        supabase.from('allowed_users').select('*').eq('email', user.email).maybeSingle(),
        supabase
          .from('events')
          .select(
            '*, halls:halls!events_hall_id_fkey(id, name, capacity, location), requested_hall:halls!events_requested_hall_id_fkey(id, name, capacity, location), fests(id, name, is_active), organizations(id, name, type), approvals:event_approvals(*)'
          )
          .in('status', ['submitted', 'approved', 'rejected'])
          .order('created_at', { ascending: false }),
        supabase.from('halls').select('*').order('name', { ascending: true }),
        supabase.from('public_hall_bookings').select('*'),
        supabase.from('fests').select('*').order('created_at', { ascending: false }),
        supabase.from('organizations').select('*').order('name', { ascending: true }),
        supabase.from('organization_members').select('*').order('created_at', { ascending: true }),
        supabase
          .from('course_code_departments')
          .select('*, organizations(id, name, type)')
          .order('course_code', { ascending: true }),
        supabase.from('allowed_users').select('*').order('name', { ascending: true }),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
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
        // Set default club selector
        const firstClub = (orgsRes.data as Organization[]).find((o) => o.type === 'club');
        if (firstClub && !selectedClubId) {
          setSelectedClubId(firstClub.id);
        }
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
  }, [supabase, selectedClubId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute free halls for a given event's time interval
  const getFreeHallsForEvent = useCallback(
    (event: CampusEvent) => {
      const eventStart = new Date(event.start_time).getTime();
      const eventEnd = new Date(event.end_time).getTime();

      return halls.filter((hall) => {
        const hasOverlap = bookings.some((b) => {
          if (b.hall_id !== hall.id) return false;
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

  // Role stage resolution
  const userStage = useMemo(() => {
    if (profile?.role === 'student_affairs' || profile?.role === 'affairs') return 'student_affairs';
    if (profile?.role === 'event_office') return 'event_office';
    if (profile?.role === 'cd') return 'cd';
    return null;
  }, [profile?.role]);

  // Filter "Needs my decision" (matching current user stage or all submitted for admin)
  const pendingEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.status !== 'submitted') return false;
      const stage = e.approval_stage || 'student_affairs';
      if (userStage) {
        return stage === userStage;
      }
      return true;
    });
  }, [events, userStage]);

  // Filtered pending list based on search and org filter
  const filteredPending = useMemo(() => {
    return pendingEvents.filter((ev) => {
      const matchesSearch =
        searchQuery === '' ||
        ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.organizer_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ev.organizations?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ev.club_or_dept || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesOrg =
        selectedOrgFilter === 'all' ||
        ev.organization_id === selectedOrgFilter ||
        ev.club_or_dept === selectedOrgFilter;

      return matchesSearch && matchesOrg;
    });
  }, [pendingEvents, searchQuery, selectedOrgFilter]);

  const decidedEvents = useMemo(() => {
    return events.filter((e) => e.status === 'approved' || e.status === 'rejected');
  }, [events]);

  // Actions
  const handleApprove = async (event: CampusEvent) => {
    setProcessingId(event.id);
    setActionError(null);
    setVenueSuccessMsg(null);

    try {
      const { error } = await supabase.rpc('decide_event', {
        p_event_id: event.id,
        p_decision: 'approved',
        p_reason: null,
      });

      if (error) {
        let msg = error.message;
        if (
          error.message.includes('already booked') ||
          error.message.includes('exclusion') ||
          error.message.includes('events_hall_time_no_overlap')
        ) {
          msg = 'Venue clash: This hall is already booked for that time. Please change the venue and approve again.';
        }
        setActionError({ id: event.id, message: msg });
        return;
      }

      await loadData();
    } catch (err: any) {
      setActionError({ id: event.id, message: err?.message || 'Failed to approve event.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingEvent) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a mandatory rejection reason.');
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
      await loadData();
    } catch (err: any) {
      setActionError({ id: rejectingEvent.id, message: err?.message || 'Failed to reject event.' });
    } finally {
      setProcessingId(null);
    }
  };

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

      setVenueSuccessMsg({ id: eventId, message: 'Venue reassigned successfully.' });
      await loadData();
    } catch (err: any) {
      setActionError({ id: eventId, message: err?.message || 'Failed to update venue.' });
    } finally {
      setSavingVenueId(null);
    }
  };

  // Club member actions
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClubId || !newMemberEmail.trim()) return;

    setMemberActionLoading(true);
    setMemberActionMsg(null);

    try {
      const { error } = await supabase.rpc('add_club_member', {
        p_org_id: selectedClubId,
        p_email: newMemberEmail.trim().toLowerCase(),
        p_member_role: newMemberRole,
      });

      if (error) throw error;

      setMemberActionMsg({ type: 'success', text: `Added ${newMemberEmail.trim()} as ${newMemberRole}.` });
      setNewMemberEmail('');
      await loadData();
    } catch (err: any) {
      setMemberActionMsg({ type: 'error', text: err?.message || 'Failed to add member.' });
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleToggleMemberRole = async (email: string, currentRole: 'lead' | 'member') => {
    const targetRole = currentRole === 'lead' ? 'member' : 'lead';
    setMemberActionLoading(true);
    setMemberActionMsg(null);

    try {
      const { error } = await supabase.rpc('set_club_member_role', {
        p_org_id: selectedClubId,
        p_email: email,
        p_member_role: targetRole,
      });
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      setMemberActionMsg({ type: 'error', text: err?.message || 'Failed to update member role.' });
    } finally {
      setMemberActionLoading(false);
    }
  };

  const handleRemoveMember = async (email: string) => {
    if (!confirm(`Remove ${email} from this club?`)) return;
    setMemberActionLoading(true);
    setMemberActionMsg(null);

    try {
      const { error } = await supabase.rpc('remove_club_member', {
        p_org_id: selectedClubId,
        p_email: email,
      });
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      setMemberActionMsg({ type: 'error', text: err?.message || 'Failed to remove member.' });
    } finally {
      setMemberActionLoading(false);
    }
  };

  // Course Code Mapping Handlers
  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode.trim() || !newCourseDeptId) return;

    setMappingLoading(true);
    setMappingMsg(null);

    try {
      const { error } = await supabase.from('course_code_departments').upsert(
        {
          course_code: newCourseCode.trim().toLowerCase(),
          organization_id: newCourseDeptId,
        },
        { onConflict: 'course_code' }
      );
      if (error) throw error;

      setMappingMsg({ type: 'success', text: `Mapped course code "${newCourseCode.trim()}" successfully.` });
      setNewCourseCode('');
      setNewCourseDeptId('');
      await loadData();
    } catch (err: any) {
      setMappingMsg({ type: 'error', text: err?.message || 'Failed to save mapping.' });
    } finally {
      setMappingLoading(false);
    }
  };

  const handleDeleteMapping = async (code: string) => {
    if (!confirm(`Delete mapping for "${code}"?`)) return;
    setMappingLoading(true);

    try {
      const { error } = await supabase.from('course_code_departments').delete().eq('course_code', code);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete mapping.');
    } finally {
      setMappingLoading(false);
    }
  };

  // Fest Handlers
  const handleCreateFest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFestName.trim()) return;

    setCreatingFest(true);
    setFestMsg(null);

    try {
      const { error } = await supabase.from('fests').insert({
        name: newFestName.trim(),
        is_active: newFestActive,
        start_date: newFestStart || null,
        end_date: newFestEnd || null,
      });
      if (error) throw error;

      setFestMsg({ type: 'success', text: `Fest "${newFestName.trim()}" created successfully.` });
      setNewFestName('');
      setNewFestStart('');
      setNewFestEnd('');
      setNewFestActive(false);
      await loadData();
    } catch (err: any) {
      setFestMsg({ type: 'error', text: err?.message || 'Failed to create fest.' });
    } finally {
      setCreatingFest(false);
    }
  };

  const handleToggleFest = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase.from('fests').update({ is_active: !active }).eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to update fest status.');
    }
  };

  const isAffairs = profile?.role === 'student_affairs' || profile?.role === 'affairs';

  // Navigation tabs definition
  const tabItems = [
    {
      id: 'pending',
      label: 'Needs my decision',
      count: pendingEvents.length,
      icon: <Clock className="h-4 w-4" />,
    },
    {
      id: 'decided',
      label: 'Decided',
      count: decidedEvents.length,
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
  ];

  if (isAffairs) {
    tabItems.push(
      {
        id: 'organizers',
        label: 'Organizers',
        count: organizations.length,
        icon: <Users className="h-4 w-4" />,
      },
      {
        id: 'fests',
        label: 'Fests',
        count: fests.length,
        icon: <Sparkles className="h-4 w-4" />,
      }
    );
  }

  // Active club for Organizers tab
  const activeClub = organizations.find((o) => o.id === selectedClubId);
  const activeClubMembers = orgMembers.filter((m) => m.organization_id === selectedClubId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Page Header */}
      <PageHeader
        title={
          profile?.role === 'event_office'
            ? 'Event Office Approvals'
            : profile?.role === 'cd'
            ? 'Campus Director Sanctions'
            : 'Student Affairs Approvals'
        }
        description="Multi-tier governance: Student Affairs &rarr; Event Office (Venue Clearance) &rarr; Campus Director (Final Sanction)"
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FDF2F2] text-[#A4161A] border border-[#FECACA]">
            <Shield className="h-3.5 w-3.5" />
            {profile?.role === 'event_office'
              ? 'Stage 2: Venue Lock'
              : profile?.role === 'cd'
              ? 'Stage 3: Executive'
              : 'Stage 1: Welfare'}
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadData()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5 text-neutral-600" />}
          >
            Refresh
          </Button>
        }
      />

      {/* Main Tabs */}
      <Tabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as any)}
      />

      {/* =========================================================================
          TAB 1: NEEDS MY DECISION (COMPACT ACCORDION LIST)
         ========================================================================= */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-50/70 p-3 rounded-xl border border-neutral-200">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by event title, organizer, or club..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-neutral-300 bg-white placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none min-h-[40px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-neutral-500 shrink-0" />
              <select
                value={selectedOrgFilter}
                onChange={(e) => setSelectedOrgFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm rounded-lg border border-neutral-300 bg-white text-neutral-800 focus:border-[#A4161A] focus:outline-none min-h-[40px] cursor-pointer"
              >
                <option value="all">All Organizers</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-neutral-100 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filteredPending.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8 text-emerald-500" />}
              title="Queue is all clear"
              description="No event proposals are currently awaiting your decision."
            />
          ) : (
            <div className="space-y-3">
              {filteredPending.map((event) => {
                const isExpanded = expandedEventId === event.id;
                const requestedHall =
                  halls.find((h) => h.id === (event.requested_hall_id || event.hall_id)) ||
                  event.requested_hall ||
                  event.halls;
                const currentHall = halls.find((h) => h.id === event.hall_id) || event.halls;
                const stage = event.approval_stage || 'student_affairs';
                const isEventOffice = profile?.role === 'event_office' && stage === 'event_office';
                const freeHalls = getFreeHallsForEvent(event);
                const changeState = venueChanges[event.id] || { hallId: event.hall_id, note: '' };
                const selectedOverrideHall = halls.find((h) => h.id === changeState.hallId);
                const capacityLowerWarning =
                  selectedOverrideHall &&
                  requestedHall &&
                  selectedOverrideHall.capacity < requestedHall.capacity;

                return (
                  <Card key={event.id} padding="none" className="overflow-hidden">
                    {/* Compact Summary Header Row */}
                    <div
                      onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                      className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-neutral-50/70 transition-colors select-none"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status="submitted" stage={stage} size="sm" />
                          <span className="text-xs font-semibold text-[#A4161A] bg-[#FDF2F2] px-2 py-0.5 rounded-md">
                            {event.organizations?.name || event.club_or_dept || 'Standalone'}
                          </span>
                          <span className="text-xs text-neutral-500 font-mono">
                            by {event.organizer_email}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-neutral-900 truncate">
                          {event.title}
                        </h3>

                        <div className="flex items-center gap-4 text-xs text-neutral-600 flex-wrap">
                          <span className="flex items-center gap-1.5 font-medium">
                            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                            {formatEventDate(event.start_time, event.end_time)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-neutral-400" />
                            {formatHall(requestedHall?.name, requestedHall?.capacity)}
                          </span>
                        </div>
                      </div>

                      {/* Stage Progress Chips + Toggle Arrow */}
                      <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500">
                          <span
                            className={`px-2 py-0.5 rounded-full border ${
                              event.approvals?.some((a) => a.stage === 'student_affairs' && a.decision === 'approved')
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : stage === 'student_affairs'
                                ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                                : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                            }`}
                          >
                            Affairs
                          </span>
                          <span>&rarr;</span>
                          <span
                            className={`px-2 py-0.5 rounded-full border ${
                              event.approvals?.some((a) => a.stage === 'event_office' && a.decision === 'approved')
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : stage === 'event_office'
                                ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                                : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                            }`}
                          >
                            Venue
                          </span>
                          <span>&rarr;</span>
                          <span
                            className={`px-2 py-0.5 rounded-full border ${
                              event.approvals?.some((a) => a.stage === 'cd' && a.decision === 'approved')
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : stage === 'cd'
                                ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                                : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                            }`}
                          >
                            Director
                          </span>
                        </div>

                        <div className="h-8 w-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail Panel & Action Area */}
                    {isExpanded && (
                      <div className="border-t border-neutral-200 bg-neutral-50/50 p-5 sm:p-6 space-y-5 animate-in slide-in-from-top-1">
                        {/* Event Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                              Proposal Details
                            </h4>
                            <p className="text-sm text-neutral-800 leading-relaxed bg-white p-3.5 rounded-xl border border-neutral-200">
                              {event.description || 'No detailed description provided.'}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-neutral-600">
                              <span><strong>Volunteers Needed:</strong> {event.volunteers_needed || 0}</span>
                              {event.registration_link && (
                                <a
                                  href={event.registration_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#A4161A] underline font-medium"
                                >
                                  External Link &rarr;
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Approval History Stepper */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                              Review Chain History
                            </h4>
                            <div className="bg-white p-3.5 rounded-xl border border-neutral-200">
                              <ApprovalTracker event={event} approvals={event.approvals || []} />
                            </div>
                          </div>
                        </div>

                        {/* Venue Override Control (For Event Office) */}
                        {isEventOffice && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-blue-700" />
                                <span className="text-xs font-bold text-blue-900">
                                  Event Office Venue Reassignment
                                </span>
                              </div>
                              <span className="text-xs text-blue-700 font-medium">
                                Requested: {requestedHall?.name} ({requestedHall?.capacity} seats)
                              </span>
                            </div>

                            {capacityLowerWarning && (
                              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                                <span>
                                  Selected hall ({selectedOverrideHall?.name}, {selectedOverrideHall?.capacity} seats) has lower capacity than requested ({requestedHall?.name}, {requestedHall?.capacity} seats).
                                </span>
                              </div>
                            )}

                            {venueSuccessMsg && venueSuccessMsg.id === event.id && (
                              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-900 font-medium">
                                ✓ {venueSuccessMsg.message}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="sm:col-span-1">
                                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                                  Available Halls
                                </label>
                                <select
                                  value={changeState.hallId}
                                  onChange={(e) =>
                                    setVenueChanges({
                                      ...venueChanges,
                                      [event.id]: { ...changeState, hallId: e.target.value },
                                    })
                                  }
                                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px] cursor-pointer"
                                >
                                  {freeHalls.map((h) => (
                                    <option key={h.id} value={h.id}>
                                      {h.name} ({h.capacity} seats) {h.id === event.hall_id ? ' [Assigned]' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-2 flex items-end gap-2">
                                <div className="flex-1">
                                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                                    Reassignment Note
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Upgraded to Auditorium for guest dignitaries"
                                    value={changeState.note}
                                    onChange={(e) =>
                                      setVenueChanges({
                                        ...venueChanges,
                                        [event.id]: { ...changeState, note: e.target.value },
                                      })
                                    }
                                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px]"
                                  />
                                </div>

                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleSaveVenue(event.id)}
                                  isLoading={savingVenueId === event.id}
                                  disabled={changeState.hallId === event.hall_id}
                                  className="shrink-0 min-h-[40px]"
                                >
                                  Update Venue
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Error Message if Action Failed */}
                        {actionError && actionError.id === event.id && (
                          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900 flex items-start gap-2.5">
                            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                            <div>
                              <p className="font-semibold">Unable to proceed</p>
                              <p className="mt-0.5">{actionError.message}</p>
                            </div>
                          </div>
                        )}

                        {/* Sticky Action Footer */}
                        <div className="pt-3 border-t border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-4 rounded-b-xl">
                          <p className="text-xs text-neutral-500">
                            {stage === 'cd'
                              ? 'Campus Director approval grants final sanction and activates bookings.'
                              : stage === 'event_office'
                              ? 'Event Office approval locks the hall slot and forwards to CD.'
                              : 'Student Affairs approval clears club eligibility and budget.'}
                          </p>

                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              variant="destructive"
                              size="md"
                              onClick={() => {
                                setRejectingEvent(event);
                                setRejectionReason('');
                              }}
                              disabled={processingId === event.id}
                              leftIcon={<XCircle className="h-4 w-4" />}
                            >
                              Reject Proposal
                            </Button>

                            <Button
                              variant="primary"
                              size="md"
                              onClick={() => handleApprove(event)}
                              isLoading={processingId === event.id}
                              leftIcon={<CheckCircle2 className="h-4 w-4" />}
                            >
                              {stage === 'cd' ? 'Grant Final Sanction' : 'Approve Stage'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: DECIDED HISTORY
         ========================================================================= */}
      {activeTab === 'decided' && (
        <div className="space-y-4">
          {decidedEvents.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-8 w-8 text-neutral-400" />}
              title="No Decided Events"
              description="Past approved and rejected event decisions will appear here."
            />
          ) : (
            <div className="space-y-3">
              {decidedEvents.map((event) => {
                const hall = halls.find((h) => h.id === event.hall_id) || event.halls;
                return (
                  <Card key={event.id} padding="md" className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={event.status} size="sm" />
                        <h3 className="font-bold text-neutral-900 text-sm sm:text-base">
                          {event.title}
                        </h3>
                      </div>
                      <span className="text-xs text-neutral-500 font-mono">
                        {formatEventDate(event.start_time, event.end_time)}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-600 flex items-center gap-4 flex-wrap">
                      <span>Venue: <strong>{formatHall(hall?.name, hall?.capacity)}</strong></span>
                      <span>Organizer: <code className="text-neutral-700">{event.organizer_email}</code></span>
                    </div>

                    {event.rejection_reason && (
                      <div className="text-xs text-rose-900 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                        <strong>Rejection Reason:</strong> {event.rejection_reason}
                      </div>
                    )}

                    <div className="pt-2 border-t border-neutral-100">
                      <ApprovalTracker event={event} approvals={event.approvals || []} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: ORGANIZERS (CLUBS & DEPARTMENTS - FOR STUDENT AFFAIRS)
         ========================================================================= */}
      {activeTab === 'organizers' && isAffairs && (
        <div className="space-y-8">
          {/* Section 1: Clubs (One club at a time) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#A4161A]" />
                  Student Club Memberships
                </h2>
                <p className="text-xs text-neutral-500">
                  Select a club to review executive leads, assign members, or remove access.
                </p>
              </div>

              {/* Club Selector Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {organizations
                  .filter((o) => o.type === 'club')
                  .map((club) => {
                    const isSelected = club.id === selectedClubId;
                    return (
                      <button
                        key={club.id}
                        type="button"
                        onClick={() => {
                          setSelectedClubId(club.id);
                          setMemberActionMsg(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer min-h-[36px] ${
                          isSelected
                            ? 'bg-[#A4161A] text-white shadow-xs'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {club.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Active Club Card */}
            {activeClub && (
              <Card padding="md" className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                  <div>
                    <h3 className="text-base font-bold text-neutral-900">{activeClub.name}</h3>
                    {activeClub.faculty_coordinator && (
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Faculty Coordinator: <strong className="text-neutral-700">{activeClub.faculty_coordinator}</strong>
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700">
                    {activeClubMembers.length} Active Members
                  </span>
                </div>

                {memberActionMsg && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium ${
                      memberActionMsg.type === 'error'
                        ? 'bg-rose-50 text-rose-900 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    {memberActionMsg.text}
                  </div>
                )}

                {/* Member Table */}
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 px-3.5">Name</th>
                        <th className="py-2.5 px-3.5">Email</th>
                        <th className="py-2.5 px-3.5">Roll No</th>
                        <th className="py-2.5 px-3.5 text-center">Role</th>
                        <th className="py-2.5 px-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {activeClubMembers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-neutral-400 italic">
                            No members assigned yet to {activeClub.name}.
                          </td>
                        </tr>
                      ) : (
                        activeClubMembers.map((m) => {
                          const userProfile = allAllowedUsers.find(
                            (u) => u.email.toLowerCase() === m.email.toLowerCase()
                          );
                          return (
                            <tr key={m.email} className="hover:bg-neutral-50/70">
                              <td className="py-2.5 px-3.5 font-semibold text-neutral-900">
                                {userProfile?.name || 'Student'}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono text-neutral-700">{m.email}</td>
                              <td className="py-2.5 px-3.5 font-mono text-neutral-500">
                                {userProfile?.roll_no || '—'}
                              </td>
                              <td className="py-2.5 px-3.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    m.member_role === 'lead'
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                                  }`}
                                >
                                  {m.member_role}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-right space-x-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleMemberRole(m.email, m.member_role)}
                                  disabled={memberActionLoading}
                                  className="text-xs"
                                >
                                  Set as {m.member_role === 'lead' ? 'Member' : 'Lead'}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleRemoveMember(m.email)}
                                  disabled={memberActionLoading}
                                  className="text-xs"
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add Member Input Bar */}
                <form
                  onSubmit={handleAddMember}
                  className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                >
                  <input
                    type="email"
                    required
                    placeholder="student email (e.g. student1@demo.edu)"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px]"
                  />
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as any)}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px] cursor-pointer"
                  >
                    <option value="member">Member</option>
                    <option value="lead">Lead</option>
                  </select>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={memberActionLoading}
                    leftIcon={<UserPlus className="h-4 w-4" />}
                    className="min-h-[40px]"
                  >
                    Add Member
                  </Button>
                </form>
              </Card>
            )}
          </div>

          {/* Section 2: Department Mapping & Unmappable Warnings */}
          <div className="space-y-4 pt-4 border-t border-neutral-200">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-[#A4161A]" />
                Academic Department Mappings &amp; Roster
              </h2>
              <p className="text-xs text-neutral-500">
                Department membership is mapped from student roll number course codes (e.g. &ldquo;cb.ps.i5das24049&rdquo; &rarr; &ldquo;i5das&rdquo;).
              </p>
            </div>

            {/* Warnings Box for Unmapped Roll Numbers */}
            {(() => {
              const students = allAllowedUsers.filter((u) => u.role === 'student');
              const unmappable = students
                .map((st) => {
                  if (!st.roll_no) return { student: st, reason: 'Missing roll number' };
                  const parts = st.roll_no.trim().toLowerCase().split('.');
                  if (parts.length < 3) return { student: st, reason: 'Invalid dot-separated format' };
                  const part3 = parts[2];
                  if (!/^[a-z0-9]+[0-9]{5}$/.test(part3)) return { student: st, reason: 'Invalid course suffix' };
                  const code = part3.substring(0, part3.length - 5);
                  const mapped = courseCodeDepts.find((m) => m.course_code.toLowerCase() === code.toLowerCase());
                  if (!mapped) return { student: st, reason: `Unregistered course code "${code}"` };
                  return null;
                })
                .filter(Boolean) as { student: AllowedUser; reason: string }[];

              if (unmappable.length === 0) return null;

              return (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs sm:text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                    <span>Unmapped Student Warning ({unmappable.length})</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    The following students have roll numbers that do not match any configured course code department:
                  </p>
                  <div className="divide-y divide-amber-200 rounded-lg border border-amber-200 bg-white max-h-40 overflow-y-auto">
                    {unmappable.map(({ student, reason }) => (
                      <div key={student.email} className="p-2.5 text-xs flex items-center justify-between">
                        <div>
                          <strong>{student.name || student.email}</strong>{' '}
                          <span className="font-mono text-neutral-500">({student.roll_no})</span>
                        </div>
                        <span className="text-[10px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Course Code Department Mapping Table */}
            <Card padding="md" className="space-y-4">
              <h3 className="text-sm font-bold text-neutral-900">
                Course Code Mapping Table Editor
              </h3>

              {mappingMsg && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium ${
                    mappingMsg.type === 'error'
                      ? 'bg-rose-50 text-rose-900 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  }`}
                >
                  {mappingMsg.text}
                </div>
              )}

              <form
                onSubmit={handleSaveMapping}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs"
              >
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Course Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. i5das, u4cse"
                    value={newCourseCode}
                    onChange={(e) => setNewCourseCode(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-mono text-neutral-900 focus:outline-none min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Target Department</label>
                  <select
                    required
                    value={newCourseDeptId}
                    onChange={(e) => setNewCourseDeptId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px] cursor-pointer"
                  >
                    <option value="" disabled>-- Select Department --</option>
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
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={mappingLoading}
                    className="w-full min-h-[40px]"
                  >
                    Save Mapping
                  </Button>
                </div>
              </form>

              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                    <tr>
                      <th className="py-2.5 px-3.5">Course Code</th>
                      <th className="py-2.5 px-3.5">Mapped Academic Department</th>
                      <th className="py-2.5 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {courseCodeDepts.map((ccd) => {
                      const dept = organizations.find((o) => o.id === ccd.organization_id);
                      return (
                        <tr key={ccd.course_code} className="hover:bg-neutral-50/70">
                          <td className="py-2.5 px-3.5 font-mono font-bold text-neutral-900">
                            {ccd.course_code}
                          </td>
                          <td className="py-2.5 px-3.5 text-neutral-800">{dept?.name || 'Department'}</td>
                          <td className="py-2.5 px-3.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteMapping(ccd.course_code)}
                              className="text-rose-600 hover:text-rose-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: FESTS MANAGEMENT (FOR STUDENT AFFAIRS)
         ========================================================================= */}
      {activeTab === 'fests' && isAffairs && (
        <div className="space-y-6">
          <Card padding="md" className="space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Create Campus Fest</h3>

            {festMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  festMsg.type === 'error'
                    ? 'bg-rose-50 text-rose-900 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                }`}
              >
                {festMsg.text}
              </div>
            )}

            <form onSubmit={handleCreateFest} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Fest Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Anokha 2026"
                    value={newFestName}
                    onChange={(e) => setNewFestName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newFestStart}
                    onChange={(e) => setNewFestStart(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newFestEnd}
                    onChange={(e) => setNewFestEnd(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none min-h-[40px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-neutral-700">
                  <input
                    type="checkbox"
                    checked={newFestActive}
                    onChange={(e) => setNewFestActive(e.target.checked)}
                    className="rounded text-[#A4161A] focus:ring-[#A4161A]"
                  />
                  Mark active immediately (enables Fest proposals & tab)
                </label>

                <Button type="submit" variant="primary" size="md" isLoading={creatingFest}>
                  Create Fest
                </Button>
              </div>
            </form>
          </Card>

          {/* Fests List */}
          <div className="space-y-3">
            {fests.map((fest) => (
              <Card key={fest.id} padding="md" className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-neutral-900">{fest.name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        fest.is_active
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                      }`}
                    >
                      {fest.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 font-mono mt-0.5">
                    {fest.start_date || 'TBD'} &rarr; {fest.end_date || 'TBD'}
                  </div>
                </div>

                <Button
                  variant={fest.is_active ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => handleToggleFest(fest.id, fest.is_active)}
                >
                  {fest.is_active ? 'Deactivate' : 'Activate Fest'}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Reject Reason Modal Dialog */}
      {rejectingEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base sm:text-lg font-bold text-neutral-900">
              Reject Event Proposal
            </h3>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Provide feedback for &ldquo;{rejectingEvent.title}&rdquo;. The organizer will see this explanation and can revise their submission.
            </p>

            <textarea
              rows={4}
              required
              placeholder="e.g. Conflict with University Convocation; please propose for subsequent weekend."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 p-3 text-xs sm:text-sm text-neutral-900 focus:outline-none focus:border-[#A4161A] focus:ring-2 focus:ring-[#A4161A]/20"
            />

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setRejectingEvent(null)}
                disabled={processingId === rejectingEvent.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={handleConfirmReject}
                isLoading={processingId === rejectingEvent.id}
                disabled={!rejectionReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
