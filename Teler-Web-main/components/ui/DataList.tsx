import React from 'react';
import { cx } from './Surface';

export const DataList: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cx('bg-surface-card border border-subtle rounded-2xl overflow-hidden shadow-card', className)} {...props} />
);

export const DataListHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cx('bg-surface-raised/40 border-b border-subtle px-4 md:px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted', className)} {...props} />
);

export const DataListRow: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...props }) => (
  <button
    type="button"
    className={cx('w-full border-b border-subtle last:border-b-0 px-4 md:px-5 py-4 text-left hover:bg-surface-raised transition-colors', className)}
    {...props}
  />
);

export const DataListLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({ className, ...props }) => (
  <a
    className={cx('block border-b border-subtle last:border-b-0 px-4 md:px-5 py-4 text-left hover:bg-surface-raised transition-colors', className)}
    {...props}
  />
);