import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { 
  MisalignmentIcon, 
  RoleAwareIcon, 
  InsightIcon, 
  ContextFlowIcon, 
  SignalCaptureIcon, 
  ReportIcon 
} from './Icons';

const features = [
  { icon: MisalignmentIcon, title: "Misalignment Detection", desc: "Instantly spot when work doesn't match the role description or sprint goals." },
  { icon: RoleAwareIcon, title: "Role-Based Analysis", desc: "Role-aware AI analysis that evaluates work patterns based on the employee’s position and field." },
  { icon: InsightIcon, title: "Seniority Insights", desc: "Identifies work patterns that reflect senior-level or junior-level execution." },
  { icon: ContextFlowIcon, title: "Context Switching", desc: "Measure the cost of interruptions and fragmented focus time." },
  { icon: SignalCaptureIcon, title: "Real-Time Telemetry", desc: "Live dashboard of team health, burnout risk, and engagement." },
  { icon: ReportIcon, title: "AI Daily Summaries", desc: "AI-generated daily and hourly summaries available to managers — with automated delivery rolling out next." },
];

export const FeaturesSection: React.FC = () => {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <FadeIn key={idx} delay={idx * 100}>
              <div className="bg-navy-800/30 border border-white/5 p-8 rounded-2xl hover:border-cyan-500/40 transition-all duration-300 group cursor-default">
                <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyan-500 text-white group-hover:text-navy-900 transition-all">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3 group-hover:text-cyan-400 transition-colors">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};