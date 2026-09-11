import React from 'react';
import { cx } from './Surface';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

const toneClass: Record<StatusTone, string> = {
  success: 'text-success bg-success-soft border-success',
  warning: 'text-warning bg-warning-soft border-warning',
  danger: 'text-danger bg-danger-soft border-danger',
  info: 'text-info bg-info-soft border-info',
  neutral: 'text-secondary bg-surface-raised border-subtle',
  accent: 'text-accent bg-accent-soft border-accent',
};

export const StatusBadge: React.FC<React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  dot?: boolean;
}> = ({ tone = 'neutral', dot = false, className, children, ...props }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
      toneClass[tone],
      className,
    )}
    {...props}
  >
    {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
    {children}
  </span>
);

export const StatusDot: React.FC<{ tone?: StatusTone; className?: string }> = ({ tone = 'neutral', className }) => (
  <span
    aria-hidden="true"
    className={cx(
      'inline-block w-2.5 h-2.5 rounded-full',
      tone === 'success' && 'bg-success',
      tone === 'warning' && 'bg-warning',
      tone === 'danger' && 'bg-danger',
      tone === 'info' && 'bg-info',
      tone === 'accent' && 'bg-accent',
      tone === 'neutral' && 'bg-surface-hover',
      className,
    )}
  />
);