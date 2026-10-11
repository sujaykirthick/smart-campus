'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Hall, PublicHallBooking } from '@/lib/types';
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  EmptyState,
  SkeletonCard,
} from '@/components/ui';
import { formatHall } from '@/lib/format';
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
  Info,
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

  useEffect(() => {
    setSelectedDate(getTodayString());
  }, []);

  const fetchData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      else setRefreshing(true);

      try {
        const { data: hallsData, error: hallsError } = await supabase
          .from('halls')
          .select('*')
          .order('capacity', { ascending: false });

        if (hallsError) throw hallsError;
        setHalls(hallsData || []);

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

  const getFreeTimeSlots = (hallBookings: PublicHallBooking[]) => {
    if (hallBookings.length === 0) {
      return [{ start: '08:00 AM', end: '08:00 PM', duration: '12 hrs free' }];
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
        freeSlots.push({ start: startFormat, end: endFormat, duration: `${diffHrs} hrs free` });
      }

      currentHour = Math.max(currentHour, bEndHour);
    }

    if (currentHour < DAY_END_HOUR - 0.1) {
      const startFormat = formatTime(
        new Date(new Date(selectedDate).setHours(Math.floor(currentHour), (currentHour % 1) * 60)).toISOString()
      );
      const endFormat = '08:00 PM';
      const diffHrs = (DAY_END_HOUR - currentHour).toFixed(1);
      freeSlots.push({ start: startFormat, end: endFormat, duration: `${diffHrs} hrs free` });
    }

    return freeSlots;
  };

  const totalBookedCount = bookings.filter(
    (b) => b.status === 'booked' || b.status === 'approved' || b.approval_stage === 'cd'
  ).length;
  const totalPendingCount = bookings.filter(
    (b) => b.status === 'pending' || (b.status === 'submitted' && b.approval_stage !== 'cd')
  ).length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Hall Availability Schedule"
        description="Live timeline of campus auditoriums, seminar halls, and booking reservations."
      />

      {/* ALWAYS VISIBLE / STICKY DATE NAVIGATION BAR */}
      <div className="sticky top-16 z-20 rounded-xl border border-neutral-200 bg-white/95 backdrop-blur-md p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Active Date Title */}
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-[#A4161A] shrink-0">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                Viewing Schedule For
              </div>
              <div className="text-base font-extrabold text-neutral-900 leading-tight">
                {formattedDateTitle}
              </div>
            </div>
          </div>

          {/* Date Step Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-neutral-300 bg-white p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDateChange(-1)}
                aria-label="Previous day"
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1.5 px-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-neutral-900 focus:outline-none cursor-pointer"
                  aria-label="Select date"
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDateChange(1)}
                aria-label="Next day"
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="secondary" size="sm" onClick={handleSetToday}>
              Today
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchData(false)}
              disabled={refreshing}
              aria-label="Refresh availability"
              className="h-9 w-9 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* CLEAR COLOR LEGEND & SUMMARY BANNER */}
      <Card className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-neutral-50/70">
        <div className="flex flex-wrap items-center gap-5 text-xs">
          <span className="font-bold text-neutral-500 uppercase tracking-wider text-[11px]">
            Schedule Legend:
          </span>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-[#A4161A] shadow-xs" />
            <span className="font-semibold text-neutral-900">Booked (Reserved)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-amber-500 shadow-xs" />
            <span className="font-semibold text-neutral-900">Pending Approval</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-emerald-500 bg-emerald-100 shadow-xs" />
            <span className="font-semibold text-neutral-900">Available Window</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-neutral-600 font-medium">
          <span>{totalBookedCount} Booked</span>
          <span>•</span>
          <span>{totalPendingCount} Pending</span>
          <span>•</span>
          <span>{halls.length} Halls</span>
        </div>
      </Card>

      {/* HALLS LIST */}
      {loading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : halls.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6 text-neutral-400" />}
          title="No campus halls found"
          description="Hall configurations have not been configured yet."
        />
      ) : (
        <div className="space-y-4">
          {halls.map((hall) => {
            const hallBookings = bookingsByHall.get(hall.id) || [];
            const freeSlots = getFreeTimeSlots(hallBookings);

            return (
              <Card key={hall.id} className="overflow-hidden">
                {/* Hall Header Bar */}
                <div className="border-b border-neutral-200 bg-neutral-50/70 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#A4161A] text-white shrink-0">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-neutral-900">
                        {hall.name}
                      </h2>
                      {hall.location && (
                        <div className="flex items-center gap-1 text-xs text-neutral-500">
                          <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
                          <span>{hall.location}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 flex items-center gap-1.5 shadow-xs">
                      <Users className="h-3.5 w-3.5 text-neutral-400" />
                      {hall.capacity.toLocaleString()} Capacity
                    </span>

                    {hallBookings.length === 0 ? (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> All-Day Free
                      </span>
                    ) : (
                      <span className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600">
                        {hallBookings.length} {hallBookings.length === 1 ? 'Booking' : 'Bookings'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timeline and Slots Body */}
                <div className="p-4 sm:p-5 space-y-4">
                  {/* READABLE HOURLY TIMELINE BAR */}
                  <div className="space-y-1.5 overflow-x-auto pb-1">
                    <div className="min-w-[500px]">
                      {/* Hour Axis Labels */}
                      <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500 font-mono pb-1">
                        <span>8:00 AM</span>
                        <span>10:00 AM</span>
                        <span>12:00 PM</span>
                        <span>2:00 PM</span>
                        <span>4:00 PM</span>
                        <span>6:00 PM</span>
                        <span>8:00 PM</span>
                      </div>

                      {/* Visual Bar Track */}
                      <div className="relative h-9 w-full overflow-hidden rounded-lg border border-neutral-300 bg-emerald-50/40">
                        {/* Hour Grid Columns */}
                        <div className="absolute inset-0 grid grid-cols-12 pointer-events-none opacity-30">
                          {Array.from({ length: 12 }).map((_, idx) => (
                            <div
                              key={idx}
                              className={`h-full border-r border-neutral-400 ${
                                idx % 2 === 1 ? 'border-neutral-500' : ''
                              }`}
                            />
                          ))}
                        </div>

                        {/* Booking Time Blocks */}
                        {hallBookings.map((b, idx) => {
                          const { left, width } = getTimelinePosition(b.start_time, b.end_time);
                          const isBooked =
                            b.status === 'booked' ||
                            b.status === 'approved' ||
                            b.approval_stage === 'cd';

                          return (
                            <div
                              key={idx}
                              style={{ left, width }}
                              className={`absolute top-0.5 bottom-0.5 rounded-md px-2 flex items-center overflow-hidden cursor-default shadow-xs ${
                                isBooked
                                  ? 'bg-[#A4161A] text-white'
                                  : 'bg-amber-500 text-white'
                              }`}
                              title={`${b.title} (${isBooked ? 'Booked' : 'Pending'}): ${formatTime(b.start_time)} – ${formatTime(b.end_time)}`}
                            >
                              <span className="truncate text-xs font-semibold">
                                {b.title}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Free Windows vs Occupied List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                    {/* Available Windows */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3 space-y-1.5">
                      <div className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                        <Clock className="h-3.5 w-3.5 text-emerald-700" /> Available Windows
                      </div>
                      <div className="space-y-1">
                        {freeSlots.map((slot, sIdx) => (
                          <div
                            key={sIdx}
                            className="flex items-center justify-between font-mono text-xs text-emerald-800"
                          >
                            <span>
                              {slot.start} – {slot.end}
                            </span>
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-900">
                              {slot.duration}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Scheduled Bookings */}
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 space-y-1.5">
                      <div className="font-bold text-neutral-800 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                        <Building2 className="h-3.5 w-3.5 text-neutral-500" />
                        Bookings on this Date ({hallBookings.length})
                      </div>
                      {hallBookings.length === 0 ? (
                        <div className="text-neutral-500 italic text-xs py-1">
                          No events scheduled for this date.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {hallBookings.map((b, bIdx) => {
                            const isBooked =
                              b.status === 'booked' ||
                              b.status === 'approved' ||
                              b.approval_stage === 'cd';

                            return (
                              <div
                                key={bIdx}
                                className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5 last:border-0 last:pb-0"
                              >
                                <div>
                                  <div className="font-semibold text-neutral-900 line-clamp-1">
                                    {b.title}
                                  </div>
                                  <div className="text-[11px] text-neutral-500 font-mono">
                                    {formatTime(b.start_time)} – {formatTime(b.end_time)}
                                  </div>
                                </div>
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                    isBooked
                                      ? 'bg-red-100 text-[#991B1B] border border-red-200'
                                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                                  }`}
                                >
                                  {isBooked ? 'Booked' : 'Pending'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
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
        <div className="mx-auto max-w-[1200px] px-4 py-8 space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      }
    >
      <HallsContent />
    </Suspense>
  );
}
