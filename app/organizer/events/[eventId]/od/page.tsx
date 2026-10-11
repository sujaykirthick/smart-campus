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
  Calendar,
  MapPin,
  Check,
  QrCode,
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
        .select('*, halls:halls!events_hall_id_fkey(id, name, capacity, location), fests(id, name)')
        .eq('id', eventId)
        .maybeSingle();

      if (!eventData) {
        router.push('/organizer');
        return;
      }

      // Authorization: Organizer or Approvers
      if (eventData.organizer_email !== user.email) {
        const { data: userRole } = await supabase
          .from('allowed_users')
          .select('role')
          .eq('email', user.email)
          .maybeSingle();

        if (!userRole || !['student_affairs', 'event_office', 'cd'].includes(userRole.role)) {
          alert('Unauthorized: Only the event organizer or approval authorities can access the OD attendance list.');
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

      // Fetch allowed_users
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

  const scannedAttendees = useMemo(() => {
    return attendees.filter((a) => a.checked_in_at !== null);
  }, [attendees]);

  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      if (statusFilter === 'scanned' && !a.checked_in_at) return false;
      if (statusFilter === 'unscanned' && a.checked_in_at) return false;

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

  // CSV Export Function
  const exportODCsv = () => {
    if (scannedAttendees.length === 0) {
      alert('No students checked in yet. Only scanned attendees can be exported for OD.');
      return;
    }

    const eventTitle = event?.title || 'Campus Event';
    const eventDate = event?.start_time
      ? new Date(event.start_time).toLocaleDateString('en-US')
      : new Date().toLocaleDateString('en-US');

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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/organizer"
            className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              On-Duty (OD) Attendance Export
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              {event?.title || 'Event Attendance'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/organizer/scan/${eventId}`}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <QrCode className="h-3.5 w-3.5 text-[#A4161A]" />
            Scanner
          </Link>

          <button
            onClick={exportODCsv}
            disabled={scannedAttendees.length === 0}
            className={`inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              scannedAttendees.length === 0
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                : exportSuccess
                ? 'bg-emerald-700 text-white'
                : 'bg-[#A4161A] text-white hover:bg-[#851215]'
            }`}
          >
            {exportSuccess ? (
              <>
                <Check className="h-3.5 w-3.5" /> CSV Downloaded
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" /> Export OD CSV ({scannedAttendees.length})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs md:col-span-2">
          <div className="text-xs font-medium text-neutral-500">Event Details</div>
          <div className="mt-1.5 space-y-1 text-xs text-neutral-800">
            <div className="flex items-center gap-1.5 font-medium">
              <MapPin className="h-3.5 w-3.5 text-[#A4161A]" />
              <span>{event?.halls?.name || 'Venue'}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-neutral-500 text-[11px]">
              <Calendar className="h-3.5 w-3.5 text-neutral-400" />
              <span>
                {event?.start_time ? new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-800">
            <span>OD Verified (Checked In)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">
            {scannedAttendees.length}
          </div>
          <div className="text-[11px] text-emerald-700 mt-0.5">
            Eligible for duty leave export
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-600">
            <span>Total Registered</span>
            <Users className="h-4 w-4 text-[#A4161A]" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">
            {attendees.length}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            {attendees.length - scannedAttendees.length} absent / unverified
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, roll no, email, or department..."
            className="w-full rounded border border-neutral-300 bg-white py-1.5 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-neutral-700 bg-white rounded px-2.5 py-1.5 border border-neutral-300">
          <Filter className="h-3.5 w-3.5 text-neutral-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'scanned' | 'unscanned')}
            className="bg-transparent text-xs font-medium text-neutral-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All ({attendees.length})</option>
            <option value="scanned">Scanned / Present ({scannedAttendees.length})</option>
            <option value="unscanned">Unscanned / Absent ({attendees.length - scannedAttendees.length})</option>
          </select>
        </div>
      </div>

      {/* Attendees Table */}
      {loading ? (
        <div className="h-48 w-full animate-pulse rounded-md bg-neutral-100 border border-neutral-200" />
      ) : filteredAttendees.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-12 text-center">
          <FileSpreadsheet className="mx-auto h-10 w-10 text-neutral-300" />
          <h3 className="mt-3 text-base font-semibold text-neutral-900">
            No attendees match this filter
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Adjust search query or filter options.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs">
              <thead className="bg-neutral-50 font-semibold text-neutral-600">
                <tr>
                  <th scope="col" className="py-2.5 pl-4 pr-2">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Roll Number
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Student Name
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Department
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Email
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Check-in Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {filteredAttendees.map((row) => {
                  const isChecked = !!row.checked_in_at;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-neutral-50 transition-colors ${
                        isChecked ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap py-3 pl-4 pr-2">
                        {isChecked ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-700" /> Checked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                            <Clock className="h-2.5 w-2.5 text-neutral-400" /> Pending
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-[#A4161A]">
                        {row.roll_no || 'N/A'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 font-medium text-neutral-900">
                        {row.student_name || '-'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-neutral-600">
                        {row.department_name || 'General'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-neutral-500">
                        {row.student_email}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-neutral-500">
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
