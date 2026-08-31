import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

// Common styles for consistency
const strokeWidth = 1.5;

// --- PROBLEM SECTION ICONS (AI Telemetry Style) ---

// 1. Idle/Irrelevant Work: Fading Signal / Interrupted Data
export const IdleSignalIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Frame */}
    <rect x="2" y="4" width="20" height="16" rx="2" strokeOpacity="0.1" />
    
    {/* Active Signal Section */}
    <path d="M4 12h2" />
    <path d="M6 12l1.5 -3l1.5 3" />
    <path d="M9 12l1.5 3l1.5 -3" />
    
    {/* Fading / Interrupted Section */}
    <path d="M14 12h2" strokeDasharray="1 1" />
    <path d="M18 12h2" strokeOpacity="0.3" strokeDasharray="1 1" />
    
    {/* Drop indicator */}
    <circle cx="18" cy="16" r="1" fill="currentColor" fillOpacity="0.5" />
  </svg>
);

// 2. Fake Activity: Synthetic Pattern / Noise
export const FakeActivityIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Background organic curve (Human) - Faint */}
    <path d="M2 12c4-5 8-5 10 0s6 5 10 0" strokeOpacity="0.2" />
    
    {/* Overlay synthetic/mechanical pattern (Bot) - Bright */}
    <path d="M2 12h2" />
    <path d="M4 12v-4h4v8h4v-8h4v4h2" />
    
    {/* Mismatch blip */}
    <circle cx="12" cy="12" r="2" stroke="currentColor" fill="none" />
  </svg>
);

// 3. Wasted Payroll: Leaking Node / Efficiency Drop
export const ResourceLeakIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Central Resource Node */}
    <path d="M12 4v4" />
    <rect x="6" y="8" width="12" height="8" rx="2" />
    
    {/* Leakage Lines */}
    <path d="M9 16v3" strokeDasharray="2 2" />
    <path d="M12 16v5" />
    <path d="M15 16v2" strokeDasharray="2 2" />
    
    {/* Decay Curve overlay */}
    <path d="M20 9l2 2" strokeOpacity="0.5" />
    <path d="M2 9l-2 2" strokeOpacity="0.5" />
  </svg>
);

// --- FEATURE ICONS ---

export const SignalCaptureIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="3" width="20" height="18" rx="2" strokeOpacity="0.2" />
    <path d="M2 12h3l2-4 4 8 4-8 2 4h3" />
  </svg>
);

export const SessionIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="5" width="12" height="4" rx="1" />
    <rect x="3" y="11" width="18" height="4" rx="1" />
    <rect x="9" y="17" width="12" height="4" rx="1" strokeOpacity="0.5" />
    <path d="M7 9v2" strokeOpacity="0.5" />
    <path d="M17 15v2" strokeOpacity="0.5" />
  </svg>
);

export const MisalignmentIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 6h16" />
    <path d="M4 12h10" />
    <path d="M4 18h16" />
    <path d="M18 10l3 3-3 3" />
  </svg>
);

export const RoleAwareIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="9" y="3" width="6" height="6" rx="1" />
    <path d="M12 9v4" />
    <rect x="3" y="13" width="6" height="6" rx="1" />
    <rect x="15" y="13" width="6" height="6" rx="1" />
    <path d="M6 13c0-2 2-3 6-3s6 1 6 3" />
  </svg>
);

export const InsightIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 3v18h18" strokeOpacity="0.3" />
    <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
    <circle cx="18.7" cy="8" r="2" />
    <circle cx="7" cy="14.3" r="2" />
  </svg>
);

export const ContextFlowIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <path d="M10 6.5h4a2 2 0 0 1 2 2v2" />
    <path d="M16 10.5l3.5 3.5l-3.5 3.5" strokeOpacity="0" /> 
    <path d="M16 10.5l0 0" /> {/* Spacer */}
    <path d="M13 14h-3v3" strokeOpacity="0.2" /> 
    <path d="M16 11l3 3l-3 3" />
  </svg>
);

export const PrivacyIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <circle cx="12" cy="11" r="3" />
    <path d="M12 14v2" />
  </svg>
);

export const ReportIcon: React.FC<IconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M8 13h8" />
    <path d="M8 17h4" />
    <path d="M8 9h2" />
  </svg>
);