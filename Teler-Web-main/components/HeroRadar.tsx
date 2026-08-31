import React from 'react';

export const HeroRadar: React.FC = () => {
  return (
    <div className="relative w-full h-[400px] md:h-[500px] flex items-center justify-center">
      {/* Central Core */}
      <div className="absolute w-24 h-24 bg-cyan-500/10 rounded-full blur-xl animate-pulse-slow"></div>
      <div className="absolute w-12 h-12 bg-cyan-500 rounded-full shadow-[0_0_40px_rgba(19,214,255,0.6)] z-10 flex items-center justify-center">
        <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
      </div>

      {/* Rings */}
      <div className="absolute w-48 h-48 border border-cyan-500/20 rounded-full animate-[spin_10s_linear_infinite_reverse]"></div>
      <div className="absolute w-72 h-72 border border-dashed border-cyan-500/30 rounded-full animate-[spin_20s_linear_infinite]"></div>
      <div className="absolute w-96 h-96 border border-cyan-500/10 rounded-full"></div>

      {/* Scanner */}
      <div className="absolute w-full h-full animate-[spin_4s_linear_infinite]">
        <div className="w-1/2 h-full bg-gradient-to-l from-transparent via-cyan-500/10 to-transparent absolute top-0 left-1/2 origin-left transform -rotate-90 pointer-events-none blur-sm"
             style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}></div>
        <div className="absolute top-1/2 left-1/2 w-[200px] h-[2px] bg-gradient-to-r from-cyan-500 to-transparent origin-left shadow-[0_0_10px_#13D6FF]"></div>
      </div>

      {/* Floating Nodes */}
      {[...Array(6)].map((_, i) => (
        <div 
          key={i}
          className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] animate-float"
          style={{
            top: `${50 + 35 * Math.sin(i * (Math.PI / 3))}%`,
            left: `${50 + 35 * Math.cos(i * (Math.PI / 3))}%`,
            animationDelay: `${i * 0.5}s`
          }}
        >
          <div className="absolute -inset-4 border border-cyan-500/30 rounded-full animate-ping opacity-20"></div>
        </div>
      ))}
      
      {/* Data Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
        <line x1="50%" y1="50%" x2="85%" y2="15%" stroke="#13D6FF" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="15%" y2="85%" stroke="#13D6FF" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="85%" y2="85%" stroke="#13D6FF" strokeWidth="1" />
      </svg>
      
      {/* HUD Elements */}
      <div className="absolute top-10 right-10 text-xs font-mono text-cyan-500/80">
        SIGNAL_STRENGTH: 98%
      </div>
      <div className="absolute bottom-10 left-10 text-xs font-mono text-cyan-500/80">
        ALIGNMENT: OPTIMAL
      </div>
    </div>
  );
};