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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header & Date Selector */}
      <div className="rounded-md border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Campus Hall Availability
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Real-time schedule for campus auditoriums and seminar halls.
            </p>
          </div>

          {/* Date Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-md border border-neutral-300 bg-white p-1">
              <button
                onClick={() => handleDateChange(-1)}
                className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 px-2.5 py-0.5">
                <CalendarIcon className="h-3.5 w-3.5 text-[#A4161A]" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-semibold text-neutral-900 focus:outline-none cursor-pointer"
                />
              </div>

              <button
                onClick={() => handleDateChange(1)}
                className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={handleSetToday}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Today
            </button>

            <button
              onClick={() => fetchData(false)}
              disabled={refreshing}
              className="rounded-md border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
              title="Refresh availability"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Date banner & Color Legend */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-md border border-neutral-200 bg-[#F5F5F5] p-4 text-neutral-900">
        <div>
          <div className="text-xs text-neutral-500 font-medium">Selected Date</div>
          <div className="text-base font-bold text-neutral-900 mt-0.5">{formattedDateTitle}</div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Distinct Dark Crimson for Booked */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-[#7F1D1D]"></span>
            <span className="text-neutral-700 font-medium">Booked (Approved)</span>
          </div>
          {/* Amber for Pending */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-[#D97706]"></span>
            <span className="text-neutral-700 font-medium">Pending Review</span>
          </div>
          {/* Green for Free */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-emerald-600 bg-emerald-100"></span>
            <span className="text-neutral-700 font-medium">Available</span>
          </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-md border border-neutral-200 bg-white p-3.5 shadow-xs">
          <div className="text-xs text-neutral-500 font-medium">Campus Venues</div>
          <div className="mt-1 text-xl font-bold text-neutral-900">
            {halls.length}
          </div>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white p-3.5 shadow-xs">
          <div className="text-xs text-neutral-500 font-medium">Total Bookings Today</div>
          <div className="mt-1 text-xl font-bold text-neutral-900">
            {bookings.length}
          </div>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-3.5 shadow-xs">
          <div className="text-xs text-[#991B1B] font-medium">Approved Events</div>
          <div className="mt-1 text-xl font-bold text-[#991B1B]">
            {totalBookedCount}
          </div>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3.5 shadow-xs">
          <div className="text-xs text-amber-800 font-medium">Pending Review</div>
          <div className="mt-1 text-xl font-bold text-amber-900">
            {totalPendingCount}
          </div>
        </div>
      </div>

      {/* Halls Availability List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200"
            />
          ))}
        </div>
      ) : halls.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-12 text-center shadow-xs">
          <Building2 className="mx-auto h-10 w-10 text-neutral-300" />
          <h3 className="mt-3 text-base font-semibold text-neutral-900">No Halls Found</h3>
          <p className="mt-1 text-xs text-neutral-500">
            No hall records available for scheduling.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {halls.map((hall) => {
            const hallBookings = bookingsByHall.get(hall.id) || [];
            const freeSlots = getFreeTimeSlots(hallBookings);

            return (
              <div
                key={hall.id}
                className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs"
              >
                {/* Hall Header */}
                <div className="border-b border-neutral-200 bg-neutral-50 px-5 py-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-[#A4161A] text-white">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-neutral-900">
                          {hall.name}
                        </h2>
                        {hall.location && (
                          <div className="flex items-center gap-1 text-xs text-neutral-500">
                            <MapPin className="h-3 w-3 text-[#A4161A]" />
                            {hall.location}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700">
                        <Users className="h-3.5 w-3.5 text-neutral-400" />
                        {hall.capacity.toLocaleString()} Seats
                      </div>

                      {hallBookings.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          <CheckCircle className="h-3 w-3 text-emerald-700" />
                          Full Day Available
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600">
                          {hallBookings.length} {hallBookings.length === 1 ? 'Booking' : 'Bookings'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* Visual Day Timeline Bar (8 AM - 8 PM) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500 font-mono">
                      <span>8:00 AM</span>
                      <span className="hidden sm:inline">11:00 AM</span>
                      <span>2:00 PM</span>
                      <span className="hidden sm:inline">5:00 PM</span>
                      <span>8:00 PM</span>
                    </div>

                    <div className="relative h-8 w-full overflow-hidden rounded border border-neutral-300 bg-neutral-50">
                      {/* Hour markers */}
                      <div className="absolute inset-0 grid grid-cols-12 pointer-events-none opacity-25">
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-full border-r border-neutral-400 ${
                              idx % 3 === 0 ? 'border-neutral-600' : ''
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
                            className={`absolute top-0.5 bottom-0.5 rounded px-2 flex items-center overflow-hidden cursor-pointer ${
                              isApproved
                                ? 'bg-[#7F1D1D] text-white'
                                : 'bg-[#D97706] text-white'
                            }`}
                            title={`${b.title} (${b.status}): ${formatTime(b.start_time)} - ${formatTime(b.end_time)}`}
                          >
                            <span className="truncate text-xs font-medium">
                              {b.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Free time slots & Bookings detailed list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Free Slots */}
                    <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5">
                      <div className="font-semibold text-emerald-900 flex items-center gap-1.5 text-[11px]">
                        <Clock className="h-3 w-3 text-emerald-700" />
                        Available Windows
                      </div>
                      <div className="space-y-1">
                        {freeSlots.map((slot, sIdx) => (
                          <div
                            key={sIdx}
                            className="flex items-center justify-between text-emerald-800 font-mono text-xs"
                          >
                            <span>
                              {slot.start} – {slot.end}
                            </span>
                            <span className="font-medium text-[11px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900">
                              {slot.duration}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Occupied List */}
                    <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-1.5">
                      <div className="font-semibold text-neutral-800 flex items-center gap-1.5 text-[11px]">
                        <Building2 className="h-3 w-3 text-neutral-500" />
                        Scheduled Bookings ({hallBookings.length})
                      </div>
                      {hallBookings.length === 0 ? (
                        <div className="text-neutral-500 italic text-xs py-1">
                          No events scheduled for this date.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {hallBookings.map((b, bIdx) => (
                            <div
                              key={bIdx}
                              className="flex items-center justify-between border-b border-neutral-200 pb-1 last:border-0 last:pb-0"
                            >
                              <div>
                                <div className="font-medium text-neutral-900 line-clamp-1">{b.title}</div>
                                <div className="text-[11px] text-neutral-500 font-mono">
                                  {formatTime(b.start_time)} – {formatTime(b.end_time)}
                                </div>
                              </div>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  b.status === 'approved'
                                    ? 'bg-red-100 text-[#991B1B] border border-red-200'
                                    : 'bg-amber-100 text-amber-900 border border-amber-200'
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
        <div className="mx-auto max-w-7xl px-4 py-8 space-y-4">
          <div className="h-20 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200" />
            ))}
          </div>
        </div>
      }
    >
      <HallsContent />
    </Suspense>
  );
}
