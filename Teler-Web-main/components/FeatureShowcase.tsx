import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { Shield, User, Briefcase, FileText, Users, CheckCircle2 } from 'lucide-react';

interface FeatureContent {
  label: string;
  title: string;
  description: string;
  renderVisual: () => React.ReactNode;
}

const features: FeatureContent[] = [
  {
    label: "Role-Based Productivity Analysis",
    title: "Contextual Performance Assessment",
    description: "AI evaluates productivity based on role and seniority. A junior and a senior are assessed differently, focusing on responsibility and output, not hours.",
    renderVisual: () => (
      <div className="p-8 bg-navy-900/50 rounded-2xl border border-white/10 w-full max-w-md mx-auto shadow-2xl">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/5">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <User className="text-cyan-500 w-6 h-6" />
          </div>
          <div>
            <div className="text-white font-semibold">Sarah Jenkins</div>
            <div className="text-gray-400 text-sm">Senior Software Architect</div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="p-3 bg-white/5 rounded-lg border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-cyan-500 font-bold mb-1">Expected Pattern</div>
            <div className="text-sm text-gray-200">High-level design & cross-team mentoring</div>
          </div>
          <div className="p-3 bg-cyan-500/5 rounded-lg border border-cyan-500/20">
            <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mb-1">Assessment</div>
            <div className="text-sm text-white">Focus aligned with architectural roadmap. Strategic impact detected in Q3 planning.</div>
          </div>
        </div>
      </div>
    )
  },
  {
    label: "Work vs Personal Activity Separation",
    title: "Intelligent Signal Filtering",
    description: "AI Timer differentiates professional work from personal or learning activities. Tasks like editing a CV or study notes are excluded from productivity scoring.",
    renderVisual: () => (
      <div className="p-8 bg-navy-900/50 rounded-2xl border border-white/10 w-full max-w-md mx-auto shadow-2xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-white font-medium">Professional Work</span>
            </div>
            <span className="text-gray-400 text-sm">82%</span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden flex">
            <div className="h-full bg-cyan-500 w-[82%]"></div>
            <div className="h-full bg-yellow-500/40 w-[12%]"></div>
            <div className="h-full bg-gray-600 w-[6%]"></div>
          </div>
          <div className="grid grid-cols-1 gap-3 mt-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/5">
              <span className="text-sm text-gray-300">Engineering Docs</span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded">WORK</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 opacity-60">
              <span className="text-sm text-gray-400">Personal Banking</span>
              <span className="text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded">EXCLUDED</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 opacity-80">
              <span className="text-sm text-gray-300">New Language Tutorial</span>
              <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">LEARNING</span>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    label: "Daily AI Reports",
    title: "Executive Workflow Summaries",
    description: "AI generates clear end-of-day reports so there is no need to review screenshots or raw activity logs.",
    renderVisual: () => (
      <div className="p-8 bg-navy-900/50 rounded-2xl border border-white/10 w-full max-w-md mx-auto shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <div className="text-white font-bold">Daily Insight Report</div>
          <div className="text-gray-500 text-xs font-mono">Oct 24, 2025</div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
            <div className="text-2xl font-bold text-white">92%</div>
            <div className="text-[10px] text-gray-500 uppercase">Alignment</div>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
            <div className="text-2xl font-bold text-white">6.4h</div>
            <div className="text-[10px] text-gray-500 uppercase">Focus Time</div>
          </div>
        </div>
        <div className="p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
          <div className="text-xs text-white leading-relaxed italic">
            "Primary focus on Backend Refactoring. Collaborative sessions with Junior Devs accounted for 15% of the day. Minimal context switching detected."
          </div>
        </div>
      </div>
    )
  },
  {
    label: "Privacy & Confidentiality",
    title: "Enterprise Trust Architecture",
    description: "No screenshots or personal content are visible to managers. Sensitive information is processed by AI only, preserving confidentiality and trust.",
    renderVisual: () => (
      <div className="p-8 bg-navy-900/50 rounded-2xl border border-white/10 w-full max-w-md mx-auto shadow-2xl flex flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full"></div>
          <Shield className="w-20 h-20 text-cyan-500 relative z-10" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-4">
          <div className="text-white font-medium">Privacy Shield Active</div>
          <div className="flex flex-col gap-2">
            {[
              "Zero Manager Access to Visuals",
              "AI-Only Signal Processing",
              "Local Data Anonymization"
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-400 justify-center">
                <CheckCircle2 className="w-3 h-3 text-cyan-500" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
  {
    label: "Meeting Notes & Summaries",
    title: "Collaboration Intelligence",
    description: "AI Timer automatically generates structured meeting notes and summaries, removing the need for manual documentation.",
    renderVisual: () => (
      <div className="p-8 bg-navy-900/50 rounded-2xl border border-white/10 w-full max-w-md mx-auto shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded bg-cyan-500/10 flex items-center justify-center">
            <Users className="text-cyan-500 w-4 h-4" />
          </div>
          <div className="text-white font-semibold text-sm">Architecture Review: v2.4</div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-bold mb-2">Decisions Made</div>
            <ul className="text-xs text-gray-300 space-y-1.5 list-disc pl-4">
              <li>Adopted GraphQL for new client endpoints</li>
              <li>Postponed migration of legacy auth module</li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-bold mb-2">Action Items</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-white bg-white/5 p-2 rounded">
                <div className="w-3 h-3 border border-cyan-500 rounded"></div>
                Update API Documentation
              </div>
              <div className="flex items-center gap-2 text-xs text-white bg-white/5 p-2 rounded">
                <div className="w-3 h-3 border border-cyan-500 rounded"></div>
                Draft stakeholder notification
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
];

interface FeatureShowcaseProps {
  activeTab: number;
  setActiveTab: (index: number) => void;
}

export const FeatureShowcase: React.FC<FeatureShowcaseProps> = ({ activeTab, setActiveTab }) => {
  return (
    <section className="py-24 bg-navy-900 border-t border-white/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-20">
          {features.map((feature, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-all duration-300 border ${
                activeTab === idx 
                ? 'bg-white/10 text-white border-cyan-500/50 shadow-lg shadow-cyan-500/5' 
                : 'bg-transparent text-gray-500 border-white/5 hover:border-white/20 hover:text-gray-300'
              }`}
            >
              {feature.label}
            </button>
          ))}
        </div>

        {/* Feature Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Explanation */}
          <div className="order-2 lg:order-1">
            <FadeIn key={`text-${activeTab}`} direction="none" className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-widest border border-cyan-500/20">
                Core Feature 0{activeTab + 1}
              </div>
              <h3 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                {features[activeTab].title}
              </h3>
              <p className="text-xl text-gray-400 leading-relaxed max-w-xl">
                {features[activeTab].description}
              </p>
              
              <div className="flex flex-col gap-4 pt-4">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  </div>
                  Fact-based evaluation models
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-cyan-500" />
                  </div>
                  Privacy-first by design
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Visual Preview */}
          <div className="order-1 lg:order-2">
            <FadeIn key={`viz-${activeTab}`} direction="none" className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative bg-navy-800/50 border border-white/10 rounded-3xl p-4 md:p-8 backdrop-blur-xl">
                <div className="flex gap-1.5 mb-6">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10"></div>
                </div>
                
                <div className="min-h-[300px] flex items-center justify-center">
                  {features[activeTab].renderVisual()}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
};