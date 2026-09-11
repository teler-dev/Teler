import React from 'react';
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cx } from './Surface';

export type InlineAlertTone = 'danger' | 'warning' | 'success' | 'info';

const toneClass: Record<InlineAlertTone, string> = {
  danger: 'bg-danger-soft border-danger text-danger',
  warning: 'bg-warning-soft border-warning text-warning',
  success: 'bg-success-soft border-success text-success',
  info: 'bg-info-soft border-info text-info',
};

const iconFor = {
  danger: TriangleAlert,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export const InlineAlert: React.FC<React.HTMLAttributes<HTMLDivElement> & {
  tone?: InlineAlertTone;
  title?: string;
}> = ({ tone = 'info', title, className, children, ...props }) => {
  const Icon = iconFor[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-xl border p-4 flex items-start gap-3 text-sm', toneClass[tone], className)} {...props}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold text-primary">{title}</p>}
        <div className={cx(title && 'mt-1', 'text-current')}>{children}</div>
      </div>
    </div>
  );
};