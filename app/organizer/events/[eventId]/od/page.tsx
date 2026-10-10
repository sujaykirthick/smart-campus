'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Registration, AllowedUser } from '@/lib/types';
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Search,
  Filter,
  Users,
  Building2,
  QrCode,
  Calendar,
  MapPin,
  RefreshCw,
  Loader2,
  Check,
  ShieldCheck,
} from 'lucide-react';

interface AttendeeRow extends Registration {
  student_name?: string;
  department_name?: string;
}

export default function OrganizerODPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scanned' | 'unscanned'>('all');
  const [exportSuccess, setExportSuccess] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Department parser from roll number
  const parseDepartmentFromRoll = (rollNo?: string | null, knownDept?: string | null): string => {
    if (knownDept && knownDept.trim()) return knownDept.trim();
    if (!rollNo) return 'General Department';

    const clean = rollNo.toLowerCase().trim();
    // Pattern like cb.en.u4cse23108, cb.ps.i5das24049, etc.
    const match = clean.match(/(?:u4|i5|p2|u2|u3|i2|btech|mtech|msc|int)([a-z]{2,5})/i);
    const code = match ? match[1].toLowerCase() : '';

    const deptMap: Record<string, string> = {
      cse: 'Computer Science & Engineering',
      cys: 'Cyber Security',
      aie: 'Artificial Intelligence & Data Science',
      das: 'Data Science',
      ece: 'Electronics & Communication',
      eee: 'Electrical & Electronics',
      mee: 'Mechanical Engineering',
      mec: 'Mechanical Engineering',
      aee: 'Aerospace Engineering',
      aer: 'Aerospace Engineering',
      cve: 'Civil Engineering',
      civ: 'Civil Engineering',
      che: 'Chemical Engineering',
      bt: 'Biotechnology',
      bio: 'Biotechnology',
      com: 'Commerce & Management',
      mba: 'School of Business',
      eng: 'Humanities & Languages',
      mat: 'Mathematics',
      phy: 'Physics',
    };

    if (code && deptMap[code]) {
      return deptMap[code];
    }

    if (code) {
      return code.toUpperCase();
    }

    return 'General Campus Student';
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        router.push('/login');
        return;
      }

      // Fetch event
      const { data: eventData } = await supabase
        .from('events')
        .select('*, halls(id, name, capacity, location), fests(id, name)')
        .eq('id', eventId)
        .maybeSingle();

      if (!eventData) {
        router.push('/organizer');
        return;
      }

      // Authorization: Organizer or Affairs only
      if (eventData.organizer_email !== user.email) {
        const { data: userRole } = await supabase
          .from('allowed_users')
          .select('role')
          .eq('email', user.email)
          .maybeSingle();

        if (userRole?.role !== 'affairs') {
          alert('Unauthorized: Only the event organizer can access the OD attendance list.');
          router.push('/events');
          return;
        }
      }

      setEvent(eventData as CampusEvent);

      // Fetch registrations
      const { data: regsData } = await supabase
        .from('registrations')
        .select('*')
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: false, nullsFirst: false });

      // Fetch allowed_users to get student names and departments
      const { data: usersData } = await supabase.from('allowed_users').select('*');
      const usersMap = new Map<string, AllowedUser>();
      if (usersData) {
        usersData.forEach((u) => usersMap.set(u.email, u));
      }

      if (regsData) {
        const enriched: AttendeeRow[] = regsData.map((reg) => {
          const userMeta = usersMap.get(reg.student_email);
          const dept = parseDepartmentFromRoll(reg.roll_no, userMeta?.department);
          return {
            ...reg,
            student_name: userMeta?.name || reg.student_email.split('@')[0],
            department_name: dept,
          };
        });
        setAttendees(enriched);
      }
    } catch (err) {
      console.error('Error loading OD data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, eventId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Scanned / Attended students list (OD Eligible)
  const scannedAttendees = useMemo(() => {
    return attendees.filter((a) => a.checked_in_at !== null);
  }, [attendees]);

  // Filtered attendees for the view table
  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      // Status filter
      if (statusFilter === 'scanned' && !a.checked_in_at) return false;
      if (statusFilter === 'unscanned' && a.checked_in_at) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesEmail = a.student_email.toLowerCase().includes(q);
        const matchesName = (a.student_name || '').toLowerCase().includes(q);
        const matchesRoll = (a.roll_no || '').toLowerCase().includes(q);
        const matchesDept = (a.department_name || '').toLowerCase().includes(q);
        if (!matchesEmail && !matchesName && !matchesRoll && !matchesDept) return false;
      }

      return true;
    });
  }, [attendees, statusFilter, searchQuery]);

  // CSV Export Function (Scanned students only)
  const exportODCsv = () => {
    if (scannedAttendees.length === 0) {
      alert('No students have been checked in yet. Only scanned students can be exported to the OD attendance list.');
      return;
    }

    const eventTitle = event?.title || 'Campus Event';
    const eventDate = event?.start_time
      ? new Date(event.start_time).toLocaleDateString('en-US')
      : new Date().toLocaleDateString('en-US');

    // Headers: roll_no, name, email, department, event_title, date, scan_time
    const headers = ['Roll No', 'Student Name', 'Email', 'Department', 'Event Title', 'Event Date', 'Check-in Time'];

    const escapeCsv = (val: string | null | undefined) => {
      if (!val) return '""';
      const clean = val.replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = scannedAttendees.map((student) => {
      const scanTimeStr = student.checked_in_at
        ? new Date(student.checked_in_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })
        : '';

      return [
        escapeCsv(student.roll_no || 'N/A'),
        escapeCsv(student.student_name || student.student_email),
        escapeCsv(student.student_email),
        escapeCsv(student.department_name || 'General'),
        escapeCsv(eventTitle),
        escapeCsv(eventDate),
        escapeCsv(scanTimeStr),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const cleanName = (event?.title || 'event')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .substring(0, 30);
    link.href = url;
    link.setAttribute('download', `${cleanName}_OD_Attendance_List.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 4000);
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Top Breadcrumb Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/organizer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#EADFD6] bg-white text-[#2B1B17] shadow-xs hover:bg-[#FFFAF5] hover:text-[#B3202A] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              On-Duty (OD) Attendance Export
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2B1B17]">
              {event?.title || 'Event Attendance'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/organizer/scan/${eventId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#EADFD6] bg-white px-4 py-2.5 text-xs font-semibold text-[#2B1B17] shadow-xs hover:bg-[#FFFAF5] hover:text-[#B3202A] transition-colors"
          >
            <QrCode className="h-4 w-4 text-[#B3202A]" />
            Open Scanner
          </Link>

          <button
            onClick={exportODCsv}
            disabled={scannedAttendees.length === 0}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold shadow-xs transition-all cursor-pointer ${
              scannedAttendees.length === 0
                ? 'bg-[#EADFD6]/50 text-[#7A6A62]/60 cursor-not-allowed'
                : exportSuccess
                ? 'bg-emerald-700 text-white'
                : 'bg-[#B3202A] text-white hover:bg-[#8E1A22]'
            }`}
          >
            {exportSuccess ? (
              <>
                <Check className="h-4 w-4" /> Downloaded CSV
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> Export OD List ({scannedAttendees.length})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Event Details and Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs md:col-span-2">
          <div className="text-xs font-semibold text-[#7A6A62] uppercase tracking-wider">Event Details</div>
          <div className="mt-2 space-y-1.5 text-xs text-[#2B1B17]">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-[#B3202A]" />
              <span>{event?.halls?.name || 'Venue'}</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[#7A6A62]">
              <Calendar className="h-3.5 w-3.5 text-[#C9A24B]" />
              <span>
                {event?.start_time ? new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
            <span>OD Eligible (Scanned)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="font-serif text-3xl font-extrabold text-emerald-900 mt-2">
            {scannedAttendees.length}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">
            Included in CSV export
          </div>
        </div>

        <div className="rounded-2xl border border-[#C9A24B]/30 bg-gradient-to-br from-[#FFFAF5] to-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#8E1A22]">
            <span>Total Registered</span>
            <Users className="h-4 w-4 text-[#B3202A]" />
          </div>
          <div className="font-serif text-3xl font-extrabold text-[#2B1B17] mt-2">
            {attendees.length}
          </div>
          <div className="text-[11px] text-[#7A6A62] mt-1">
            {attendees.length - scannedAttendees.length} unverified
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#EADFD6] shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A62]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, roll number, email, or department..."
            className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5]/40 py-2 pl-10 pr-4 text-xs text-[#2B1B17] placeholder:text-[#7A6A62]/60 focus:border-[#B3202A] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#7A6A62] bg-[#FFFAF5] rounded-xl px-3 py-1.5 border border-[#EADFD6]">
          <Filter className="h-3.5 w-3.5 text-[#B3202A]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'scanned' | 'unscanned')}
            className="bg-transparent text-xs font-semibold text-[#2B1B17] focus:outline-none cursor-pointer"
          >
            <option value="all">All Registrations ({attendees.length})</option>
            <option value="scanned">Scanned / Present ({scannedAttendees.length})</option>
            <option value="unscanned">Unscanned / Absent ({attendees.length - scannedAttendees.length})</option>
          </select>
        </div>
      </div>

      {/* Attendees Table */}
      {loading ? (
        <div className="h-64 w-full animate-pulse rounded-2xl bg-[#EADFD6]/50" />
      ) : filteredAttendees.length === 0 ? (
        <div className="rounded-2xl border border-[#EADFD6] bg-white p-12 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-[#EADFD6]" />
          <h3 className="mt-3 font-serif text-base font-bold text-[#2B1B17]">
            No attendees match this filter
          </h3>
          <p className="mt-1 text-sm text-[#7A6A62]">
            Try adjusting your search query or switching the status filter.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#EADFD6] bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#EADFD6] text-left text-xs">
              <thead className="bg-[#FFFAF5] font-bold uppercase tracking-wider text-[#7A6A62]">
                <tr>
                  <th scope="col" className="py-3.5 pl-6 pr-3">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Roll Number
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Student Name
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Department
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Email
                  </th>
                  <th scope="col" className="px-3 py-3.5">
                    Check-in Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EADFD6] text-[#2B1B17]">
                {filteredAttendees.map((row) => {
                  const isChecked = !!row.checked_in_at;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[#FFFAF5] transition-colors ${
                        isChecked ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap py-4 pl-6 pr-3 font-medium">
                        {isChecked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3 text-emerald-700" /> Scanned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFAF5] border border-[#EADFD6] px-2.5 py-0.5 text-[11px] font-medium text-[#7A6A62]">
                            <Clock className="h-3 w-3 text-[#7A6A62]" /> Pending
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-4 font-mono font-bold text-[#8E1A22]">
                        {row.roll_no || 'N/A'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-4 font-semibold text-[#2B1B17]">
                        {row.student_name || '-'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-4 text-[#7A6A62]">
                        {row.department_name || 'General'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-4 font-mono text-[11px] text-[#7A6A62]">
                        {row.student_email}
                      </td>

                      <td className="whitespace-nowrap px-3 py-4 font-mono text-[11px] text-[#7A6A62]">
                        {formatDateTime(row.checked_in_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
