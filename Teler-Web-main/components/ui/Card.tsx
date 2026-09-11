import React from 'react';
import { cx } from './Surface';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article';
  padding?: CardPadding;
  elevated?: boolean;
  tone?: 'card' | 'raised';
}

const paddingClass: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3 md:p-4',
  md: 'p-4 md:p-5',
  lg: 'p-5 md:p-6',
};

export const Card: React.FC<CardProps> = ({
  as = 'div',
  padding = 'md',
  elevated = true,
  tone = 'card',
  className,
  ...props
}) => {
  const Component = as;
  return (
    <Component
      className={cx(
        tone === 'card' ? 'bg-surface-card' : 'bg-surface-raised',
        'border border-subtle rounded-2xl',
        elevated && 'shadow-card',
        paddingClass[padding],
        className,
      )}
      {...props}
    />
  );
};