import React from 'react';
import { cx } from './Surface';

interface PageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  leading,
  actions,
  compact = false,
  className,
}) => (
  <header className={cx('sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle', className)}>
    <div className={cx('px-4 md:px-6 flex items-center justify-between gap-3', compact ? 'py-2.5' : 'py-3')}>
      <div className="min-w-0 flex items-center gap-3">
        {leading}
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>}
          <h1 className={cx('font-bold text-primary truncate', compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl', eyebrow && 'mt-1')}>{title}</h1>
          {description && <p className="text-sm text-secondary mt-1 max-w-3xl">{description}</p>}
        </div>
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  </header>
);