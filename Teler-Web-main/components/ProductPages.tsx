import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { SignalWaveBackground } from '../App';
import { 
  Puzzle, 
  Settings, 
  ShieldCheck, 
  Lock, 
  Activity, 
  Database, 
  CheckCircle2, 
  Layers, 
  Cpu, 
  Key 
} from 'lucide-react';

const ProductPageHeader: React.FC<{ 
  icon: React.ElementType, 
  title: string, 
  subtitle: string 
}> = ({ icon: Icon, title, subtitle }) => (
  <section className="relative pt-32 pb-20 overflow-hidden min-h-[40vh] flex items-center border-b border-white/5">
    <SignalWaveBackground />
    <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
      <FadeIn>
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 border border-cyan-500/20 mx-auto mb-8 shadow-[0_0_30px_rgba(19,214,255,0.1)]">
          <Icon className="w-8 h-8" />
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">{title}</h1>
        <p className="text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
          {subtitle}
        </p>
      </FadeIn>
    </div>
  </section>
);

const SecuritySection: React.FC<{ title: string, description: string, bullets: string[] }> = ({ title, description, bullets }) => (
  <div className="py-12 border-b border-white/5 last:border-0">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
      <div>
        <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">{title}</h2>
        <p className="text-gray-400 leading-relaxed">{description}</p>
      </div>
      <div className="space-y-4 bg-navy-800/40 p-6 rounded-2xl border border-white/10">
        {bullets.map((bullet, i) => (
          <div key={i} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
            <span className="text-gray-300 font-medium">{bullet}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const IntegrationsPage: React.FC = () => {
  return (
    <div className="bg-navy-900 flex-grow">
      <ProductPageHeader 
        icon={Puzzle}
        title="Software Integrations"
        subtitle="Connect TELER with existing project management and HR platforms."
      />
      
      <section className="max-w-4xl mx-auto px-4 py-24 text-center">
        <FadeIn>
          <div className="mb-16">
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              TELER integrates with modern workforce tools to provide contextual work validation. We prioritize secure data exchange through standardized APIs.
            </p>
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-cyan-500/5 border border-cyan-500/20 text-cyan-400 font-bold tracking-widest uppercase text-xs">
              <Activity className="w-4 h-4 animate-pulse" />
              API Connectivity
            </div>
          </div>

          <div className="p-12 rounded-3xl bg-navy-800/40 border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[100px] rounded-full"></div>
            <h2 className="text-3xl font-bold text-white mb-12 relative z-10">Integration Roadmap</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-left relative z-10">
              {[
                { title: "Project Management", desc: "Validate billable hours against Jira, Linear, and Asana tickets." },
                { title: "Enterprise Identity", desc: "Secure authentication through Okta, Azure AD, and Google Workspace SSO." },
                { title: "HRIS & Payroll", desc: "Export verified work hours to Rippling, Deel, and Gusto." },
                { title: "Developer Tools", desc: "Correlate signal telemetry with GitHub and GitLab activity." }
              ].map((item, i) => (
                <div key={i} className="p-6 bg-navy-900 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-colors">
                  <h3 className="text-white font-bold mb-2">{item.title}</h3>
                  <p className="text-gray-400 text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>
    </div>
  );
};

export const SecurityPage: React.FC = () => {
  return (
    <div className="bg-navy-900 flex-grow">
      <ProductPageHeader 
        icon={ShieldCheck}
        title="Security Architecture"
        subtitle="Factual overview of TELER's data protection and privacy standards."
      />
      
      <section className="max-w-5xl mx-auto px-4 py-16">
        <FadeIn>
          <div className="mb-16 text-center">
            <p className="text-xl text-gray-300 leading-relaxed max-w-3xl mx-auto">
              TELER is designed with a privacy-first security architecture. We focus on capturing objective work signals while maintaining zero access to raw visual data.
            </p>
          </div>

          <div className="space-y-4">
            <SecuritySection 
              title="Data Encryption and Transmission"
              description="All telemetry data is secured using enterprise-standard encryption protocols during transmission and at rest."
              bullets={[
                "TLS 1.3 encryption for data in transit",
                "AES-256 encryption for data at rest",
                "Periodic third-party security audits"
              ]}
            />
            
            <SecuritySection 
              title="Privacy-Centric Telemetry"
              description="Our technology is built to provide workforce intelligence without surveillance."
              bullets={[
                "Zero capture of screenshots or recordings",
                "Automated filtering of personal activity",
                "AI-driven signal analysis (No human review of raw data)"
              ]}
            />

            <SecuritySection 
              title="Role-Based Access Control (RBAC)"
              description="Granular permissions ensure that processed insights are only accessible to authorized personnel."
              bullets={[
                "Strict permission hierarchies",
                "Audit logs for all data access",
                "Identity verification via enterprise SSO"
              ]}
            />
          </div>

          <div className="mt-24 p-10 bg-navy-800/30 rounded-3xl border border-white/5">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Security FAQ</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Where is data stored?</h3>
                <p className="text-gray-400 text-sm">Data is stored in secure, regional cloud instances (AWS/GCP) that comply with enterprise sovereignty requirements.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Is TELER GDPR compliant?</h3>
                <p className="text-gray-400 text-sm">Yes. TELER is designed to meet GDPR standards for data processing, focusing on professional signal analysis and automated privacy filtering.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Does TELER monitor keystrokes?</h3>
                <p className="text-gray-400 text-sm">No. TELER monitors activity presence and signal frequency, not individual keystrokes or content entry.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Who can see my work reports?</h3>
                <p className="text-gray-400 text-sm">Processed AI summaries are visible to authorized managers. Raw activity data is restricted to the individual user.</p>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>
    </div>
  );
};