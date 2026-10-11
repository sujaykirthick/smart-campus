import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverEffect?: boolean;
}

export function Card({
  children,
  className = '',
  padding = 'md',
  hoverEffect = false,
  ...props
}: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  const hoverClass = hoverEffect
    ? 'transition-all duration-200 hover:shadow-md hover:border-neutral-300'
    : 'shadow-xs';

  return (
    <div
      className={`bg-white rounded-xl border border-neutral-200/80 ${paddingClasses[padding]} ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-neutral-100 ${className}`}>
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-neutral-900 leading-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 leading-normal">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
