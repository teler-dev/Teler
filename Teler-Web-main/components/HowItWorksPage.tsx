import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { SignalWaveBackground } from '../App';
import { 
  Shield, 
  UserCheck, 
  Filter, 
  Clock, 
  AlertCircle, 
  FileText, 
  EyeOff, 
  Users, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { Button } from './ui/Button';

const FAQItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => (
  <div className="py-6 border-b border-white/5">
    <h3 className="text-lg font-bold text-white mb-2">{question}</h3>
    <p className="text-gray-400 text-sm leading-relaxed">{answer}</p>
  </div>
);

const StepCard: React.FC<{ 
  number: string; 
  title: string; 
  description: string; 
  icon: React.ElementType; 
  bullets: string[];
  note?: string;
  onClick?: () => void;
}> = ({ number, title, description, icon: Icon, bullets, note, onClick }) => (
  <FadeIn className="py-20 border-b border-white/5 last:border-0">
    <div 
      className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-start group ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 border border-cyan-500/20 transition-all duration-300 group-hover:scale-110 group-hover:bg-cyan-500 group-hover:text-navy-900 group-hover:shadow-[0_0_20px_rgba(19,214,255,0.4)]">
            <Icon className="w-6 h-6" />
          </div>
          <span className="text-cyan-500 font-bold tracking-widest uppercase text-xs">Phase {number}</span>
        </div>
        <div className="flex items-start gap-3">
          <h2 className="text-3xl font-bold text-white tracking-tight group-hover:text-cyan-400 transition-colors">
            {title}
          </h2>
          {onClick && <ExternalLink className="w-5 h-5 text-cyan-500/40 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
        <p className="text-lg text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">{description}</p>
        
        {note && (
          <div className="p-4 bg-navy-800/50 rounded-xl border border-white/5 border-l-cyan-500 border-l-2">
            <p className="text-sm text-gray-400 italic leading-relaxed">{note}</p>
          </div>
        )}
      </div>

      <div className="bg-navy-800/40 p-8 rounded-3xl border border-white/10 space-y-4 shadow-xl group-hover:border-cyan-500/30 transition-colors duration-500">
        {bullets.map((bullet, i) => (
          <div key={i} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
            <span className="text-gray-300 font-medium leading-relaxed group-hover:text-white transition-colors">{bullet}</span>
          </div>
        ))}
      </div>
    </div>
  </FadeIn>
);

interface HowItWorksPageProps {
  onScrollToDemo: () => void;
  onFeatureClick: (index: number) => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onScrollToDemo, onFeatureClick }) => {
  return (
    <div className="relative pt-32 bg-navy-900">
      <section className="relative pb-24 overflow-hidden min-h-[50vh] flex items-center border-b border-white/5">
        <SignalWaveBackground />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <FadeIn>
            <div className="inline-block px-3 py-1 mb-8 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-widest border border-cyan-500/20">
              The TELER Methodology
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              The Process of Validating Professional Performance
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-10 leading-relaxed max-w-3xl mx-auto">
              TELER converts raw activity signals into objective work intelligence. This methodology eliminates the need for manual reporting and invasive surveillance.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 font-bold tracking-widest uppercase opacity-80">
              <span className="flex items-center gap-2 whitespace-nowrap"><Shield className="w-4 h-4 text-cyan-500" /> Objective Signals</span>
              <span className="flex items-center gap-2 whitespace-nowrap"><FileText className="w-4 h-4 text-cyan-500" /> AI-Driven Analysis</span>
              <span className="flex items-center gap-2 whitespace-nowrap"><UserCheck className="w-4 h-4 text-cyan-500" /> Validated Data</span>
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-12">
        <StepCard 
          number="1"
          title="Telemetry Capture and Local Processing"
          description="TELER records work activity signals directly on the user device. The process focuses on signal presence rather than specific content."
          icon={Shield}
          bullets={[
            "Localized signal capture",
            "Privacy-preserving data collection",
            "No raw content exposure"
          ]}
        />

        <StepCard 
          number="2"
          title="Role-Aware Alignment Verification"
          description="AI models analyze work patterns in the context of specific roles and seniority. Evaluation criteria change based on professional expectations."
          icon={UserCheck}
          onClick={() => onFeatureClick(0)}
          bullets={[
            "Role-specific baseline analysis",
            "Seniority-adjusted performance metrics",
            "Contextual work validation"
          ]}
        />

        <StepCard 
          number="3"
          title="Automated Noise and Signal Filtering"
          description="TELER distinguishes between professional contribution and personal activity. Non-work sessions are automatically removed from data sets."
          icon={Filter}
          onClick={() => onFeatureClick(1)}
          bullets={[
            "Automated removal of personal time",
            "Isolation of professional signals",
            "Clean productivity datasets"
          ]}
        />

        <StepCard 
          number="4"
          title="Calculation of Verified Work Hours"
          description="Objectively calculate professional hours based on validated signals. Verified hours provide a reliable alternative to self-reported time tracking."
          icon={Clock}
          bullets={[
            "Signal-based duration calculation",
            "Validated professional session logging",
            "Elimination of manual reporting"
          ]}
          note="Verified work hours provide objective evidence of contribution for billable and internal projects."
        />

        <StepCard 
          number="5"
          title="Project and Client Context Labeling"
          description="Identify work performed outside of assigned project parameters to ensure accurate resource allocation and billing."
          icon={AlertCircle}
          bullets={[
            "Out-of-context activity identification",
            "Accurate billable time validation",
            "Cross-project effort reporting"
          ]}
        />

        <StepCard 
          number="6"
          title="Generation of Daily Performance Summaries"
          description="Receive concise summaries of team performance and alignment at the end of each workday."
          icon={FileText}
          onClick={() => onFeatureClick(2)}
          bullets={[
            "End-of-day summary reports",
            "Key output and milestone tracking",
            "Factual performance narrative"
          ]}
        />

        <StepCard 
          number="7"
          title="Reporting for Workforce Intelligence"
          description="Managers access processed insights and summaries through a dashboard. Raw activity and visual screen data are never shared."
          icon={EyeOff}
          onClick={() => onFeatureClick(3)}
          bullets={[
            "Dashboard-level intelligence",
            "Privacy-safe team overview",
            "Strategic resource insights"
          ]}
        />
      </section>

      {/* FAQ Section for AEO */}
      <section className="py-24 bg-navy-950/30 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4">
          <FadeIn className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Methodology FAQ</h2>
            <p className="text-gray-400">Declarative answers regarding TELER's AI workforce telemetry.</p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FAQItem 
              question="What is AI workforce telemetry?" 
              answer="AI workforce telemetry is the objective capture and analysis of digital work signals to validate professional contribution and project alignment."
            />
            <FAQItem 
              question="Does TELER take screenshots?" 
              answer="No. TELER does not capture or store screenshots. It analyzes activity signals to protect user privacy while providing performance insights."
            />
            <FAQItem 
              question="How is TELER different from time tracking?" 
              answer="Traditional time tracking relies on manual entry or simple activity counts. TELER uses AI to validate that work is role-aligned and outcomes-based."
            />
            <FAQItem 
              question="How are verified work hours calculated?" 
              answer="Verified work hours are calculated by aggregating signal-based professional sessions that align with a user's role and assigned projects."
            />
          </div>
        </div>
      </section>

      <section className="py-32 bg-navy-950/50 border-t border-white/5 relative">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <FadeIn>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
              Validate professional performance objectively.
            </h2>
            <p className="text-xl text-gray-500 mb-10 font-medium">
              Verified work intelligence for modern distributed teams.
            </p>
            <div className="flex flex-col items-center gap-8">
              <Button variant="primary" className="px-12 py-5 text-lg shadow-2xl shadow-cyan-500/20" onClick={onScrollToDemo}>
                Request Demo
              </Button>
              <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-bold max-w-sm leading-relaxed">
                Objective insights for organizational alignment and resource planning.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
};