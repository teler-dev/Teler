import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { Check, X } from 'lucide-react';

const comparisons = [
  { feature: 'Metric', old: 'Time Tracking', new: 'Alignment Insights' },
  { feature: 'Method', old: 'Manual Screenshot Review', new: 'AI-Only Signal Analysis' },
  { feature: 'Vulnerability', old: 'Fakeable Activity', new: 'Real Behavior Patterns' },
  { feature: 'Context', old: 'None (Blind)', new: 'Role-Aware AI' },
];

export const ComparisonSection: React.FC = () => {
  return (
    <section className="py-24 bg-navy-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Why TELER is Different</h2>
        </FadeIn>

        <FadeIn delay={100}>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-3 bg-navy-800 p-6 border-b border-white/10">
              <div className="text-gray-400 font-medium">Core Capabilities</div>
              <div className="text-gray-400 font-medium opacity-50">Traditional Tools</div>
              <div className="text-cyan-500 font-bold">TELER AI</div>
            </div>
            
            {comparisons.map((item, idx) => (
              <div key={idx} className="grid grid-cols-3 p-6 border-b border-white/5 bg-navy-900/50 hover:bg-white/5 transition-colors items-center">
                <div className="font-medium text-white">{item.feature}</div>
                <div className="text-gray-500 flex items-center gap-2">
                  <X className="w-4 h-4 text-red-500/50" />
                  {item.old}
                </div>
                <div className="text-white flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4 text-cyan-500" />
                  {item.new}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
};