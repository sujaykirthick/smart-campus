'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent } from '@/lib/types';
import {
  HandHelping,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Camera,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  UserCheck,
  UserX,
  RotateCcw,
} from 'lucide-react';

interface VolunteerApplicant {
  id: string;
  name: string;
  roll_no: string | null;
  email: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  applied_at: string;
}

export default function EventVolunteersPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setActionError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        router.push('/login');
        return;
      }

      // Fetch event
      const { data: eventData, error: evErr } = await supabase
        .from('events')
        .select('*, halls:halls!events_hall_id_fkey(id, name, capacity, location)')
        .eq('id', eventId)
        .maybeSingle();

      if (evErr || !eventData) {
        router.push('/organizer');
        return;
      }

      // Check authorization: Owner or Approver
      let isOwnerOrApprover = eventData.organizer_email === user.email;
      if (!isOwnerOrApprover) {
        const { data: userRole } = await supabase
          .from('allowed_users')
          .select('role')
          .eq('email', user.email)
          .maybeSingle();

        if (userRole && ['student_affairs', 'event_office', 'cd'].includes(userRole.role)) {
          isOwnerOrApprover = true;
        }
      }

      if (!isOwnerOrApprover) {
        alert('Unauthorized: Only the event owner or approvers can view this volunteer roster.');
        router.push('/organizer');
        return;
      }

      setEvent(eventData as CampusEvent);

      // Call list_event_volunteers RPC
      const { data: volData, error: volErr } = await supabase.rpc('list_event_volunteers', {
        p_event_id: eventId,
      });

      if (volErr) {
        throw volErr;
      }

      setVolunteers((volData as VolunteerApplicant[]) || []);
    } catch (err: any) {
      console.error('Failed to load event volunteers:', err);
      setActionError(err?.message || 'Failed to load volunteers.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [supabase, eventId, router]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const handleDecide = async (volunteerId: string, decision: 'accepted' | 'rejected' | 'pending') => {
    setActionLoadingId(`${volunteerId}-${decision}`);
    setActionError(null);
    setActionSuccess(null);

    try {
      const { data: newCount, error } = await supabase.rpc('decide_volunteer', {
        p_volunteer_id: volunteerId,
        p_decision: decision,
      });

      if (error) {
        throw error;
      }

      const label = decision === 'accepted' ? 'Accepted' : decision === 'rejected' ? 'Rejected' : 'Moved back to pending';
      setActionSuccess(`${label} volunteer. New accepted total: ${newCount ?? 'updated'}.`);

      // Refresh silently without unmounting
      await loadData(true);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update volunteer status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const acceptedCount = volunteers.filter((v) => v.status === 'accepted').length;
  const pendingCount = volunteers.filter((v) => v.status === 'pending').length;
  const neededCount = event?.volunteers_needed || 0;
  const exceedsQuota = neededCount > 0 && acceptedCount >= neededCount;

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#A4161A]" />
        <div className="text-xs text-neutral-500">Loading volunteer management roster...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/organizer"
            className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                Volunteer Applications
              </h1>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-800">
                {event?.title}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Review student volunteer applications and assign check-in scanner permissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/organizer/scan/${eventId}`}
            className="inline-flex items-center gap-1.5 rounded bg-[#A4161A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
          >
            <Camera className="h-3.5 w-3.5" />
            Scanner
          </Link>

          <Link
            href={`/organizer/events/${eventId}/od`}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            OD List
          </Link>

          <button
            onClick={() => loadData(true)}
            className="rounded border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quota Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-neutral-500">Volunteers Needed</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">{neededCount}</div>
        </div>

        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 shadow-xs">
          <div className="text-xs font-medium text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Accepted Volunteers
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">
            {acceptedCount} <span className="text-xs font-normal text-emerald-700">/ {neededCount}</span>
          </div>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-xs">
          <div className="text-xs font-medium text-amber-800 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Pending Review
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{pendingCount}</div>
        </div>
      </div>

      {/* Soft Quota Exceeded Warning */}
      {exceedsQuota && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Notice: Volunteer Target Reached</span>
            <p className="mt-0.5 text-amber-800">
              You currently have {acceptedCount} accepted volunteer{acceptedCount === 1 ? '' : 's'} (needed: {neededCount}). You may still accept additional volunteers if desired; this will not block your event.
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B] flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-[#991B1B]" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Applicants Table */}
      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HandHelping className="h-4 w-4 text-[#A4161A]" />
            <h2 className="text-sm font-bold text-neutral-900">
              Applicant Roster ({volunteers.length})
            </h2>
          </div>
        </div>

        {volunteers.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            No volunteer applications received for this event yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-3">Student Name &amp; Roll</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Applied Time</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {volunteers.map((vol) => {
                  const isOpLoading = actionLoadingId?.startsWith(vol.id);

                  return (
                    <tr key={vol.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-neutral-900">
                        {vol.name}
                        {vol.roll_no && (
                          <div className="text-[11px] text-neutral-500 font-mono">
                            {vol.roll_no}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-neutral-700">
                        {vol.email}
                      </td>

                      <td className="px-4 py-3 text-neutral-500">
                        {formatDate(vol.applied_at)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {vol.status === 'accepted' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 uppercase">
                            <CheckCircle2 className="h-3 w-3" /> Accepted
                          </span>
                        ) : vol.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] font-semibold text-[#991B1B] uppercase">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        ) : vol.status === 'withdrawn' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 uppercase">
                            Withdrawn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900 uppercase">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                        {vol.status !== 'accepted' && (
                          <button
                            onClick={() => handleDecide(vol.id, 'accepted')}
                            disabled={isOpLoading}
                            className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <UserCheck className="h-3 w-3" /> Accept
                          </button>
                        )}

                        {vol.status !== 'rejected' && (
                          <button
                            onClick={() => handleDecide(vol.id, 'rejected')}
                            disabled={isOpLoading}
                            className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-[#991B1B] hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <UserX className="h-3 w-3" /> Reject
                          </button>
                        )}

                        {vol.status !== 'pending' && (
                          <button
                            onClick={() => handleDecide(vol.id, 'pending')}
                            disabled={isOpLoading}
                            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" /> Pending
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
