import React, { useState, useEffect, useRef } from 'react';
import { FadeIn } from './ui/FadeIn';
import { IdleSignalIcon, FakeActivityIcon, ResourceLeakIcon } from './Icons';
import { ShieldAlert, ArrowRight, ArrowLeft, Pause, Play } from 'lucide-react';

interface ProblemData {
  id: number;
  value: string;
  label: string;
  icon: React.ReactNode;
  highlight: string;
  color: string;
}

const problems: ProblemData[] = [
  {
    id: 0,
    value: "30–40%",
    label: "Estimated portion of remote work hours that are idle, irrelevant, or non-contributory.",
    icon: <IdleSignalIcon className="w-10 h-10" />,
    highlight: "Productivity Leak",
    color: "from-cyan-500/20 to-blue-600/5"
  },
  {
    id: 1,
    value: "22%",
    label: "Remote workers admit to using automated 'mouse mover' or fake activity tools regularly.",
    icon: <FakeActivityIcon className="w-10 h-10" />,
    highlight: "Synthetic Activity",
    color: "from-blue-500/20 to-indigo-600/5"
  },
  {
    id: 2,
    value: "$8–12k",
    label: "Average annual wasted payroll identified per employee due to lack of role alignment.",
    icon: <ResourceLeakIcon className="w-10 h-10" />,
    highlight: "Financial Impact",
    color: "from-cyan-400/20 to-cyan-800/5"
  }
];

export const ProblemSection: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const sectionRef = useRef<HTMLElement>(null);
  const autoPlayRef = useRef<number | null>(null);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const nextCard = () => setActiveIndex((prev) => (prev + 1) % problems.length);
  const prevCard = () => setActiveIndex((prev) => (prev - 1 + problems.length) % problems.length);

  useEffect(() => {
    if (isAutoPlaying) {
      autoPlayRef.current = window.setInterval(nextCard, 5000);
    } else {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    }
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [isAutoPlaying]);

  const handleManualNav = (action: () => void) => {
    action();
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 15000);
  };

  return (
    <section ref={sectionRef} className="py-20 md:py-32 relative overflow-hidden bg-navy-900 min-h-[900px] flex items-center">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-cyan-500/5 blur-[160px] rounded-full pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8 xl:gap-20">
          
          {/* Text Content */}
          <div className="w-full lg:max-w-[450px] flex-shrink-0 text-center lg:text-left">
            <FadeIn>
              <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest">
                <ShieldAlert className="w-3.5 h-3.5" />
                Market Reality
              </div>
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 md:mb-8 tracking-tight text-white leading-[1.1]">
                The Hidden Cost of <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Remote Work</span>
              </h2>
              <p className="text-lg md:text-xl text-gray-400 mb-8 md:mb-12 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Traditional reporting relies on hours — but hours don’t tell the truth. 
                TELER reveals the metrics that actually matter by decoding digital signals.
              </p>

              <div className="flex items-center justify-center lg:justify-start gap-4 sm:gap-6">
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleManualNav(prevCard)}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-white/10 flex items-center justify-center text-white hover:bg-white/5 hover:border-cyan-500/50 transition-all active:scale-95"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button 
                    onClick={() => handleManualNav(nextCard)}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-white/10 flex items-center justify-center text-white hover:bg-white/5 hover:border-cyan-500/50 transition-all active:scale-95"
                  >
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button 
                    onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-white/10 flex items-center justify-center text-white hover:bg-white/5 hover:border-cyan-500/50 transition-all active:scale-95 ml-1"
                  >
                    {isAutoPlaying ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </button>
                </div>
                <div className="h-px w-10 sm:w-16 bg-white/10 hidden sm:block"></div>
                <div className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-widest whitespace-nowrap">
                  Signal 0{activeIndex + 1} / 03
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Enhanced Cover Flow Visualization */}
          <div 
            className="relative w-full flex-grow h-[450px] md:h-[540px] flex items-center justify-center perspective-[1500px] mt-10 md:mt-16 lg:mt-0 overflow-visible"
            onMouseEnter={() => setIsAutoPlaying(false)}
            onMouseLeave={() => setIsAutoPlaying(true)}
          >
            {problems.map((problem, index) => {
              const offset = (index - activeIndex + problems.length) % problems.length;
              
              let translateX = "0px";
              let scale = 1;
              let opacity = 1;
              let zIndex = 30;
              let rotateY = 0;
              let blur = 0;

              // Normalized offset for 3 items (0, 1, 2)
              // We want 0 to be center, 1 to be right, 2 to be left
              if (offset === 0) {
                translateX = "0px";
                scale = 1;
                opacity = 1;
                zIndex = 30;
                rotateY = 0;
                blur = 0;
              } else if (offset === 1) {
                // Right card
                translateX = isMobile ? "55%" : isTablet ? "180px" : "240px";
                scale = isMobile ? 0.7 : 0.8;
                opacity = isMobile ? 0.4 : 0.5;
                zIndex = 10;
                rotateY = isMobile ? -15 : -25;
                blur = isMobile ? 2 : 4;
              } else {
                // Left card
                translateX = isMobile ? "-55%" : isTablet ? "-180px" : "-240px";
                scale = isMobile ? 0.7 : 0.8;
                opacity = isMobile ? 0.4 : 0.5;
                zIndex = 10;
                rotateY = isMobile ? 15 : 25;
                blur = isMobile ? 2 : 4;
              }

              const isFront = offset === 0;

              return (
                <div
                  key={problem.id}
                  className="absolute w-[80%] max-w-[280px] xs:max-w-[320px] md:max-w-[380px] transition-all duration-[800ms] ease-[cubic-bezier(0.25,1,0.5,1)] cursor-pointer select-none"
                  style={{
                    zIndex,
                    transform: `translateX(${translateX}) scale(${scale}) rotateY(${rotateY}deg)`,
                    opacity,
                    filter: `blur(${blur}px)`,
                  }}
                  onClick={() => handleManualNav(() => setActiveIndex(index))}
                >
                  <div className={`relative h-[400px] md:h-[480px] bg-navy-800/90 backdrop-blur-3xl border ${isFront ? 'border-cyan-500/50 shadow-[0_20px_60px_-15px_rgba(19,214,255,0.4)]' : 'border-white/5'} rounded-[2.5rem] p-6 sm:p-8 md:p-10 flex flex-col overflow-hidden group`}>
                    
                    {/* Gradient Background Pattern */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${problem.color} opacity-30 group-hover:opacity-50 transition-opacity duration-700`}></div>
                    
                    {/* Signal Line Animation */}
                    {isFront && (
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-signal-wave opacity-80"></div>
                    )}

                    <div className="relative z-10 flex flex-col h-full">
                      <div className={`mb-6 md:mb-10 inline-flex items-center justify-center w-14 h-14 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-navy-900/50 border border-white/10 text-cyan-500 shadow-inner transition-transform duration-700 ${isFront ? 'scale-100' : 'scale-90 opacity-60'}`}>
                        {problem.icon}
                      </div>

                      <div className="mb-4 md:mb-6">
                        <div className={`text-4xl md:text-6xl font-black text-white tracking-tighter mb-1 md:mb-2 transition-all duration-700 ${isFront ? 'glow-text' : 'opacity-40'}`}>
                          {problem.value}
                        </div>
                        <div className={`h-1 bg-cyan-500 rounded-full transition-all duration-1000 ${isFront ? 'w-24' : 'w-0'}`}></div>
                      </div>

                      <h3 className={`text-xl md:text-2xl font-bold mb-2 md:mb-4 leading-tight transition-colors duration-500 ${isFront ? 'text-white' : 'text-gray-500'}`}>
                        {problem.highlight}
                      </h3>
                      <p className={`text-sm md:text-base lg:text-lg leading-relaxed transition-colors duration-500 ${isFront ? 'text-gray-300' : 'text-gray-600 line-clamp-3'}`}>
                        {problem.label}
                      </p>

                      <div className={`mt-auto flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] transition-opacity duration-500 ${isFront ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="flex items-center gap-2 text-cyan-500/60">
                           <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
                           <span>Node_0{problem.id + 1}</span>
                        </div>
                        <div className="flex gap-1.5">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${i === problem.id ? 'bg-cyan-500 scale-125' : 'bg-white/10'}`}></div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={`absolute bottom-6 right-6 w-8 h-8 md:w-10 md:h-10 border-b-2 border-r-2 rounded-br-2xl transition-all duration-700 ${isFront ? 'border-cyan-500/30' : 'border-white/5'}`}></div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Footer Note */}
        <FadeIn delay={600} className="text-center mt-20 md:mt-32">
          <div className="inline-block px-4 md:px-6 py-3 rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-gray-500 text-[10px] md:text-[11px] leading-relaxed max-w-2xl mx-auto italic tracking-wide">
              * Based on aggregated cross-industry workforce telemetry (2023-2024). 
              The AI model updates every 24 hours to reflect true team behavior.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};
