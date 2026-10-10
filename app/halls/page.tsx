'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Hall, PublicHallBooking } from '@/lib/types';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  MapPin,
  CheckCircle,
  Building2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

const DAY_START_HOUR = 8; // 8:00 AM
const DAY_END_HOUR = 20; // 8:00 PM
const TOTAL_DAY_HOURS = DAY_END_HOUR - DAY_START_HOUR;

function getTodayString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function HallsContent() {
  const [selectedDate, setSelectedDate] = useState('2026-10-10');

  const [halls, setHalls] = useState<Hall[]>([]);
  const [bookings, setBookings] = useState<PublicHallBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Initialize client date on mount
  useEffect(() => {
    setSelectedDate(getTodayString());
  }, []);

  const fetchData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      else setRefreshing(true);

      try {
        // 1. Fetch all halls
        const { data: hallsData, error: hallsError } = await supabase
          .from('halls')
          .select('*')
          .order('capacity', { ascending: false });

        if (hallsError) throw hallsError;
        setHalls(hallsData || []);

        // 2. Fetch bookings from public_hall_bookings for the selected date
        const startOfDay = `${selectedDate}T00:00:00.000Z`;
        const endOfDay = `${selectedDate}T23:59:59.999Z`;

        const { data: bookingsData, error: bookingsError } = await supabase
          .from('public_hall_bookings')
          .select('*')
          .gte('end_time', startOfDay)
          .lte('start_time', endOfDay)
          .order('start_time', { ascending: true });

        if (bookingsError) throw bookingsError;
        setBookings(bookingsData || []);
      } catch (err) {
        console.error('Error loading halls/bookings:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [supabase, selectedDate]
  );

  useEffect(() => {
    let ignore = false;
    async function init() {
      setLoading(true);
      try {
        const [hallsRes, bookingsRes] = await Promise.all([
          supabase.from('halls').select('*').order('capacity', { ascending: false }),
          supabase
            .from('public_hall_bookings')
            .select('*')
            .gte('end_time', `${selectedDate}T00:00:00.000Z`)
            .lte('start_time', `${selectedDate}T23:59:59.999Z`)
            .order('start_time', { ascending: true }),
        ]);

        if (!ignore) {
          if (!hallsRes.error && hallsRes.data) setHalls(hallsRes.data);
          if (!bookingsRes.error && bookingsRes.data) setBookings(bookingsRes.data);
        }
      } catch (err) {
        if (!ignore) console.error('Error loading halls/bookings:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    init();
    return () => {
      ignore = true;
    };
  }, [supabase, selectedDate]);

  const handleDateChange = (daysOffset: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const currentDate = new Date(y, m - 1, d);
    currentDate.setDate(currentDate.getDate() + daysOffset);
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleSetToday = () => {
    setSelectedDate(getTodayString());
  };

  const formattedDateTitle = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [selectedDate]);

  // Group bookings by hall_id
  const bookingsByHall = useMemo(() => {
    const map = new Map<string, PublicHallBooking[]>();
    for (const h of halls) {
      map.set(h.id, []);
    }
    for (const b of bookings) {
      const list = map.get(b.hall_id) || [];
      list.push(b);
      map.set(b.hall_id, list);
    }
    return map;
  }, [halls, bookings]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Timeline position calculation (8 AM - 8 PM)
  const getTimelinePosition = (startTimeStr: string, endTimeStr: string) => {
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);

    const startHourDecimal = start.getHours() + start.getMinutes() / 60;
    const endHourDecimal = end.getHours() + end.getMinutes() / 60;

    const clampedStart = Math.max(DAY_START_HOUR, Math.min(DAY_END_HOUR, startHourDecimal));
    const clampedEnd = Math.max(DAY_START_HOUR, Math.min(DAY_END_HOUR, endHourDecimal));

    const leftPercent = ((clampedStart - DAY_START_HOUR) / TOTAL_DAY_HOURS) * 100;
    const widthPercent = Math.max(2, ((clampedEnd - clampedStart) / TOTAL_DAY_HOURS) * 100);

    return { left: `${leftPercent}%`, width: `${widthPercent}%` };
  };

  // Calculate free time intervals for a hall between 8:00 AM and 8:00 PM
  const getFreeTimeSlots = (hallBookings: PublicHallBooking[]) => {
    if (hallBookings.length === 0) {
      return [{ start: '08:00 AM', end: '08:00 PM', duration: '12 hrs' }];
    }

    const freeSlots: { start: string; end: string; duration: string }[] = [];
    const sorted = [...hallBookings].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    let currentHour = DAY_START_HOUR;

    for (const booking of sorted) {
      const bStart = new Date(booking.start_time);
      const bEnd = new Date(booking.end_time);
      const bStartHour = bStart.getHours() + bStart.getMinutes() / 60;
      const bEndHour = bEnd.getHours() + bEnd.getMinutes() / 60;

      if (bStartHour > currentHour + 0.1) {
        const startFormat = formatTime(
          new Date(new Date(selectedDate).setHours(Math.floor(currentHour), (currentHour % 1) * 60)).toISOString()
        );
        const endFormat = formatTime(bStart.toISOString());
        const diffHrs = (bStartHour - currentHour).toFixed(1);
        freeSlots.push({ start: startFormat, end: endFormat, duration: `${diffHrs} hrs` });
      }

      currentHour = Math.max(currentHour, bEndHour);
    }

    if (currentHour < DAY_END_HOUR - 0.1) {
      const startFormat = formatTime(
        new Date(new Date(selectedDate).setHours(Math.floor(currentHour), (currentHour % 1) * 60)).toISOString()
      );
      const endFormat = '08:00 PM';
      const diffHrs = (DAY_END_HOUR - currentHour).toFixed(1);
      freeSlots.push({ start: startFormat, end: endFormat, duration: `${diffHrs} hrs` });
    }

    return freeSlots;
  };

  const totalBookedCount = bookings.filter((b) => b.status === 'approved').length;
  const totalPendingCount = bookings.filter((b) => b.status === 'submitted').length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header & Date Selector */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#EADFD6] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A24B]/30 bg-[#FDF8ED] px-3 py-1 text-xs font-bold text-[#A07C28] mb-2">
            <Building2 className="h-3.5 w-3.5" />
            Public Hall Schedule
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2B1B17]">
            Campus Hall Availability
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#7A6A62]">
            Real-time clash-checked schedule for all auditoriums and seminar halls
          </p>
        </div>

        {/* Date Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-[#EADFD6] bg-[#FFFFFF] p-1 shadow-xs">
            <button
              onClick={() => handleDateChange(-1)}
              className="rounded-lg p-2 text-[#7A6A62] hover:bg-[#FFFAF5] hover:text-[#B3202A] transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1">
              <CalendarIcon className="h-4 w-4 text-[#B3202A]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-bold text-[#2B1B17] focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => handleDateChange(1)}
              className="rounded-lg p-2 text-[#7A6A62] hover:bg-[#FFFAF5] hover:text-[#B3202A] transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleSetToday}
            className="rounded-xl border border-[#EADFD6] bg-[#FFFFFF] px-3.5 py-2 text-xs font-bold text-[#2B1B17] shadow-xs hover:border-[#B3202A] hover:text-[#B3202A] hover:bg-[#FAF0F0] transition-colors cursor-pointer"
          >
            Today
          </button>

          <button
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="rounded-xl border border-[#EADFD6] bg-[#FFFFFF] p-2 text-[#7A6A62] shadow-xs hover:border-[#B3202A] hover:text-[#B3202A] transition-colors cursor-pointer"
            title="Refresh availability"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Date banner & Color Legend */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl bg-[#2B1B17] p-5 text-white shadow-sm">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#E5C378] font-mono font-semibold">
            Hall Timeline For
          </div>
          <div className="font-serif text-xl font-bold mt-0.5">{formattedDateTitle}</div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Distinct Crimson for Booked */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#681116] ring-2 ring-[#FECACA]"></span>
            <span className="text-white/90 font-medium">Booked (Approved Event)</span>
          </div>
          {/* Amber for Pending */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#D97706] ring-2 ring-[#FDE68A]"></span>
            <span className="text-white/90 font-medium">Pending Review (Submitted)</span>
          </div>
          {/* Green / Dashed for Free */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-dashed border-[#BBF7D0] bg-[#15803D]"></span>
            <span className="text-white/90 font-medium">Free Availability</span>
          </div>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#EADFD6] bg-[#FFFFFF] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#7A6A62] uppercase tracking-wider">Campus Venues</div>
          <div className="mt-1 font-serif text-2xl font-bold text-[#2B1B17]">
            {halls.length} Halls
          </div>
        </div>
        <div className="rounded-2xl border border-[#EADFD6] bg-[#FFFFFF] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#7A6A62] uppercase tracking-wider">Total Bookings Today</div>
          <div className="mt-1 font-serif text-2xl font-bold text-[#2B1B17]">
            {bookings.length}
          </div>
        </div>
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEE2E2] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#7F1D1D] uppercase tracking-wider">Approved Events</div>
          <div className="mt-1 font-serif text-2xl font-bold text-[#7F1D1D]">
            {totalBookedCount}
          </div>
        </div>
        <div className="rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#B45309] uppercase tracking-wider">Pending Review</div>
          <div className="mt-1 font-serif text-2xl font-bold text-[#B45309]">
            {totalPendingCount}
          </div>
        </div>
      </div>

      {/* Halls Availability List */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 w-full animate-pulse rounded-2xl bg-[#EADFD6]/40"
            />
          ))}
        </div>
      ) : halls.length === 0 ? (
        <div className="rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <Building2 className="mx-auto h-12 w-12 text-[#D5C5B8]" />
          <h3 className="mt-3 font-serif text-lg font-bold text-[#2B1B17]">No Halls Found</h3>
          <p className="mt-1 text-xs text-[#7A6A62]">
            Run the database seed script to populate halls and test bookings.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {halls.map((hall) => {
            const hallBookings = bookingsByHall.get(hall.id) || [];
            const freeSlots = getFreeTimeSlots(hallBookings);

            return (
              <div
                key={hall.id}
                className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-[#FFFFFF] shadow-xs transition-all hover:border-[#B3202A]/40"
              >
                {/* Hall Header */}
                <div className="border-b border-[#EADFD6] bg-[#FFFAF5] px-6 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B3202A] text-white shadow-xs">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-serif text-lg font-bold text-[#2B1B17]">
                          {hall.name}
                        </h2>
                        {hall.location && (
                          <div className="flex items-center gap-1 text-xs text-[#7A6A62]">
                            <MapPin className="h-3.5 w-3.5 text-[#B3202A]" />
                            {hall.location}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#EADFD6] bg-[#FFFFFF] px-3 py-1 text-xs font-bold text-[#2B1B17]">
                        <Users className="h-3.5 w-3.5 text-[#7A6A62]" />
                        {hall.capacity.toLocaleString()} Seats
                      </div>

                      {hallBookings.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[#BBF7D0] bg-[#DCFCE7] px-3 py-1 text-xs font-bold text-[#15803D]">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Full Day Free
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[#EADFD6] bg-[#FFFFFF] px-3 py-1 text-xs font-bold text-[#7A6A62]">
                          {hallBookings.length} {hallBookings.length === 1 ? 'Slot' : 'Slots'} Occupied
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Visual Day Timeline Bar (8 AM - 8 PM) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#7A6A62] uppercase tracking-wider font-mono">
                      <span>8:00 AM</span>
                      <span className="hidden sm:inline">11:00 AM</span>
                      <span>2:00 PM</span>
                      <span className="hidden sm:inline">5:00 PM</span>
                      <span>8:00 PM</span>
                    </div>

                    <div className="relative h-10 w-full overflow-hidden rounded-xl border border-[#EADFD6] bg-[#FFFAF5]">
                      {/* Hour markers */}
                      <div className="absolute inset-0 grid grid-cols-12 pointer-events-none opacity-20">
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-full border-r border-[#7A6A62] ${
                              idx % 3 === 0 ? 'border-[#2B1B17]' : ''
                            }`}
                          />
                        ))}
                      </div>

                      {/* Render booked / submitted time blocks */}
                      {hallBookings.map((b, idx) => {
                        const { left, width } = getTimelinePosition(b.start_time, b.end_time);
                        const isApproved = b.status === 'approved';

                        return (
                          <div
                            key={idx}
                            style={{ left, width }}
                            className={`absolute top-1 bottom-1 rounded-lg px-2 flex items-center shadow-xs overflow-hidden transition-transform hover:z-10 hover:scale-[1.01] cursor-pointer ${
                              isApproved
                                ? 'bg-[#681116] text-white ring-1 ring-[#FECACA]'
                                : 'bg-[#D97706] text-white ring-1 ring-[#FDE68A]'
                            }`}
                            title={`${b.title} (${b.status}): ${formatTime(b.start_time)} - ${formatTime(b.end_time)}`}
                          >
                            <span className="truncate text-xs font-bold tracking-tight">
                              {b.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Free time slots & Bookings detailed list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Free Slots */}
                    <div className="rounded-xl border border-[#BBF7D0] bg-[#DCFCE7]/30 p-4 space-y-2">
                      <div className="font-bold text-[#15803D] uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                        <Clock className="h-3.5 w-3.5" />
                        Available Windows (Free for proposals)
                      </div>
                      <div className="space-y-1.5">
                        {freeSlots.map((slot, sIdx) => (
                          <div
                            key={sIdx}
                            className="flex items-center justify-between text-[#15803D] font-mono text-xs"
                          >
                            <span>
                              {slot.start} – {slot.end}
                            </span>
                            <span className="font-bold text-[11px] bg-[#DCFCE7] px-2 py-0.5 rounded-md border border-[#BBF7D0]">
                              {slot.duration}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Occupied List */}
                    <div className="rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-4 space-y-2">
                      <div className="font-bold text-[#7A6A62] uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                        <Building2 className="h-3.5 w-3.5" />
                        Scheduled Bookings ({hallBookings.length})
                      </div>
                      {hallBookings.length === 0 ? (
                        <div className="text-[#7A6A62] italic text-xs py-1">
                          No events booked for this hall on this date.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {hallBookings.map((b, bIdx) => (
                            <div
                              key={bIdx}
                              className="flex items-center justify-between border-b border-[#EADFD6] pb-1.5 last:border-0 last:pb-0"
                            >
                              <div>
                                <div className="font-bold text-[#2B1B17] line-clamp-1">{b.title}</div>
                                <div className="text-[11px] text-[#7A6A62] font-mono">
                                  {formatTime(b.start_time)} – {formatTime(b.end_time)}
                                </div>
                              </div>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  b.status === 'approved'
                                    ? 'bg-[#FEE2E2] text-[#7F1D1D] border border-[#FECACA]'
                                    : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                                }`}
                              >
                                {b.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HallsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-12 space-y-6">
          <div className="h-24 w-full animate-pulse rounded-2xl bg-[#EADFD6]/40" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 w-full animate-pulse rounded-2xl bg-[#EADFD6]/40" />
            ))}
          </div>
        </div>
      }
    >
      <HallsContent />
    </Suspense>
  );
}
