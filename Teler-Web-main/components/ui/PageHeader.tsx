import React from 'react';
import { cx } from './Surface';

interface PageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  meta,
  description,
  leading,
  actions,
  compact = false,
  className,
}) => (
  <header className={cx('sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle', className)}>
    <div className={cx('px-4 md:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', compact ? 'py-2.5' : 'py-3')}>
      <div className="min-w-0 flex items-start sm:items-center gap-3">
        {leading}
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>}
          <div className={cx('min-w-0 flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3', eyebrow && 'mt-1')}>
            <h1 className={cx('font-bold text-primary break-words md:truncate md:shrink-0', compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl')}>{title}</h1>
            {meta && <div className="text-xs sm:text-sm text-secondary min-w-0 leading-5 md:truncate">{meta}</div>}
          </div>
          {description && <p className="text-sm text-secondary mt-1 max-w-3xl md:hidden">{description}</p>}
        </div>
      </div>
      {actions && <div className="w-full sm:w-auto shrink-0 flex flex-wrap items-center gap-2 [&>*]:min-w-0 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </div>
  </header>
);