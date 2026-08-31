import React from 'react';

interface Props {
  className?: string;
  /** pixel size — applied to width & height */
  size?: number;
}

/** TELER logo mark — triangle + signal bars, no text, no hover effects */
export const TelerIcon: React.FC<Props> = ({ className = '', size = 16 }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    className={className}
  >
    <path
      d="M22 18.5C22 13.2 27.8 10 32.3 12.8L82.3 44.3C86.6 47 86.6 53 82.3 55.7L32.3 87.2C27.8 90 22 86.8 22 81.5V18.5Z"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="38" y1="28" x2="38" y2="72" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <line x1="53" y1="36" x2="53" y2="64" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <line x1="68" y1="44" x2="68" y2="56" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
  </svg>
);
