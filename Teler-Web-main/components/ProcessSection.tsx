import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { SignalCaptureIcon, SessionIcon, MisalignmentIcon, ReportIcon } from './Icons';

const steps = [
  {
    icon: SignalCaptureIcon,
    title: "Data Validation",
    desc: "AI identifies professional work patterns in the background. No raw data or visuals are ever presented to management."
  },
  {
    icon: SessionIcon,
    title: "Session Alignment",
    desc: "Fragmented activities are grouped into clear, validated blocks of work that match project goals."
  },
  {
    icon: MisalignmentIcon,
    title: "Role Verification",
    desc: "The system highlights when daily work deviates from expected responsibilities or seniority levels."
  },
  {
    icon: ReportIcon,
    title: "Daily Summaries",
    desc: "Managers receive objective reports of team alignment and outcomes, eliminating the need for manual check-ins."
  }
];

export const ProcessSection: React.FC = () => {
  return (
    <section className="py-24 bg-navy-800/30 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How TELER Delivers Truth</h2>
          <p className="text-gray-400">Transforming daily activity into validated performance insights.</p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, idx) => (
            <FadeIn key={idx} delay={idx * 150} className="h-full">
              <div className="bg-navy-900 border border-white/5 p-6 rounded-xl h-full hover:border-cyan-500/50 hover:bg-navy-800 transition-all duration-300 group">
                <div className="w-12 h-12 bg-navy-800 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyan-500/20 transition-colors">
                  <step.icon className="w-6 h-6 text-cyan-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};