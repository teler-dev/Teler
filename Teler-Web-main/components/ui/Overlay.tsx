import React, { useEffect, useRef } from 'react';
import { cx } from './Surface';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useFocusTrap(onClose: () => void, containerRef: React.RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? containerRef.current)?.focus();
    };
    requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusables = [...containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.hasAttribute('disabled'));
      if (!focusables.length) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      requestAnimationFrame(() => previous?.focus());
    };
  }, [containerRef]);
}

interface OverlayProps {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  kind?: 'dialog' | 'drawer' | 'panel';
  className?: string;
  backdrop?: boolean;
  flush?: boolean;
}

export const OverlaySurface: React.FC<OverlayProps> = ({
  label,
  onClose,
  children,
  kind = 'dialog',
  className,
  backdrop = true,
  flush = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(onClose, panelRef);

  const position =
    kind === 'drawer'
      ? 'items-stretch justify-end'
      : kind === 'panel'
      ? 'items-end justify-end sm:items-end'
      : 'items-start justify-center pt-[12vh]';

  return (
    <div className={cx('fixed inset-0 z-[100] flex', flush ? 'p-0' : 'p-4', position, !backdrop && 'pointer-events-none')}>
      {backdrop && <button type="button" aria-label={`Close ${label}`} onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cx('relative pointer-events-auto outline-none', className)}
      >
        {children}
      </div>
    </div>
  );
};