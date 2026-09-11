import React from 'react';
import { cx } from './Surface';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent border border-accent hover:opacity-90',
  secondary: 'bg-surface-raised text-primary border border-subtle hover:bg-surface-hover hover:border-strong',
  outline: 'bg-transparent text-primary border border-subtle hover:bg-surface-raised hover:border-strong',
  ghost: 'bg-transparent text-secondary border border-transparent hover:bg-surface-raised hover:text-primary',
  danger: 'bg-danger-soft text-danger border border-danger hover:bg-surface-hover',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-xs rounded-lg',
  md: 'min-h-10 px-4 py-2 text-sm rounded-xl',
  lg: 'min-h-11 px-5 py-2.5 text-sm rounded-xl',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}) => (
  <button
    type={type}
    className={cx(
      'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
      variantClass[variant],
      sizeClass[size],
      className,
    )}
    {...props}
  >
    {children}
  </button>
);