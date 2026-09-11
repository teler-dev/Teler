import React from 'react';
import { classifyScore } from '../../types';
import { StatusBadge, StatusTone } from './StatusBadge';
import { cx } from './Surface';

export type MetricState = 'value' | 'unscored' | 'unavailable';

interface MetricValueProps {
  value?: number | null;
  suffix?: string;
  state?: MetricState;
  showClassification?: boolean;
  compact?: boolean;
  className?: string;
}

function toneForLabel(label: string): StatusTone {
  if (label === 'Elite') return 'accent';
  if (label === 'Strong') return 'success';
  if (label === 'Moderate') return 'warning';
  return 'danger';
}

export const MetricValue: React.FC<MetricValueProps> = ({
  value,
  suffix = '',
  state,
  showClassification = false,
  compact = false,
  className,
}) => {
  const resolvedState: MetricState = state ?? (value == null ? 'unavailable' : 'value');

  if (resolvedState === 'unavailable') {
    return <span className={cx('text-secondary font-semibold', compact ? 'text-sm' : 'text-2xl md:text-3xl', className)}>—</span>;
  }

  if (resolvedState === 'unscored') {
    return showClassification ? <StatusBadge tone="neutral">Not scored</StatusBadge> : <span className={cx('text-secondary font-semibold', compact ? 'text-sm' : 'text-2xl md:text-3xl', className)}>—</span>;
  }

  const safeValue = Number.isFinite(value) ? Number(value) : 0;
  const score = classifyScore(safeValue);

  if (showClassification) {
    return <StatusBadge tone={toneForLabel(score.label)}>{safeValue}{suffix} · {score.label}</StatusBadge>;
  }

  return <span className={cx('font-bold text-primary', compact ? 'text-sm' : 'text-2xl md:text-3xl', className)}>{safeValue}{suffix}</span>;
};