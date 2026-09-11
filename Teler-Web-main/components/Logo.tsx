import React from 'react';

interface LogoProps {
  className?: string;
  showTagline?: boolean;
  variant?: 'navbar' | 'footer' | 'default';
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  showTagline = false,
  variant = 'default',
}) => {
  const isInteractive = variant === 'navbar' || variant === 'default';
  const barBase = 'text-accent transition-colors duration-200';
  const interactive = isInteractive ? 'group-hover:text-primary' : '';

  return (
    <div className={`flex items-center gap-3 ${isInteractive ? 'group cursor-default' : ''} ${className}`}>
      <div className="relative w-10 h-10 flex-shrink-0">
        {isInteractive && (
          <div className="absolute inset-1 bg-accent-soft blur-lg rounded-full opacity-0 group-hover:opacity-80 transition-opacity duration-200" />
        )}
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-10"
          aria-hidden="true"
        >
          <path
            d="M22 18.5C22 13.2 27.8 10 32.3 12.8L82.3 44.3C86.6 47 86.6 53 82.3 55.7L32.3 87.2C27.8 90 22 86.8 22 81.5V18.5Z"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-accent transition-colors duration-200 ${interactive}`}
          />
          <line x1="38" y1="28" x2="38" y2="72" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className={`${barBase} ${interactive}`} />
          <line x1="53" y1="36" x2="53" y2="64" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className={`${barBase} ${interactive}`} />
          <line x1="68" y1="44" x2="68" y2="56" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className={`${barBase} ${interactive}`} />
        </svg>
      </div>
      <div className="flex flex-col justify-center min-w-0">
        <span className="text-2xl font-bold tracking-wide text-primary font-sans leading-none transition-colors duration-200">TELER</span>
        {showTagline && (
          <span className="text-[0.6rem] text-accent tracking-[0.15em] uppercase font-semibold leading-none mt-1.5">
            Work Signals. Decoded.
          </span>
        )}
      </div>
    </div>
  );
};