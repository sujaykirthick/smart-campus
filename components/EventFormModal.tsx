'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, Fest, PublicHallBooking, Organization, OrganizerType } from '@/lib/types';
import {
  X,
  Calendar,
  Clock,
  Building2,
  Image as ImageIcon,
  Link as LinkIcon,
  AlertTriangle,
  UploadCloud,
  CheckCircle2,
  Info,
  Users,
} from 'lucide-react';

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialEvent?: CampusEvent | null;
  halls: Hall[];
  userEmail: string;
  userRole: string;
  clubOrDept: string;
}

export default function EventFormModal({
  isOpen,
  onClose,
  onSaved,
  initialEvent,
  halls,
  userEmail,
  clubOrDept,
}: EventFormModalProps) {
  const fileInputId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizerType, setOrganizerType] = useState<OrganizerType>('standalone');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [hallId, setHallId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [festId, setFestId] = useState<string>('');
  const [volunteersNeeded, setVolunteersNeeded] = useState<number>(0);
  const [registrationLink, setRegistrationLink] = useState('');
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  const [activeFests, setActiveFests] = useState<Fest[]>([]);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Existing approved bookings on the selected hall & date
  const [hallBookings, setHallBookings] = useState<PublicHallBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const [userClubs, setUserClubs] = useState<Organization[]>([]);
  const [userDepts, setUserDepts] = useState<Organization[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);

  // Fetch organizations and filter for the current user's memberships
  useEffect(() => {
    if (!isOpen || !userEmail) return;

    let ignore = false;
    async function loadOrganizationsAndMemberships() {
      setLoadingMemberships(true);
      try {
        const [orgsRes, membersRes, profileRes, ccdRes] = await Promise.all([
          supabase.from('organizations').select('*').order('name', { ascending: true }),
          supabase.from('organization_members').select('organization_id').ilike('email', userEmail),
          supabase.from('allowed_users').select('*').eq('email', userEmail).maybeSingle(),
          supabase.from('course_code_departments').select('*'),
        ]);

        if (ignore) return;

        const allOrgs = (orgsRes.data as Organization[]) || [];
        setOrganizations(allOrgs);

        // 1. User's eligible clubs (from organization_members)
        const memberOrgIds = new Set((membersRes.data || []).map((m) => m.organization_id));
        const eligibleClubs = allOrgs.filter(
          (o) => o.type === 'club' && memberOrgIds.has(o.id)
        );
        setUserClubs(eligibleClubs);

        // 2. User's eligible departments (derived)
        const profile = profileRes.data;
        let eligibleDepts: Organization[] = [];

        if (profile) {
          if (profile.role === 'faculty' && profile.department) {
            const facultyDept = allOrgs.find(
              (o) => o.type === 'department' && o.name.toLowerCase() === profile.department?.toLowerCase()
            );
            if (facultyDept) eligibleDepts = [facultyDept];
          } else if (profile.role === 'student' && profile.roll_no) {
            // Check course_code_departments
            const ccdList = ccdRes.data || [];
            const lowerRoll = profile.roll_no.toLowerCase();
            const matchedCcd = ccdList.find((c) => lowerRoll.includes(c.course_code.toLowerCase()));
            if (matchedCcd) {
              const matchedDept = allOrgs.find((o) => o.id === matchedCcd.organization_id);
              if (matchedDept) eligibleDepts = [matchedDept];
            }
          }
        }
        setUserDepts(eligibleDepts);
      } catch (err) {
        if (!ignore) console.error('Error fetching organizations for modal:', err);
      } finally {
        if (!ignore) setLoadingMemberships(false);
      }
    }

    loadOrganizationsAndMemberships();
    return () => {
      ignore = true;
    };
  }, [isOpen, userEmail, supabase]);

  // Fetch active fests
  useEffect(() => {
    if (!isOpen) return;

    let ignore = false;
    async function loadFests() {
      try {
        const { data, error } = await supabase
          .from('fests')
          .select('*')
          .order('name', { ascending: true });

        if (!ignore && !error && data) {
          const available = data.filter(
            (f) => f.is_active || (initialEvent && f.id === initialEvent.fest_id)
          );
          setActiveFests(available);
        }
      } catch (err) {
        if (!ignore) console.error('Error fetching fests for modal:', err);
      }
    }

    loadFests();
    return () => {
      ignore = true;
    };
  }, [isOpen, initialEvent, supabase]);

  // Initialize form with initialEvent or defaults
  useEffect(() => {
    if (initialEvent) {
      setTitle(initialEvent.title || '');
      setDescription(initialEvent.description || '');
      const initialType: OrganizerType =
        initialEvent.organizer_type ||
        (initialEvent.organization_id ? 'club' : initialEvent.club_or_dept ? 'club' : 'standalone');
      setOrganizerType(initialType);
      setOrganizationId(initialEvent.organization_id || '');
      setHallId(initialEvent.hall_id || (halls[0]?.id ?? ''));
      setFestId(initialEvent.fest_id || '');
      setVolunteersNeeded(initialEvent.volunteers_needed || 0);
      setRegistrationLink(initialEvent.registration_link || '');
      setPosterUrl(initialEvent.poster_url || null);

      if (initialEvent.start_time && initialEvent.end_time) {
        const s = new Date(initialEvent.start_time);
        const e = new Date(initialEvent.end_time);

        const yyyy = s.getFullYear();
        const mm = String(s.getMonth() + 1).padStart(2, '0');
        const dd = String(s.getDate()).padStart(2, '0');
        setDate(`${yyyy}-${mm}-${dd}`);

        const sH = String(s.getHours()).padStart(2, '0');
        const sM = String(s.getMinutes()).padStart(2, '0');
        setStartTime(`${sH}:${sM}`);

        const eH = String(e.getHours()).padStart(2, '0');
        const eM = String(e.getMinutes()).padStart(2, '0');
        setEndTime(`${eH}:${eM}`);
      }
    } else {
      setTitle('');
      setDescription('');
      setOrganizerType('standalone');
      setOrganizationId('');
      setHallId(halls[0]?.id ?? '');
      setFestId('');
      setVolunteersNeeded(0);
      setRegistrationLink('');
      setPosterUrl(null);

      // Default to tomorrow 09:00 - 12:00
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      setDate(`${yyyy}-${mm}-${dd}`);
      setStartTime('09:00');
      setEndTime('12:00');
    }
    setErrorMessage(null);
  }, [initialEvent, halls, isOpen]);

  // Fetch bookings for the selected date across all halls to detect disabled / pending halls
  const [allDayBookings, setAllDayBookings] = useState<PublicHallBooking[]>([]);

  useEffect(() => {
    if (!isOpen || !date) return;

    let ignore = false;
    async function loadHallBookings() {
      setLoadingBookings(true);
      try {
        const startOfDay = `${date}T00:00:00.000Z`;
        const endOfDay = `${date}T23:59:59.999Z`;

        const { data, error } = await supabase
          .from('public_hall_bookings')
          .select('*')
          .gte('end_time', startOfDay)
          .lte('start_time', endOfDay)
          .order('start_time', { ascending: true });

        if (!ignore && !error && data) {
          setAllDayBookings(data as PublicHallBooking[]);
        }
      } catch (err) {
        if (!ignore) console.error('Error fetching hall bookings for conflict detection:', err);
      } finally {
        if (!ignore) setLoadingBookings(false);
      }
    }

    loadHallBookings();
    return () => {
      ignore = true;
    };
  }, [date, isOpen, supabase]);

  // Compute availability & conflict status per hall for the selected timeslot
  const hallStatus = useMemo(() => {
    const map: Record<
      string,
      { isBooked: boolean; isPending: boolean; title?: string; start_time?: string; end_time?: string }
    > = {};
    if (!date || !startTime || !endTime) return map;

    const myStart = new Date(`${date}T${startTime}:00`).getTime();
    const myEnd = new Date(`${date}T${endTime}:00`).getTime();
    if (isNaN(myStart) || isNaN(myEnd) || myEnd <= myStart) return map;

    for (const h of halls) {
      const matchingBookings = allDayBookings.filter((b) => b.hall_id === h.id);
      let isBooked = false;
      let isPending = false;
      let bookedTitle = '';
      let bStartTime = '';
      let bEndTime = '';

      for (const b of matchingBookings) {
        if (initialEvent && (b.event_id === initialEvent.id || b.title === initialEvent.title)) {
          continue;
        }

        const bStart = new Date(b.start_time).getTime();
        const bEnd = new Date(b.end_time).getTime();

        if (myStart < bEnd && myEnd > bStart) {
          if (b.status === 'booked' || b.status === 'approved' || b.approval_stage === 'cd') {
            isBooked = true;
            bookedTitle = b.title;
            bStartTime = b.start_time;
            bEndTime = b.end_time;
          } else {
            isPending = true;
          }
        }
      }

      map[h.id] = {
        isBooked,
        isPending,
        title: bookedTitle,
        start_time: bStartTime,
        end_time: bEndTime,
      };
    }
    return map;
  }, [halls, allDayBookings, date, startTime, endTime, initialEvent]);

  // Conflict warning on current selected hall
  const conflictDetected = useMemo(() => {
    if (!hallId) return null;
    const info = hallStatus[hallId];
    if (info?.isBooked) {
      return {
        title: info.title || 'Another Event',
        start_time: info.start_time || '',
        end_time: info.end_time || '',
      };
    }
    return null;
  }, [hallId, hallStatus]);

  // Warning when editing an already approved event
  const isApprovedEventResubmission = useMemo(() => {
    if (!initialEvent || initialEvent.status !== 'approved') return false;
    if (!date || !startTime || !endTime) return false;

    const origStart = new Date(initialEvent.start_time).toISOString();
    const origEnd = new Date(initialEvent.end_time).toISOString();
    const newStart = new Date(`${date}T${startTime}:00`).toISOString();
    const newEnd = new Date(`${date}T${endTime}:00`).toISOString();

    const timeChanged = origStart !== newStart || origEnd !== newEnd;
    const hallChanged = initialEvent.hall_id !== hallId;

    return timeChanged || hallChanged;
  }, [initialEvent, date, startTime, endTime, hallId]);

  // Handle Poster Upload to Supabase Storage 'event-posters' bucket
  const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Poster file size must be less than 5MB.');
      return;
    }

    setUploadingPoster(true);
    setErrorMessage(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `posters/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('event-posters')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicData } = supabase.storage
        .from('event-posters')
        .getPublicUrl(filePath);

      setPosterUrl(publicData.publicUrl);
    } catch (err: unknown) {
      console.error('Poster upload failed:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to upload event poster. Please try again.'
      );
    } finally {
      setUploadingPoster(false);
    }
  };

  const handleSave = async (targetStatus: 'draft' | 'submitted') => {
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Please enter an event title.');
      return;
    }

    if (organizerType !== 'standalone' && !organizationId) {
      setErrorMessage(`Please select a ${organizerType === 'club' ? 'Club' : 'Department'} organization.`);
      return;
    }

    if (!hallId) {
      setErrorMessage('Please select a hall venue.');
      return;
    }

    if (!date || !startTime || !endTime) {
      setErrorMessage('Please select a date and valid start and end times.');
      return;
    }

    const startIso = new Date(`${date}T${startTime}:00`).toISOString();
    const endIso = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setErrorMessage('End time must be after the start time.');
      return;
    }

    setSaving(true);

    if (targetStatus === 'submitted' && hallStatus[hallId]?.isBooked) {
      setErrorMessage(
        'Another event has booked this hall for that time. Please choose a different hall or time.'
      );
      setSaving(false);
      return;
    }

    try {
      const selectedOrg = organizations.find((o) => o.id === organizationId);
      const orgName = organizerType === 'standalone' ? null : (selectedOrg?.name || clubOrDept || null);

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        organizer_email: userEmail,
        organizer_type: organizerType,
        organization_id: organizerType === 'standalone' ? null : (organizationId || null),
        club_or_dept: orgName,
        hall_id: hallId,
        start_time: startIso,
        end_time: endIso,
        status: targetStatus,
        fest_id: festId || null,
        volunteers_needed: Math.max(0, parseInt(String(volunteersNeeded), 10) || 0),
        registration_link: registrationLink.trim() || null,
        poster_url: posterUrl || null,
        ...(initialEvent?.status === 'rejected' && targetStatus === 'submitted'
          ? { rejection_reason: null }
          : {}),
      };

      if (initialEvent) {
        const { error: updateError } = await supabase
          .from('events')
          .update(payload)
          .eq('id', initialEvent.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('events')
          .insert(payload);

        if (insertError) throw insertError;
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('Error saving event:', err);
      let msg = err instanceof Error ? err.message : 'Failed to save event.';
      if (
        msg.includes('Another event has booked this hall') ||
        msg.includes('already booked for that time') ||
        msg.includes('events_hall_time_no_overlap') ||
        msg.includes('exclusion')
      ) {
        msg = 'Another event has booked this hall for that time. Please choose a different hall or time.';
      }
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  const formatBookingTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg my-6">
        {/* Institutional Red Top Strip */}
        <div className="h-1 bg-[#A4161A] w-full" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-neutral-900">
              {initialEvent ? 'Edit Event Proposal' : 'Propose New Event'}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {clubOrDept} • {userEmail}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-4">
          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
              <div>
                <span className="font-semibold">Error: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Re-approval Warning */}
          {isApprovedEventResubmission && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <span className="font-semibold">Re-approval notice: </span>
                <span>
                  Modifying the venue or schedule of an approved event resets its status to submitted for Student Welfare re-approval.
                </span>
              </div>
            </div>
          )}

          {/* Conflict Warning */}
          {conflictDetected && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#991B1B] mt-0.5" />
              <div>
                <span className="font-semibold">Schedule Conflict: </span>
                <span>
                  &ldquo;{conflictDetected.title}&rdquo; is approved in this hall from{' '}
                  {formatBookingTime(conflictDetected.start_time)} to{' '}
                  {formatBookingTime(conflictDetected.end_time)}.
                </span>
              </div>
            </div>
          )}

          {/* Organized By Selector */}
          <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50/70 p-3">
            <label className="block text-xs font-semibold text-neutral-800">
              Organized by <span className="text-[#A4161A]">*</span>
            </label>

            {loadingMemberships ? (
              <div className="text-xs text-neutral-400 py-1">Loading affiliations...</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setOrganizerType('standalone');
                      setOrganizationId('');
                    }}
                    className={`flex-1 min-w-[90px] items-center justify-center py-2 px-3 rounded border font-medium transition-colors cursor-pointer ${
                      organizerType === 'standalone'
                        ? 'border-[#A4161A] bg-white text-[#A4161A] shadow-xs font-semibold'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    Standalone
                  </button>

                  {userClubs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrganizerType('club');
                        if (!organizationId || !userClubs.some((c) => c.id === organizationId)) {
                          setOrganizationId(userClubs[0]?.id || '');
                        }
                      }}
                      className={`flex-1 min-w-[90px] items-center justify-center py-2 px-3 rounded border font-medium transition-colors cursor-pointer ${
                        organizerType === 'club'
                          ? 'border-[#A4161A] bg-white text-[#A4161A] shadow-xs font-semibold'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      Club ({userClubs.length})
                    </button>
                  )}

                  {userDepts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrganizerType('department');
                        if (!organizationId || !userDepts.some((d) => d.id === organizationId)) {
                          setOrganizationId(userDepts[0]?.id || '');
                        }
                      }}
                      className={`flex-1 min-w-[90px] items-center justify-center py-2 px-3 rounded border font-medium transition-colors cursor-pointer ${
                        organizerType === 'department'
                          ? 'border-[#A4161A] bg-white text-[#A4161A] shadow-xs font-semibold'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      Department
                    </button>
                  )}
                </div>

                {userClubs.length === 0 && userDepts.length === 0 && (
                  <p className="text-[11px] text-neutral-500 italic">
                    You are not currently enrolled in any student clubs or mapped departments. Event will be submitted as Standalone.
                  </p>
                )}

                {/* Organization Dropdown when Club or Department is selected */}
                {organizerType === 'club' && userClubs.length > 0 && (
                  <div className="pt-1.5">
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Select Your Club <span className="text-[#A4161A]">*</span>
                    </label>
                    <select
                      required
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Choose Affiliated Club --
                      </option>
                      {userClubs.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {organizerType === 'department' && userDepts.length > 0 && (
                  <div className="pt-1.5">
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Select Your Department <span className="text-[#A4161A]">*</span>
                    </label>
                    <select
                      required
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Choose Department --
                      </option>
                      {userDepts.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Event Title */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1">
              Event Title <span className="text-[#A4161A]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Workshop on Embedded Systems"
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Event overview, objectives, and schedule details..."
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
            />
          </div>

          {/* Hall Selection & Fest */}
          <div className={`grid grid-cols-1 ${activeFests.length > 0 ? 'sm:grid-cols-2' : ''} gap-3`}>
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#A4161A]" /> Hall Venue <span className="text-[#A4161A]">*</span>
              </label>
              <select
                value={hallId}
                onChange={(e) => setHallId(e.target.value)}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none cursor-pointer"
              >
                {halls.map((h) => {
                  const statusInfo = hallStatus[h.id];
                  const isBooked = statusInfo?.isBooked;
                  return (
                    <option key={h.id} value={h.id} disabled={isBooked}>
                      {h.name} ({h.capacity} seats)
                      {isBooked ? ' - Booked by another event' : ''}
                    </option>
                  );
                })}
              </select>

              {/* Warning notice if selected hall has pending requests (Requirement 4) */}
              {hallStatus[hallId]?.isPending && !hallStatus[hallId]?.isBooked && (
                <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 mt-0.5" />
                  <div>
                    <span className="font-semibold">Pending requests exist: </span>
                    <span>
                      Other organizers have submitted pending requests for this hall during this window. Pending requests do not reserve a hall until approved by Event Office.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Fest Dropdown */}
            {activeFests.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-neutral-800 mb-1">
                  Fest Association
                </label>
                <select
                  value={festId}
                  onChange={(e) => setFestId(e.target.value)}
                  className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none cursor-pointer"
                >
                  <option value="">None (standalone)</option>
                  {activeFests.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {!f.is_active ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date, Start Time, End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-neutral-500" /> Date <span className="text-[#A4161A]">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-neutral-500" /> Start Time <span className="text-[#A4161A]">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-neutral-500" /> End Time <span className="text-[#A4161A]">*</span>
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none"
              />
            </div>
          </div>

          {/* Hall's Existing Approved Bookings */}
          <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-800">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-neutral-500" />
                Bookings on {date || 'Selected Date'}
              </span>
              <span className="text-[11px] font-normal text-neutral-500">
                {halls.find((h) => h.id === hallId)?.name}
              </span>
            </div>

            {loadingBookings ? (
              <div className="text-xs text-neutral-500 italic">Checking venue availability...</div>
            ) : hallBookings.length === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                No existing bookings on this date.
              </div>
            ) : (
              <div className="space-y-1 pt-1">
                {hallBookings.map((b, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium text-[#991B1B] truncate max-w-[260px]">
                      {b.title}
                    </span>
                    <span className="font-mono text-[#991B1B] text-[11px]">
                      {formatBookingTime(b.start_time)} – {formatBookingTime(b.end_time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Volunteers Needed & External Registration Link */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-neutral-500" /> Volunteers Needed
              </label>
              <input
                type="number"
                min="0"
                value={volunteersNeeded}
                onChange={(e) => setVolunteersNeeded(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-neutral-800 mb-1 flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-neutral-500" /> External Registration URL (Optional)
              </label>
              <input
                type="url"
                value={registrationLink}
                onChange={(e) => setRegistrationLink(e.target.value)}
                placeholder="https://forms.google.com/..."
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-[#A4161A] focus:outline-none"
              />
            </div>
          </div>

          {/* Poster Upload */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-neutral-500" /> Event Poster
            </label>

            <div className="flex flex-col sm:flex-row items-start gap-3">
              {posterUrl ? (
                <div className="relative rounded overflow-hidden border border-neutral-300 w-32 h-32 shrink-0 bg-neutral-100">
                  <img
                    src={posterUrl}
                    alt="Event Poster Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPosterUrl(null)}
                    className="absolute top-1 right-1 rounded bg-black/75 p-1 text-white hover:bg-black transition-colors cursor-pointer"
                    title="Remove poster"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor={fileInputId}
                  className="flex flex-col items-center justify-center w-full sm:w-44 h-32 border border-dashed border-neutral-300 rounded cursor-pointer bg-neutral-50 hover:bg-neutral-100 transition-colors p-3 text-center"
                >
                  <UploadCloud className="h-6 w-6 text-[#A4161A] mb-1" />
                  <span className="text-xs font-medium text-neutral-800">
                    {uploadingPoster ? 'Uploading...' : 'Upload Poster'}
                  </span>
                  <span className="text-[10px] text-neutral-500 mt-0.5">Max 5MB (PNG/JPG)</span>
                  <input
                    id={fileInputId}
                    type="file"
                    accept="image/*"
                    disabled={uploadingPoster}
                    onChange={handlePosterUpload}
                    className="hidden"
                  />
                </label>
              )}

              <div className="text-xs text-neutral-500 space-y-1">
                <p>
                  Poster images are hosted in Supabase Storage <code className="font-mono text-neutral-700">event-posters</code>.
                </p>
                <p className="text-[11px] text-neutral-400">
                  Displayed on the event list and student passes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto rounded border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving || uploadingPoster}
            onClick={() => handleSave('draft')}
            className="w-full sm:w-auto rounded border border-neutral-300 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>

          <button
            type="button"
            disabled={saving || uploadingPoster}
            onClick={() => handleSave('submitted')}
            className="w-full sm:w-auto rounded bg-[#A4161A] px-5 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {saving ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <UploadCloud className="h-3.5 w-3.5" />
                Submit for Approval
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
