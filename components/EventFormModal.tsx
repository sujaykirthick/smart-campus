'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Hall, Fest, PublicHallBooking } from '@/lib/types';
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
  Sparkles,
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
          // If editing an event with a specific fest, include that fest even if inactive
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

  // Fetch bookings for the selected hall & date to surface early conflicts
  useEffect(() => {
    if (!isOpen || !hallId || !date) return;

    let ignore = false;
    async function loadHallBookings() {
      setLoadingBookings(true);
      try {
        const startOfDay = `${date}T00:00:00.000Z`;
        const endOfDay = `${date}T23:59:59.999Z`;

        const { data, error } = await supabase
          .from('public_hall_bookings')
          .select('*')
          .eq('hall_id', hallId)
          .eq('status', 'approved')
          .gte('end_time', startOfDay)
          .lte('start_time', endOfDay)
          .order('start_time', { ascending: true });

        if (!ignore && !error && data) {
          // Filter out the event itself if currently editing
          const filtered = initialEvent ? data.filter((b) => b.title !== initialEvent.title) : data;
          setHallBookings(filtered);
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
  }, [hallId, date, isOpen, initialEvent, supabase]);

  // Check client-side overlap warning against approved bookings
  const conflictDetected = useMemo(() => {
    if (!date || !startTime || !endTime || hallBookings.length === 0) return null;

    const myStart = new Date(`${date}T${startTime}:00`).getTime();
    const myEnd = new Date(`${date}T${endTime}:00`).getTime();

    if (isNaN(myStart) || isNaN(myEnd) || myEnd <= myStart) return null;

    for (const b of hallBookings) {
      const bStart = new Date(b.start_time).getTime();
      const bEnd = new Date(b.end_time).getTime();

      // Check time overlap: (StartA < EndB) and (EndA > StartB)
      if (myStart < bEnd && myEnd > bStart) {
        return b;
      }
    }
    return null;
  }, [date, startTime, endTime, hallBookings]);

  // Warning when editing an already approved event: changing time or venue triggers re-approval
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

    // Check file size (max 5MB)
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

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        organizer_email: userEmail,
        club_or_dept: clubOrDept || null,
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
      if (msg.includes('events_hall_time_no_overlap') || msg.includes('exclusion')) {
        msg = 'This hall is already booked for that time by another approved event.';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EADFD6] bg-[#FFFAF5] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B3202A] text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                {initialEvent ? 'Edit Event Proposal' : 'Propose New Event'}
              </h3>
              <p className="text-xs text-[#7A6A62]">
                {clubOrDept} • {userEmail}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#7A6A62] hover:bg-[#FAF0F0] hover:text-[#B3202A] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2] p-4 text-xs text-[#7F1D1D] flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#7F1D1D] mt-0.5" />
              <div>
                <span className="font-bold">Attention: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Re-approval Warning */}
          {isApprovedEventResubmission && (
            <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7] p-4 text-xs text-[#B45309] flex items-start gap-3">
              <Info className="h-4 w-4 shrink-0 text-[#B45309] mt-0.5" />
              <div>
                <span className="font-bold">Re-approval notice: </span>
                <span>
                  Modifying the venue or scheduled time of an approved event will send the event back
                  for re-approval by Student Welfare.
                </span>
              </div>
            </div>
          )}

          {/* Conflict Detected Early Warning */}
          {conflictDetected && (
            <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2] p-4 text-xs text-[#7F1D1D] flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#7F1D1D] mt-0.5" />
              <div>
                <span className="font-bold">Schedule Conflict Warning: </span>
                <span>
                  This hall has an approved booking for &ldquo;{conflictDetected.title}&rdquo; (
                  {formatBookingTime(conflictDetected.start_time)} –{' '}
                  {formatBookingTime(conflictDetected.end_time)}). Submitting for this slot may be
                  blocked upon approval.
                </span>
              </div>
            </div>
          )}

          {/* Event Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5">
              Event Title <span className="text-[#B3202A]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Anokha 2026 - Autonomous Robotics Hackathon"
              className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2.5 text-xs sm:text-sm text-[#2B1B17] placeholder:text-[#A3938B] focus:border-[#B3202A] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide a comprehensive summary of the event schedule, target audience, and objectives..."
              className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2.5 text-xs sm:text-sm text-[#2B1B17] placeholder:text-[#A3938B] focus:border-[#B3202A] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Hall Selection & Fest */}
          <div className={`grid grid-cols-1 ${activeFests.length > 0 ? 'sm:grid-cols-2' : ''} gap-4`}>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#B3202A]" /> Hall Venue <span className="text-[#B3202A]">*</span>
              </label>
              <select
                value={hallId}
                onChange={(e) => setHallId(e.target.value)}
                className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2.5 text-xs sm:text-sm text-[#2B1B17] focus:border-[#B3202A] focus:outline-none cursor-pointer"
              >
                {halls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.capacity} seats)
                  </option>
                ))}
              </select>
            </div>

            {/* Fest Dropdown: Only shown when active fests exist */}
            {activeFests.length > 0 && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#C9A24B]" /> Fest Association
                </label>
                <select
                  value={festId}
                  onChange={(e) => setFestId(e.target.value)}
                  className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2.5 text-xs sm:text-sm text-[#2B1B17] focus:border-[#B3202A] focus:outline-none cursor-pointer"
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#7A6A62]" /> Date <span className="text-[#B3202A]">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2 text-xs sm:text-sm text-[#2B1B17] focus:border-[#B3202A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#7A6A62]" /> Start Time <span className="text-[#B3202A]">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2 text-xs sm:text-sm text-[#2B1B17] focus:border-[#B3202A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#7A6A62]" /> End Time <span className="text-[#B3202A]">*</span>
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2 text-xs sm:text-sm text-[#2B1B17] focus:border-[#B3202A] focus:outline-none"
              />
            </div>
          </div>

          {/* Hall's Existing Approved Bookings on that Date */}
          <div className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#2B1B17] uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#7A6A62]" />
                Approved Bookings on {date || 'Selected Date'}
              </span>
              <span className="text-[11px] font-normal text-[#7A6A62]">
                {halls.find((h) => h.id === hallId)?.name}
              </span>
            </div>

            {loadingBookings ? (
              <div className="text-xs text-[#7A6A62] italic">Checking venue availability...</div>
            ) : hallBookings.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-[#15803D] font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                No approved bookings on this date. Hall is completely open!
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {hallBookings.map((b, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEE2E2] px-3 py-1.5 text-xs"
                  >
                    <span className="font-bold text-[#7F1D1D] truncate max-w-[280px]">
                      {b.title}
                    </span>
                    <span className="font-mono text-[#7F1D1D] text-[11px]">
                      {formatBookingTime(b.start_time)} – {formatBookingTime(b.end_time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Volunteers Needed & External Registration Link */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-[#7A6A62]" /> Volunteers Needed
              </label>
              <input
                type="number"
                min="0"
                value={volunteersNeeded}
                onChange={(e) => setVolunteersNeeded(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2.5 text-xs sm:text-sm text-[#2B1B17] placeholder:text-[#A3938B] focus:border-[#B3202A] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-[#7A6A62]" /> External Registration Link (Optional)
              </label>
              <input
                type="url"
                value={registrationLink}
                onChange={(e) => setRegistrationLink(e.target.value)}
                placeholder="https://forms.google.com/... or https://unstop.com/..."
                className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] px-3.5 py-2.5 text-xs sm:text-sm text-[#2B1B17] placeholder:text-[#A3938B] focus:border-[#B3202A] focus:outline-none"
              />
            </div>
          </div>

          {/* Poster Upload (Supabase Storage 'event-posters' bucket) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#2B1B17] mb-1.5 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-[#7A6A62]" /> Event Poster
            </label>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              {posterUrl ? (
                <div className="relative group rounded-xl overflow-hidden border border-[#EADFD6] w-36 h-36 shrink-0 bg-[#FFFAF5]">
                  <img
                    src={posterUrl}
                    alt="Event Poster Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPosterUrl(null)}
                    className="absolute top-1.5 right-1.5 rounded-full bg-black/80 p-1 text-white hover:bg-black transition-colors cursor-pointer"
                    title="Remove poster"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor={fileInputId}
                  className="flex flex-col items-center justify-center w-full sm:w-48 h-36 border-2 border-dashed border-[#EADFD6] rounded-xl cursor-pointer bg-[#FFFAF5] hover:bg-[#FAF0F0] transition-colors p-4 text-center"
                >
                  <UploadCloud className="h-8 w-8 text-[#B3202A] mb-1.5" />
                  <span className="text-xs font-bold text-[#2B1B17]">
                    {uploadingPoster ? 'Uploading...' : 'Upload Poster'}
                  </span>
                  <span className="text-[10px] text-[#7A6A62] mt-0.5">PNG, JPG, WebP</span>
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

              <div className="text-xs text-[#7A6A62] space-y-1.5">
                <p>
                  Upload high-resolution event banners. Uploads are stored in public Supabase
                  Storage bucket <code className="font-mono text-[#B3202A]">event-posters</code>.
                </p>
                <p className="text-[11px] text-[#A3938B]">
                  Posters will be displayed on the student event cards and portal feeds.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-[#EADFD6] bg-[#FFFAF5] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto rounded-xl border border-[#EADFD6] bg-white px-4 py-2.5 text-xs font-semibold text-[#7A6A62] shadow-xs hover:bg-[#FFFAF5] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving || uploadingPoster}
            onClick={() => handleSave('draft')}
            className="w-full sm:w-auto rounded-xl border border-[#EADFD6] bg-white px-5 py-2.5 text-xs font-bold text-[#2B1B17] shadow-xs hover:bg-[#FAF0F0] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>

          <button
            type="button"
            disabled={saving || uploadingPoster}
            onClick={() => handleSave('submitted')}
            className="w-full sm:w-auto rounded-xl bg-[#B3202A] px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {saving ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
