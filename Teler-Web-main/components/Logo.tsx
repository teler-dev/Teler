import React from 'react';

interface LogoProps {
  className?: string;
  showTagline?: boolean;
  variant?: 'navbar' | 'footer' | 'default';
}

export const Logo: React.FC<LogoProps> = ({ 
  className = "", 
  showTagline = false,
  variant = 'default' 
}) => {
  const isInteractive = variant === 'navbar' || variant === 'default';
  
  // Base classes for the bars
  const barBase = "transition-all duration-300 ease-out";
  
  // Interactive classes (Navbar)
  const barInteractive = isInteractive 
    ? "group-hover:stroke-white group-hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" 
    : "";
    
  // Load animation classes (Only for navbar/default, one-time sweep)
  // Using tailwind 'animate-signal-sweep' defined in index.html
  const loadAnim = isInteractive ? "animate-signal-sweep" : "";

  return (
    <div className={`flex items-center gap-3 ${isInteractive ? 'group cursor-default' : ''} ${className}`}>
      <div className="relative w-10 h-10 flex-shrink-0">
        {/* Ambient Glow (Hover only) */}
        {isInteractive && (
          <div className="absolute inset-0 bg-cyan-500/10 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        )}
        
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full relative z-10 drop-shadow-[0_0_8px_rgba(19,214,255,0.4)]">
            {/* Main Triangle Frame */}
            <path 
                d="M22 18.5C22 13.2 27.8 10 32.3 12.8L82.3 44.3C86.6 47 86.6 53 82.3 55.7L32.3 87.2C27.8 90 22 86.8 22 81.5V18.5Z" 
                stroke="#13D6FF" 
                strokeWidth="6" 
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-all duration-500 ${isInteractive ? 'group-hover:stroke-cyan-400 group-hover:drop-shadow-[0_0_12px_rgba(19,214,255,0.6)]' : ''}`}
            />
            
            {/* Signal Bars: Descending height (Tall -> Medium -> Short) */}
            {/* Bars animate in sequence on load, and light up in sequence on hover */}
            
            {/* Left Bar (Tallest) */}
            <line 
              x1="38" y1="28" x2="38" y2="72" 
              stroke="#13D6FF" strokeWidth="6" strokeLinecap="round" 
              className={`${barBase} ${barInteractive} ${loadAnim}`}
              style={{ animationDelay: '0.2s' }}
            />
            
            {/* Middle Bar (Medium) */}
            <line 
              x1="53" y1="36" x2="53" y2="64" 
              stroke="#13D6FF" strokeWidth="6" strokeLinecap="round" 
              className={`${barBase} ${barInteractive} ${loadAnim} delay-75`}
              style={{ animationDelay: '0.4s' }}
            />
            
            {/* Right Bar (Shortest) */}
            <line 
              x1="68" y1="44" x2="68" y2="56" 
              stroke="#13D6FF" strokeWidth="6" strokeLinecap="round" 
              className={`${barBase} ${barInteractive} ${loadAnim} delay-150`}
              style={{ animationDelay: '0.6s' }}
            />
        </svg>
      </div>
      <div className="flex flex-col justify-center">
        <span className={`text-2xl font-bold tracking-wide text-white font-sans leading-none transition-colors duration-300 ${isInteractive ? 'group-hover:text-cyan-50' : ''}`}>TELER</span>
        {showTagline && (
          <span className="text-[0.6rem] text-cyan-400 tracking-[0.15em] uppercase font-medium leading-none mt-1.5 opacity-90">
            Work Signals. Decoded.
          </span>
        )}
      </div>
    </div>
  );
};