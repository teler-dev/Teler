import React from 'react';
import { cx } from './Surface';

interface LoadingStateProps {
  rows?: number;
  variant?: 'rows' | 'cards' | 'detail' | 'dashboard';
  className?: string;
  label?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  rows = 4,
  variant = 'rows',
  className,
  label = 'Loading',
}) => {
  if (variant === 'cards') {
    return (
      <div role="status" aria-label={label} className={cx('grid grid-cols-2 xl:grid-cols-4 gap-3', className)}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-28 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />
        ))}
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div role="status" aria-label={label} className={cx('p-4 md:p-6 space-y-5', className)}>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card" />
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-52 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card" />
          <div className="h-52 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card" />
        </div>
        <div className="h-56 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card" />
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div role="status" aria-label={label} className={cx('space-y-4', className)}>
        <div className="h-28 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />
      </div>
    );
  }

  return (
    <div role="status" aria-label={label} className={cx('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-20 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />
      ))}
    </div>
  );
};