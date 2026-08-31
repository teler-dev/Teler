import React from 'react';
import { Logo } from './Logo';

interface FooterProps {
  onHowItWorksClick: () => void;
  onHomeClick: () => void;
  onPrivacyClick: () => void;
  onTermsClick: () => void;
  onGdprClick: () => void;
  onFeaturesClick: () => void;
  onIntegrationsClick: () => void;
  onSecurityClick: () => void;
  onAboutClick: () => void;
  onCareersClick: () => void;
  onContactClick: () => void;
}

export const Footer: React.FC<FooterProps> = ({ 
  onHowItWorksClick, 
  onHomeClick, 
  onPrivacyClick, 
  onTermsClick, 
  onGdprClick,
  onFeaturesClick,
  onIntegrationsClick,
  onSecurityClick,
  onAboutClick,
  onCareersClick,
  onContactClick
}) => {
  return (
    <footer className="bg-navy-950 border-t border-white/10 pt-20 pb-10 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center mb-16">
            <div className="mb-8 md:mb-0">
                <button onClick={onHomeClick} className="hover:opacity-80 transition-opacity">
                  <Logo showTagline={true} variant="footer" />
                </button>
            </div>
            
            <p className="text-2xl md:text-3xl font-light text-center md:text-right text-gray-300 max-w-2xl">
              "The future of performance isn’t measured in hours — it’s measured in signals."
            </p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 border-b border-white/5 pb-12">
            <div>
                <h4 className="font-bold mb-4 text-white">Product</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onHowItWorksClick}>How it Works</li>
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onFeaturesClick}>Features</li>
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onIntegrationsClick}>Integrations</li>
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onSecurityClick}>Security</li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold mb-4 text-white">Company</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onAboutClick}>About</li>
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onCareersClick}>Careers</li>
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onContactClick}>Contact</li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold mb-4 text-white">Resources</h4>
                <ul className="space-y-2 text-gray-600 text-sm">
                    <li className="cursor-not-allowed opacity-50 select-none">Documentation</li>
                    <li className="cursor-not-allowed opacity-50 select-none">API Reference</li>
                    <li className="cursor-not-allowed opacity-50 select-none">Case Studies</li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold mb-4 text-white">Legal</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onPrivacyClick}>Privacy Policy</li>
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onTermsClick}>Terms of Service</li>
                    <li className="hover:text-cyan-500 cursor-pointer transition-colors" onClick={onGdprClick}>GDPR</li>
                </ul>
            </div>
        </div>

        <div className="text-center text-gray-600 text-sm">
            © {new Date().getFullYear()} Teler Inc. All rights reserved.
        </div>
      </div>
    </footer>
  );
};