'use client';

import { useMemo } from 'react';
import type { CampusEvent, EventApproval } from '@/lib/types';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Lock,
} from 'lucide-react';

interface ApprovalTrackerProps {
  event: CampusEvent;
  approvals?: EventApproval[];
}

export default function ApprovalTracker({ event, approvals = [] }: ApprovalTrackerProps) {
  const currentStage = event.approval_stage || 'student_affairs';
  const isApproved = event.status === 'approved';
  const isRejected = event.status === 'rejected';
  const isSubmitted = event.status === 'submitted';

  // Filter approvals for this event
  const eventApprovals = useMemo(() => {
    return approvals
      .filter((a) => a.event_id === event.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [approvals, event.id]);

  // Check if hall is reserved (reached CD stage or approved)
  const isHallReserved = isApproved || (isSubmitted && currentStage === 'cd');

  // Venue change audit records
  const venueChanges = useMemo(() => {
    return eventApprovals.filter((a) => a.decision === 'venue_changed');
  }, [eventApprovals]);

  // Stage statuses
  const stageStatus = useMemo(() => {
    if (event.status === 'draft') {
      return {
        welfare: 'draft',
        eventOffice: 'draft',
        cd: 'draft',
      };
    }

    if (isRejected) {
      // Find which stage rejected it
      const rejectRecord = [...eventApprovals].reverse().find((a) => a.decision === 'rejected');
      const rejectStage = rejectRecord?.stage || currentStage;

      return {
        welfare: rejectStage === 'student_affairs' ? 'rejected' : 'passed',
        eventOffice:
          rejectStage === 'event_office'
            ? 'rejected'
            : rejectStage === 'student_affairs'
            ? 'pending'
            : 'passed',
        cd: rejectStage === 'cd' ? 'rejected' : 'pending',
      };
    }

    if (isApproved) {
      return {
        welfare: 'completed',
        eventOffice: 'completed',
        cd: 'completed',
      };
    }

    // Submitted state
    return {
      welfare:
        currentStage === 'student_affairs'
          ? 'current'
          : 'completed',
      eventOffice:
        currentStage === 'student_affairs'
          ? 'pending'
          : currentStage === 'event_office'
          ? 'current'
          : 'completed',
      cd:
        currentStage === 'cd'
          ? 'current'
          : 'pending',
    };
  }, [event.status, isRejected, isApproved, currentStage, eventApprovals]);

  if (event.status === 'draft') {
    return null;
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  };

  return (
    <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-3">
      {/* Header with Stage and Hall Reserved Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
            <ShieldCheck className="h-4 w-4 text-[#A4161A]" />
            <span>Approval Chain Progress</span>
          </div>
          {(event.organizations?.name || event.club_or_dept) && (
            <span className="rounded bg-white border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
              {event.organizations?.name || event.club_or_dept}
            </span>
          )}
        </div>

        {isHallReserved && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
            <Lock className="h-3 w-3 text-emerald-700" /> Hall Reserved
          </span>
        )}
      </div>

      {/* 3-Step Horizontal Stepper */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        {/* Step 1: Student Welfare */}
        <div
          className={`rounded border p-2.5 flex items-start gap-2 ${
            stageStatus.welfare === 'completed'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : stageStatus.welfare === 'current'
              ? 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-400'
              : stageStatus.welfare === 'rejected'
              ? 'border-red-200 bg-red-50 text-[#991B1B]'
              : 'border-neutral-200 bg-white text-neutral-500'
          }`}
        >
          {stageStatus.welfare === 'completed' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
          ) : stageStatus.welfare === 'current' ? (
            <Clock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5 animate-pulse" />
          ) : stageStatus.welfare === 'rejected' ? (
            <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0 mt-0.5" />
          ) : (
            <div className="h-4 w-4 rounded-full border border-neutral-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
              1
            </div>
          )}
          <div>
            <div className="font-bold text-[11px]">1. Student Welfare</div>
            <div className="text-[10px] opacity-80">
              {stageStatus.welfare === 'completed'
                ? 'Approved'
                : stageStatus.welfare === 'current'
                ? 'Under Review'
                : stageStatus.welfare === 'rejected'
                ? 'Revision Required'
                : 'Pending'}
            </div>
          </div>
        </div>

        {/* Step 2: Event Office */}
        <div
          className={`rounded border p-2.5 flex items-start gap-2 ${
            stageStatus.eventOffice === 'completed'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : stageStatus.eventOffice === 'current'
              ? 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-400'
              : stageStatus.eventOffice === 'rejected'
              ? 'border-red-200 bg-red-50 text-[#991B1B]'
              : 'border-neutral-200 bg-white text-neutral-500'
          }`}
        >
          {stageStatus.eventOffice === 'completed' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
          ) : stageStatus.eventOffice === 'current' ? (
            <Clock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5 animate-pulse" />
          ) : stageStatus.eventOffice === 'rejected' ? (
            <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0 mt-0.5" />
          ) : (
            <div className="h-4 w-4 rounded-full border border-neutral-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
              2
            </div>
          )}
          <div>
            <div className="font-bold text-[11px]">2. Event Office</div>
            <div className="text-[10px] opacity-80">
              {stageStatus.eventOffice === 'completed'
                ? 'Venue Verified'
                : stageStatus.eventOffice === 'current'
                ? 'Venue Scheduling'
                : stageStatus.eventOffice === 'rejected'
                ? 'Rejected'
                : 'Pending'}
            </div>
          </div>
        </div>

        {/* Step 3: Campus Director */}
        <div
          className={`rounded border p-2.5 flex items-start gap-2 ${
            stageStatus.cd === 'completed'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : stageStatus.cd === 'current'
              ? 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-400'
              : stageStatus.cd === 'rejected'
              ? 'border-red-200 bg-red-50 text-[#991B1B]'
              : 'border-neutral-200 bg-white text-neutral-500'
          }`}
        >
          {stageStatus.cd === 'completed' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
          ) : stageStatus.cd === 'current' ? (
            <Clock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5 animate-pulse" />
          ) : stageStatus.cd === 'rejected' ? (
            <AlertCircle className="h-4 w-4 text-[#991B1B] shrink-0 mt-0.5" />
          ) : (
            <div className="h-4 w-4 rounded-full border border-neutral-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
              3
            </div>
          )}
          <div>
            <div className="font-bold text-[11px]">3. Campus Director</div>
            <div className="text-[10px] opacity-80">
              {stageStatus.cd === 'completed'
                ? 'Live & Published'
                : stageStatus.cd === 'current'
                ? 'Final Review'
                : stageStatus.cd === 'rejected'
                ? 'Rejected'
                : 'Pending'}
            </div>
          </div>
        </div>
      </div>

      {/* Venue Changed Audit Records (Requirement 6) */}
      {venueChanges.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {venueChanges.map((vc) => (
            <div
              key={vc.id}
              className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900"
            >
              <Building2 className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 flex-1">
                <div className="font-semibold">
                  Venue changed by Event Office: {vc.reason}
                </div>
                <div className="text-[10px] text-blue-700 font-mono">
                  {formatTime(vc.created_at)} • Updated by {vc.approver_email}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval / Rejection History Log */}
      {eventApprovals.length > 0 && (
        <div className="border-t border-neutral-200 pt-2 space-y-1">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Review History
          </div>
          <div className="space-y-1">
            {eventApprovals
              .filter((a) => a.decision !== 'venue_changed')
              .map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between text-[11px] text-neutral-600 bg-white border border-neutral-200 rounded px-2.5 py-1"
                >
                  <div className="flex items-center gap-1.5">
                    {app.decision === 'approved' ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-[#991B1B]" />
                    )}
                    <span className="font-semibold capitalize text-neutral-900">
                      {app.stage === 'student_affairs'
                        ? 'Student Welfare'
                        : app.stage === 'event_office'
                        ? 'Event Office'
                        : 'Campus Director'}
                      :
                    </span>
                    <span
                      className={
                        app.decision === 'approved'
                          ? 'text-emerald-800 font-medium'
                          : 'text-[#991B1B] font-medium'
                      }
                    >
                      {app.decision === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                    {app.reason && <span className="text-neutral-500 truncate">({app.reason})</span>}
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {formatTime(app.created_at)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
