import React from 'react';
import { Search } from 'lucide-react';
import { cx } from './Surface';

const fieldBase = 'w-full min-h-10 bg-surface-input border border-subtle rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted outline-none transition-colors hover:border-strong focus:border-accent disabled:bg-surface-raised disabled:text-muted disabled:opacity-70';

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cx(fieldBase, className)} {...props} />,
);
TextInput.displayName = 'TextInput';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cx(fieldBase, 'appearance-none pr-8', className)} {...props} />,
);
Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cx(fieldBase, 'resize-none', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const SearchInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
      <input ref={ref} className={cx(fieldBase, 'pl-9', className)} {...props} />
    </div>
  ),
);
SearchInput.displayName = 'SearchInput';

export const FieldLabel: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ className, ...props }) => (
  <span className={cx('text-xs font-semibold text-secondary', className)} {...props} />
);