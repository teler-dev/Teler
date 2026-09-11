import React from 'react';
import { cx } from './Surface';

export type IconButtonVariant = 'default' | 'ghost' | 'danger';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: IconButtonVariant;
  size?: 'sm' | 'md';
}

const variantClass: Record<IconButtonVariant, string> = {
  default: 'bg-surface-raised border-subtle text-secondary hover:text-primary hover:bg-surface-hover hover:border-strong',
  ghost: 'bg-transparent border-transparent text-secondary hover:text-primary hover:bg-surface-raised',
  danger: 'bg-transparent border-transparent text-secondary hover:text-danger hover:bg-danger-soft',
};

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  variant = 'default',
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={cx(
      'inline-flex shrink-0 items-center justify-center rounded-xl border transition-colors duration-150',
      size === 'md' ? 'w-10 h-10' : 'w-9 h-9',
      variantClass[variant],
      className,
    )}
    {...props}
  >
    {children}
  </button>
);