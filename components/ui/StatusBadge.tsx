import React from 'react';

export type StatusType =
  | 'draft'
  | 'submitted'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'locked'
  | 'ongoing'
  | 'waitlisted'
  | 'withdrawn'
  | 'accepted'
  | 'confirmed';

export interface StatusBadgeProps {
  status: string;
  stage?: string | null;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, stage, label: customLabel, className = '', size = 'md' }: StatusBadgeProps) {
  const normalized = (status || '').toLowerCase().trim();

  let label = customLabel || status;
  let bgClass = 'bg-neutral-100 text-neutral-800 border-neutral-300';
  let icon = (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="10" strokeWidth="2" />
    </svg>
  );

  switch (normalized) {
    case 'draft':
      label = 'Draft';
      bgClass = 'bg-neutral-100 text-neutral-700 border-neutral-300';
      icon = (
        <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
      break;

    case 'submitted':
    case 'pending':
      const stageLabel = stage === 'student_affairs'
        ? 'Pending Affairs'
        : stage === 'event_office'
        ? 'Pending Venue'
        : stage === 'cd'
        ? 'Pending Director'
        : 'In Review';
      label = stageLabel;
      bgClass = 'bg-amber-50 text-amber-900 border-amber-300';
      icon = (
        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
      break;

    case 'approved':
    case 'accepted':
    case 'confirmed':
      label = normalized === 'accepted' ? 'Accepted' : normalized === 'confirmed' ? 'Confirmed' : 'Approved';
      bgClass = 'bg-emerald-50 text-emerald-900 border-emerald-300';
      icon = (
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      );
      break;

    case 'rejected':
      label = 'Rejected';
      bgClass = 'bg-rose-50 text-rose-900 border-rose-300';
      icon = (
        <svg className="w-3.5 h-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
      break;

    case 'locked':
      label = 'Venue Locked';
      bgClass = 'bg-blue-50 text-blue-900 border-blue-300';
      icon = (
        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
      break;

    case 'ongoing':
      label = 'Live Now';
      bgClass = 'bg-[#FDF2F2] text-[#851215] border-[#FECACA]';
      icon = (
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A4161A] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A4161A]"></span>
        </span>
      );
      break;

    case 'waitlisted':
      label = 'Waitlisted';
      bgClass = 'bg-orange-50 text-orange-900 border-orange-300';
      icon = (
        <svg className="w-3.5 h-3.5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
      break;

    case 'withdrawn':
      label = 'Withdrawn';
      bgClass = 'bg-neutral-100 text-neutral-600 border-neutral-300';
      icon = (
        <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
      break;

    default:
      label = status;
      break;
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shadow-2xs whitespace-nowrap ${sizeClasses} ${bgClass} ${className}`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}
