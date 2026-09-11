import React from 'react';
import { Card } from './Card';
import { cx } from './Surface';

export const PageContainer: React.FC<React.HTMLAttributes<HTMLElement>> = ({ className, children, ...props }) => (
  <main className={cx('p-4 md:p-6 space-y-5 min-w-0', className)} {...props}>{children}</main>
);

export const KpiGrid: React.FC<React.HTMLAttributes<HTMLDivElement> & { columns?: 2 | 3 | 4 }> = ({
  columns = 4,
  className,
  ...props
}) => {
  const cols = columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : columns === 3 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 xl:grid-cols-4';
  return <div className={cx('grid gap-3', cols, className)} {...props} />;
};

interface MetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, helper, icon, className, tone = 'accent', onClick }) => {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : tone === 'neutral' ? 'text-secondary' : 'text-accent';
  const content = <>
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {icon && <span className={`${toneClass} shrink-0`}>{icon}</span>}
    </div>
    <div className={`mt-3 ${toneClass}`}>{value}</div>
    {helper && <p className="text-xs text-secondary mt-1">{helper}</p>}
  </>;
  return onClick ? <button type="button" onClick={onClick} className={`bg-surface-card border border-subtle rounded-2xl p-4 md:p-5 shadow-card text-left hover:border-strong transition-colors ${className ?? ''}`}>{content}</button> : <Card padding="md" className={className}>{content}</Card>;
};

interface SectionCardProps extends React.HTMLAttributes<HTMLElement> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, description, action, children, className, ...props }) => (
  <Card as="section" padding="none" className={className} {...props}>
    {(title || description || action) && (
      <div className="p-4 md:p-5 border-b border-subtle flex items-start justify-between gap-4">
        <div className="min-w-0">
          {title && <h2 className="font-semibold text-primary">{title}</h2>}
          {description && <p className="text-sm text-secondary mt-1">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )}
    <div className="p-4 md:p-5">{children}</div>
  </Card>
);