import React from 'react';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export type ContainerSize = 'wide' | 'standard' | 'reading' | 'form';

const containerClass: Record<ContainerSize, string> = {
  wide: 'max-w-[1580px]',
  standard: 'max-w-[1280px]',
  reading: 'max-w-[960px]',
  form: 'max-w-[800px]',
};

export const ContentContainer: React.FC<React.HTMLAttributes<HTMLDivElement> & { size?: ContainerSize }> = ({
  size = 'wide',
  className,
  ...props
}) => <div className={cx('w-full mx-auto', containerClass[size], className)} {...props} />;

export type SurfaceTone = 'card' | 'raised' | 'input';

const surfaceClass: Record<SurfaceTone, string> = {
  card: 'bg-surface-card',
  raised: 'bg-surface-raised',
  input: 'bg-surface-input',
};

export const Surface: React.FC<React.HTMLAttributes<HTMLDivElement> & {
  tone?: SurfaceTone;
  bordered?: boolean;
  elevated?: boolean;
}> = ({ tone = 'card', bordered = true, elevated = false, className, ...props }) => (
  <div
    className={cx(
      surfaceClass[tone],
      bordered && 'border border-subtle',
      elevated && 'shadow-card',
      'rounded-2xl',
      className,
    )}
    {...props}
  />
);