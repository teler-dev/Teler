import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { SignalWaveBackground } from '../App';
import { ShieldCheck, Lock, FileText, Scale } from 'lucide-react';

interface LegalSectionProps {
  title: string;
  children: React.ReactNode;
}

const LegalSection: React.FC<LegalSectionProps> = ({ title, children }) => (
  <div className="mb-12">
    <h3 className="text-xl font-bold text-white mb-4 border-l-2 border-cyan-500 pl-4">{title}</h3>
    <div className="text-gray-400 leading-relaxed space-y-4">
      {children}
    </div>
  </div>
);

export const LegalPage: React.FC<{ view: 'privacy' | 'terms' | 'gdpr' }> = ({ view }) => {
  const renderContent = () => {
    switch (view) {
      case 'privacy':
        return (
          <FadeIn className="max-w-4xl mx-auto px-4 py-20 relative z-10">
            <div className="text-center mb-16">
              <ShieldCheck className="w-16 h-16 text-cyan-500 mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Privacy Policy</h1>
              <p className="text-gray-500 font-medium uppercase tracking-widest text-xs">Last Updated: October 2025</p>
            </div>

            <LegalSection title="1. Introduction">
              <p>At TELER, privacy is not an afterthought; it is our primary architectural constraint. We believe that high-performance teams thrive on trust, not surveillance. This policy explains our commitment to transparency and exactly how your data is treated.</p>
            </LegalSection>

            <LegalSection title="2. Information We Collect">
              <p>We collect minimal information required to provide our workforce intelligence service:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Information:</strong> Name, work email, organization, and professional role.</li>
                <li><strong>Work Activity Signals:</strong> Metadata regarding application usage, window titles (where enabled), and active session durations.</li>
                <li><strong>Configuration Data:</strong> System settings and preferences selected by your organization.</li>
              </ul>
            </LegalSection>

            <LegalSection title="3. What We DO NOT Collect">
              <p>To ensure absolute trust, TELER's architecture explicitly prevents the following:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>No Manager Screenshots:</strong> Your raw screen captures are never visible to management.</li>
                <li><strong>No Personal Content:</strong> We do not expose private messages, personal files, or browsing content.</li>
                <li><strong>No Audio/Video Surveillance:</strong> TELER never activates microphones or webcams.</li>
                <li><strong>No Keystroke Logging:</strong> We capture activity presence, not the specific characters typed.</li>
              </ul>
            </LegalSection>

            <LegalSection title="4. How We Use Information">
              <p>Data is used exclusively to generate AI-driven summaries and role-aware insights. Our engine processes signals to calculate "Verified Work Hours" and identify alignment with assigned project goals, helping organizations reward true contribution over manual time-logging.</p>
            </LegalSection>

            <LegalSection title="5. Who Can See the Data">
              <p>Employees have full access to their own raw activity logs and summaries. Managers and administrators only see <strong>AI-processed summaries and high-level insights</strong>. Raw activity data is never presented to management, ensuring your workflow remains your own.</p>
            </LegalSection>

            <LegalSection title="6. Data Security">
              <p>TELER employs AES-256 encryption at rest and TLS 1.3 for all data in transit. We utilize strict access controls and conduct regular enterprise-grade security audits to protect the integrity of your information.</p>
            </LegalSection>
          </FadeIn>
        );
      case 'terms':
        return (
          <FadeIn className="max-w-4xl mx-auto px-4 py-20 relative z-10">
            <div className="text-center mb-16">
              <Scale className="w-16 h-16 text-cyan-500 mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Terms of Service</h1>
              <p className="text-gray-500 font-medium uppercase tracking-widest text-xs">Effective: October 2025</p>
            </div>

            <LegalSection title="1. Acceptance of Terms">
              <p>By accessing or using the TELER platform, you agree to be bound by these Terms of Service. If you do not agree, you must immediately discontinue use of the platform.</p>
            </LegalSection>

            <LegalSection title="2. Authorized Use">
              <p>TELER is intended solely for business and professional use by authorized employees and contractors of our corporate clients. Personal use outside of a professional context is not supported.</p>
            </LegalSection>

            <LegalSection title="3. Use of Insights">
              <p>TELER provides workforce intelligence for the purpose of transparency and organizational alignment. TELER insights are <strong>not intended for automated payroll enforcement</strong> or purely algorithmic disciplinary actions. All consequential employment decisions should involve human review of broader context.</p>
            </LegalSection>

            <LegalSection title="4. Account Responsibility">
              <p>Users are responsible for maintaining the confidentiality of their login credentials. Any unauthorized access resulting from compromised credentials must be reported to TELER security immediately.</p>
            </LegalSection>

            <LegalSection title="5. Acceptable Use">
              <p>Users may not attempt to reverse engineer, disrupt, or exploit the TELER signal capture system. Fraudulent attempts to inflate productivity metrics using automated tools may result in account suspension.</p>
            </LegalSection>

            <LegalSection title="6. Limitation of Liability">
              <p>TELER provides its services on an "as is" basis. While we strive for absolute accuracy in our AI summaries, we do not guarantee specific employment or productivity outcomes resulting from the use of our insights.</p>
            </LegalSection>
          </FadeIn>
        );
      case 'gdpr':
        return (
          <FadeIn className="max-w-4xl mx-auto px-4 py-20 relative z-10">
            <div className="text-center mb-16">
              <Lock className="w-16 h-16 text-cyan-500 mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">GDPR Compliance</h1>
              <p className="text-gray-500 font-medium uppercase tracking-widest text-xs">EU Data Protection Standard</p>
            </div>

            <LegalSection title="1. Data Roles">
              <p>Under the General Data Protection Regulation (GDPR), your employer acts as the <strong>Data Controller</strong>, determining the purpose and means of processing. TELER acts as the <strong>Data Processor</strong>, handling information strictly according to the Controller's instructions.</p>
            </LegalSection>

            <LegalSection title="2. Lawful Basis for Processing">
              <p>We process data based on <strong>Contractual Necessity</strong> (to provide the requested workforce intelligence service) and <strong>Legitimate Interest</strong> (the efficient and fair management of professional work in a distributed environment).</p>
            </LegalSection>

            <LegalSection title="3. Data Subject Rights">
              <p>GDPR grants you significant rights regarding your personal data:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Right to Access:</strong> See exactly what data TELER has collected.</li>
                <li><strong>Right to Correction:</strong> Update inaccurate or incomplete information.</li>
                <li><strong>Right to Deletion:</strong> Request the removal of your data when it is no longer necessary.</li>
                <li><strong>Right to Portability:</strong> Export your data in a machine-readable format.</li>
              </ul>
            </LegalSection>

            <LegalSection title="4. Data Retention">
              <p>TELER retains activity data only for the duration specified in our contract with your organization. Upon contract termination or a valid deletion request, data is purged from our production systems within 30 days.</p>
            </LegalSection>

            <LegalSection title="5. Contact Information">
              <p>For inquiries regarding data protection or to exercise your rights, please contact our Data Protection Officer at:</p>
              <p className="text-cyan-500 font-bold">privacy@teler.ai</p>
            </LegalSection>
          </FadeIn>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-grow bg-navy-900 relative overflow-hidden">
      <SignalWaveBackground />
      {renderContent()}
    </div>
  );
};