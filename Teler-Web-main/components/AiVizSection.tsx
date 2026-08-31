import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { FadeIn } from './ui/FadeIn';

const data = [
  { time: '09:00', raw: 40, aligned: 85 },
  { time: '10:00', raw: 30, aligned: 88 },
  { time: '11:00', raw: 20, aligned: 90 },
  { time: '12:00', raw: 60, aligned: 40 },
  { time: '13:00', raw: 70, aligned: 85 },
  { time: '14:00', raw: 90, aligned: 95 },
  { time: '15:00', raw: 50, aligned: 70 },
];

export const AiVizSection: React.FC = () => {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900 to-navy-800 pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              TELER translates daily activity into <span className="text-cyan-500">meaningful insights</span>.
            </h2>
            <p className="text-gray-400 mb-8 text-lg">
              Traditional tools flag "idle time" when a professional is thinking or researching. TELER's engine understands that reading documentation or peer reviews are high-value actions, distinguishing true work from noise.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
                <span className="text-sm text-gray-300">Verified Work Alignment</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
                <span className="text-sm text-gray-300">Self-Reported Activity Baseline</span>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={200} className="w-full">
            <div className="bg-navy-800/50 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-sm text-cyan-500 uppercase tracking-wider">Continuously Updated AI Insights</h3>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold rounded border border-cyan-500/20">SYSTEM ACTIVE</span>
                </div>
              </div>
              
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorAligned" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#13D6FF" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#13D6FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="time" 
                      stroke="#4b5563" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0A0F1A', borderColor: '#1f2937', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="aligned" 
                      stroke="#13D6FF" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorAligned)" 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="raw" 
                      stroke="#4b5563" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
};