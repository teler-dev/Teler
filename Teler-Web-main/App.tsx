
import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, ArrowRight, Check, ShieldCheck, Lock, User, Mail } from 'lucide-react';
import { TelerIcon } from './components/ui/TelerIcon';
import { Employee } from './types';
import { Dashboard } from './components/dashboard/Dashboard';
import { EmployerOverview } from './components/dashboard/EmployerOverview';
import { EmployeesPage } from './components/dashboard/EmployeesPage';
import { AlertsPage } from './components/dashboard/AlertsPage';
import { NavSection } from './components/dashboard/DashboardSidebar';
import { AiChatPanel } from './components/dashboard/AiChatPanel';
import { AiSettingsPanel } from './components/settings/AiSettingsPanel';
import { useSessions } from './components/dashboard/useSessions';
import { Button } from './components/ui/Button';
import { HeroRadar } from './components/HeroRadar';
import { FadeIn } from './components/ui/FadeIn';
import { ProblemSection } from './components/ProblemSection';
import { ProcessSection } from './components/ProcessSection';
import { AiVizSection } from './components/AiVizSection';
import { ComparisonSection } from './components/ComparisonSection';
import { FeaturesSection } from './components/FeaturesSection';
import { FeatureShowcase } from './components/FeatureShowcase';
import { Footer } from './components/Footer';
import { Logo } from './components/Logo';
import { HowItWorksPage } from './components/HowItWorksPage';
import { LegalPage } from './components/LegalPages';
import { IntegrationsPage, SecurityPage } from './components/ProductPages';
import { AboutPage, CareersPage, ContactPage } from './components/CompanyPages';

export type View = 'landing' | 'login' | 'overview' | 'dashboard' | 'employees' | 'alerts' | 'how-it-works' | 'privacy' | 'terms' | 'gdpr' | 'integrations' | 'security' | 'about' | 'careers' | 'contact';

const Navbar: React.FC<{ 
  onLoginClick: () => void, 
  onHomeClick: () => void, 
  onHowItWorksClick: () => void,
  onFeaturesClick: () => void,
  showActions?: boolean,
  currentView: View
}> = ({ onLoginClick, onHomeClick, onHowItWorksClick, onFeaturesClick, showActions = true, currentView }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToDemo = () => {
    onHomeClick();
    setTimeout(() => {
      document.getElementById('book-demo')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    setMobileMenuOpen(false);
  };

  const getNavLinkClass = (view: View) => {
    const isActive = currentView === view;
    const base = "text-sm font-medium transition-all duration-300";
    if (!showActions) {
      return `${base} text-gray-600 hover:text-gray-400 opacity-50 hover:opacity-100`;
    }
    return `${base} ${isActive ? 'text-cyan-400' : 'text-gray-300 hover:text-white'}`;
  };

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-navy-900/90 backdrop-blur-md border-b border-white/5 py-3' : 'bg-transparent py-6'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <button onClick={onHomeClick} className="hover:opacity-80 transition-opacity">
          <Logo variant="navbar" />
        </button>

        <div className="hidden md:flex items-center gap-8">
          <button onClick={onHomeClick} className={getNavLinkClass('landing')}>Home</button>
          <button onClick={onFeaturesClick} className="text-sm font-medium transition-all duration-300 text-gray-300 hover:text-white">Features</button>
          <button onClick={onHowItWorksClick} className={getNavLinkClass('how-it-works')}>How it Works</button>
          {showActions && (
            <>
              <Button variant="outline" className="px-4 py-2 text-sm" onClick={onLoginClick}>Login</Button>
              <Button 
                variant="primary" 
                className="px-4 py-2 text-sm shadow-lg shadow-cyan-500/20"
                onClick={scrollToDemo}
              >
                Book Demo
              </Button>
            </>
          )}
        </div>

        <button className="md:hidden text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-navy-900 border-b border-white/10 p-4 flex flex-col gap-4">
           <button onClick={() => { onHomeClick(); setMobileMenuOpen(false); }} className={getNavLinkClass('landing') + " text-left"}>Home</button>
           <button onClick={() => { onFeaturesClick(); setMobileMenuOpen(false); }} className="text-left text-gray-300">Features</button>
           <button onClick={() => { onHowItWorksClick(); setMobileMenuOpen(false); }} className={getNavLinkClass('how-it-works') + " text-left"}>How it Works</button>
           {showActions && (
             <>
              <button onClick={() => { onLoginClick(); setMobileMenuOpen(false); }} className="text-left text-gray-300">Login</button>
              <Button variant="primary" className="w-full" onClick={scrollToDemo}>Book Demo</Button>
             </>
           )}
        </div>
      )}
    </nav>
  );
};

const LoginPage: React.FC<{ onBack: () => void; onDashboard: (user: string) => void }> = ({ onBack, onDashboard }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getBarHeight = (index: number) => {
    const heights = ['h-5', 'h-3.5', 'h-2'];
    return heights[index % 3];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      if (username === 'essazahid' && password === '12345678') {
        onDashboard(username);
      } else {
        setError('Invalid username or password.');
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-navy-900">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      <FadeIn className="w-full max-w-md">
        <div className="bg-navy-800/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 hover:border-cyan-500/20 transition-colors duration-500">
          <div className="flex flex-col items-center mb-6">
            <Logo className="mb-6 scale-110" />
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Sign in to TELER</h1>
            <p className="text-gray-400 text-sm text-center px-4">Secure workforce telemetry dashboard.</p>
          </div>

          <div className="mb-8 text-center">
             <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold opacity-70">
               Enterprise-grade security. Privacy-first architecture.
             </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 ml-1 uppercase tracking-wider">Username</label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-cyan-400 transition-colors" />
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  placeholder="essazahid"
                  className="w-full bg-navy-900 border border-white/10 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/5 outline-none rounded-xl py-3.5 pl-11 pr-4 text-white placeholder:text-gray-700 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center ml-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</label>
                <button type="button" className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider transition-colors">Forgot password?</button>
              </div>

              <div className="relative group min-h-[50px]">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-cyan-400 transition-colors z-20" />

                <div className="absolute inset-0 flex items-center pl-11 pr-4 pointer-events-none z-10">
                  <div className="flex items-center gap-[3px]">
                    {password.length > 0 ? (
                      password.split('').map((_, i) => (
                        <div
                          key={i}
                          className={`w-[3px] bg-cyan-400 rounded-full transition-all duration-300 ${getBarHeight(i)} drop-shadow-[0_0_8px_rgba(19,214,255,0.6)] animate-signal-sweep`}
                        />
                      ))
                    ) : (
                      [...Array(8)].map((_, i) => (
                        <div
                          key={i}
                          className={`w-[3px] bg-white/10 rounded-full transition-all duration-300 ${getBarHeight(i)}`}
                        />
                      ))
                    )}
                    {isFocused && (
                      <div className="w-[1.5px] h-4 bg-cyan-400 ml-1 animate-pulse" />
                    )}
                  </div>
                </div>

                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  className="w-full bg-navy-900 border border-white/10 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/5 outline-none rounded-xl py-3.5 pl-11 pr-4 transition-all text-transparent selection:bg-cyan-500/30"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-500/5 border border-red-500/15 rounded-xl py-2.5 px-4">{error}</p>
            )}

            <Button variant="primary" type="submit" disabled={loading} className="w-full py-4 text-lg mt-2 shadow-lg shadow-cyan-500/10">
              {loading ? 'Authenticating…' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-8 text-center px-4">
             <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5 leading-relaxed">
               <ShieldCheck className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
               Raw activity is never shared. Only AI-validated work summaries are provided to managers.
             </p>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <button
              onClick={onBack}
              className="text-gray-500 hover:text-white transition-colors text-sm flex items-center justify-center gap-2 mx-auto font-medium"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to site
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] text-gray-600 uppercase tracking-widest font-bold opacity-60">
          Privacy-First Architecture
        </p>
      </FadeIn>
    </div>
  );
};

export const SignalWaveBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute top-[10%] right-[5%] w-[450px] h-[450px] bg-cyan-500/15 blur-[120px] rounded-full animate-orb-float-1"></div>
      <div className="absolute bottom-[20%] left-[10%] w-[500px] h-[500px] bg-blue-600/10 blur-[140px] rounded-full animate-orb-float-2"></div>
      
      <div 
        className="absolute inset-0 opacity-[0.03]" 
        style={{ 
          backgroundImage: 'linear-gradient(90deg, rgba(61, 242, 255, 0.4) 1px, transparent 1px)', 
          backgroundSize: '120px 100%' 
        }}
      ></div>

      <div className="absolute inset-0 flex flex-col justify-around py-20 opacity-30">
        {[...Array(4)].map((_, i) => (
          <div 
            key={i} 
            className="w-full h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent animate-signal-wave"
            style={{
              animationDelay: `${i * -6}s`,
              animationDuration: `${20 + i * 5}s`,
              transform: `scaleY(${1 + i * 0.1})`
            }}
          >
            <svg width="100%" height="100" className="absolute top-1/2 -translate-y-1/2 left-0 overflow-visible opacity-50">
              <path 
                d="M-100 50 Q 150 20 400 50 T 900 50 T 1400 50 T 1900 50" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="0.5" 
                className="text-cyan-400"
              />
            </svg>
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-navy-900 via-transparent to-transparent"></div>
    </div>
  );
};

const DemoSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
    }
  };

  return (
    <section id="book-demo" className="py-32 relative border-t border-white/5 bg-navy-950/20 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
        <FadeIn>
          {!submitted ? (
            <div className="space-y-10">
              <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Request a Product Demo</h2>
                <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                  Learn how TELER validates professional contribution through AI signals instead of manual tracking.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-cyan-400 transition-colors">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input 
                    type="email" 
                    required 
                    placeholder="Work email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-navy-900 border border-white/10 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10 outline-none rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-gray-700 transition-all text-lg"
                  />
                </div>
                <Button 
                  type="submit" 
                  variant="primary" 
                  className="w-full text-lg py-4 shadow-xl shadow-cyan-500/10"
                >
                  Request Demo
                </Button>
                <p className="text-xs text-gray-500 pt-2">
                  Objective insights for remote teams. No screenshots. No micromanagement.
                </p>
              </form>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center gap-6 animate-float">
              <div className="w-20 h-20 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30">
                <Check className="w-10 h-10 text-cyan-400" strokeWidth={3} />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-white">Request Received.</h3>
                <p className="text-gray-400">Our team will reach out to {email} shortly.</p>
              </div>
            </div>
          )}
        </FadeIn>
      </div>
    </section>
  );
};

const PrivacyPromise: React.FC = () => (
  <section className="py-20 bg-navy-950/50 border-y border-white/5">
    <div className="max-w-4xl mx-auto px-4 text-center">
      <FadeIn>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-8">
          <ShieldCheck className="w-4 h-4" />
          The TELER Privacy Standard
        </div>
        <h2 className="text-3xl font-bold mb-12 text-white">Trust-based workforce telemetry.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="space-y-3 p-6 bg-white/5 rounded-2xl border border-white/5">
            <h4 className="text-white font-semibold">Privacy by Design</h4>
            <p className="text-gray-400 text-sm leading-relaxed">No screenshots or desktop recordings. TELER captures work signals, not visual data.</p>
          </div>
          <div className="space-y-3 p-6 bg-white/5 rounded-2xl border border-white/5">
            <h4 className="text-white font-semibold">Signal Filtering</h4>
            <p className="text-gray-400 text-sm leading-relaxed">Personal activities are automatically excluded from performance and alignment reports.</p>
          </div>
          <div className="space-y-3 p-6 bg-white/5 rounded-2xl border border-white/5">
            <h4 className="text-white font-semibold">Validated Intelligence</h4>
            <p className="text-gray-400 text-sm leading-relaxed">AI analyzes contribution quality and project alignment instead of simple keyboard metrics.</p>
          </div>
        </div>
      </FadeIn>
    </div>
  </section>
);

const MarketStats: React.FC = () => (
  <section className="py-20 border-t border-white/5">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        <FadeIn>
           <div className="text-5xl font-bold text-white mb-2">$21B+</div>
           <div className="text-cyan-500 font-medium text-sm uppercase tracking-wider">Productivity Market</div>
        </FadeIn>
        <FadeIn delay={100}>
           <div className="text-5xl font-bold text-white mb-2">83%</div>
           <div className="text-cyan-500 font-medium text-sm uppercase tracking-wider">Distributed Teams</div>
        </FadeIn>
        <FadeIn delay={200}>
           <div className="text-5xl font-bold text-white mb-2">Objective</div>
           <div className="text-cyan-500 font-medium text-sm uppercase tracking-wider">Validated Data</div>
        </FadeIn>
      </div>
    </div>
  </section>
);

// @fix: Added missing ImpactSection component
const ImpactSection: React.FC = () => (
  <section className="py-24 bg-navy-900 border-t border-white/5 relative overflow-hidden">
    <div className="absolute top-1/2 left-0 w-64 h-64 bg-cyan-500/5 blur-[100px] rounded-full pointer-events-none"></div>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <FadeIn>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold uppercase tracking-widest">
            Outcome Measurement
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white leading-tight">
            Real Impact on <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Organizational Health</span>
          </h2>
          <p className="text-lg text-gray-400 mb-8 leading-relaxed max-w-xl">
            TELER doesn't just measure hours; it monitors the structural health of your team. By identifying burnout risks and role misalignment early, we help you build a more resilient workforce.
          </p>
          <div className="space-y-6">
            {[
              { title: "Reduce Burnout", desc: "Identify sustained high-intensity periods before they lead to turnover." },
              { title: "Optimize Allocation", desc: "Ensure your most expensive resources are focused on high-leverage tasks." },
              { title: "Improve Retention", desc: "Build culture on trust and objective contribution rather than presence." }
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">{item.title}</h4>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
        
        <FadeIn delay={200} className="relative">
          <div className="aspect-square bg-navy-800/50 rounded-3xl border border-white/10 p-8 flex flex-col justify-center items-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent"></div>
            <div className="text-center relative z-10">
              <div className="text-8xl font-black text-white mb-2 tracking-tighter glow-text">2.4x</div>
              <div className="text-cyan-500 font-bold uppercase tracking-[0.2em] text-xs">Better Accuracy</div>
              <p className="mt-8 text-gray-400 text-sm max-w-[240px] mx-auto leading-relaxed">
                Compared to manual time tracking logs in distributed engineering environments.
              </p>
            </div>
            {/* Abstract Decorative Elements */}
            <div className="absolute -bottom-10 -right-10 w-48 h-48 border border-cyan-500/10 rounded-full animate-pulse"></div>
            <div className="absolute -top-10 -left-10 w-40 h-40 border border-white/5 rounded-full"></div>
          </div>
        </FadeIn>
      </div>
    </div>
  </section>
);

const TypingHeadline: React.FC = () => {
  const words = ["validated", "objective", "role-aware", "privacy-first"];
  const [wordIndex, setWordIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (isFinished) return;
    const currentWord = words[wordIndex];
    if (!isDeleting && displayedText === currentWord) {
      if (wordIndex === words.length - 1) {
        setIsFinished(true);
        return;
      }
      const timeout = setTimeout(() => setIsDeleting(true), 1200);
      return () => clearTimeout(timeout);
    }
    if (isDeleting && displayedText === "") {
      setIsDeleting(false);
      setWordIndex((prev) => prev + 1);
      return;
    }
    const timeout = setTimeout(() => {
      setDisplayedText(prev => isDeleting ? currentWord.substring(0, prev.length - 1) : currentWord.substring(0, prev.length + 1));
    }, isDeleting ? 40 : 60);
    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, wordIndex, isFinished]);

  return (
    <h1 className="text-5xl lg:text-7xl font-bold leading-tight mb-6 text-white tracking-tight">
      AI workforce telemetry that is{" "}
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 inline-block min-w-[200px] lg:min-w-[350px]">
        {displayedText}
        {!isFinished && <span className="inline-block w-[2px] h-[0.8em] bg-cyan-400 ml-1 animate-pulse align-middle"></span>}
      </span>
    </h1>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<View>('landing');
  const [activeFeatureTab, setActiveFeatureTab] = useState(0);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [showAiChat, setShowAiChat]         = useState(false);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const { sessions: globalSessions } = useSessions();

  useEffect(() => {
    window.scrollTo(0, 0);
    const titles: Record<View, string> = {
      landing: "TELER | AI Workforce Telemetry & Verified Work Hours",
      login: "Sign In | TELER Dashboard",
      overview: "Workforce Overview | TELER",
      dashboard: "Employee Detail | TELER",
      employees: "Employees | TELER Workforce",
      alerts: "Active Alerts | TELER Workforce",
      'how-it-works': "The Process of Validating Professional Performance | TELER",
      privacy: "Privacy Standard | TELER Workforce Intelligence",
      terms: "Terms of Service | TELER",
      gdpr: "GDPR Compliance and Data Protection | TELER",
      integrations: "Software Integrations for Workforce Intelligence | TELER",
      security: "Enterprise Security Architecture | TELER",
      about: "About TELER | Signal-Based Productivity Monitoring",
      careers: "Careers | Join the TELER Team",
      contact: "Contact Sales and Support | TELER",
    };
    document.title = titles[view] || titles.landing;
  }, [view]);

  const onHomeClick = () => setView('landing');
  const onLoginClick = () => setView('login');
  const onDashboardClick = (user: string) => { setLoggedInUser(user); setActiveEmployee(null); setView('overview'); };
  const onEmployeeClick  = (emp: Employee) => { setActiveEmployee(emp); setView('dashboard'); };
  const onBackToOverview = () => { setActiveEmployee(null); setView('overview'); };
  const onSectionNavigate = (section: NavSection) => {
    if (section === 'dashboard') setView('overview');
    else if (section === 'employees') setView('employees');
    else if (section === 'alerts') setView('alerts');
    else if (section === 'ai-settings') setShowAiSettings(true);
  };
  const onHowItWorksClick = () => setView('how-it-works');
  const onPrivacyClick = () => setView('privacy');
  const onTermsClick = () => setView('terms');
  const onGdprClick = () => setView('gdpr');
  const onIntegrationsClick = () => setView('integrations');
  const onSecurityClick = () => setView('security');
  const onAboutClick = () => setView('about');
  const onCareersClick = () => setView('careers');
  const onContactClick = () => setView('contact');

  const onFeaturesClick = () => {
    if (view !== 'landing') setView('landing');
    setTimeout(() => document.getElementById('feature-showcase')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const navHandlers = { onHomeClick, onHowItWorksClick, onPrivacyClick, onTermsClick, onGdprClick, onFeaturesClick, onIntegrationsClick, onSecurityClick, onAboutClick, onCareersClick, onContactClick };

  const isAuthenticated = ['overview', 'employees', 'alerts', 'dashboard'].includes(view);

  const GlobalAiOverlay = isAuthenticated ? (
    <>
      {/* Floating Ask TELER AI button */}
      {!showAiChat && (
        <button
          onClick={() => setShowAiChat(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl font-black text-sm text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, rgba(19,214,255,0.20) 0%, rgba(59,130,246,0.18) 100%)',
            border: '1px solid rgba(19,214,255,0.35)',
            boxShadow: '0 8px 32px rgba(19,214,255,0.18), 0 0 0 1px rgba(19,214,255,0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <TelerIcon size={16} className="text-cyan-400" />
          <span className="text-cyan-100">Ask TELER AI</span>
        </button>
      )}

      {/* Chat panel */}
      {showAiChat && (
        <AiChatPanel sessions={globalSessions} onClose={() => setShowAiChat(false)} />
      )}

      {/* AI Settings modal */}
      {showAiSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAiSettings(false)}
          />
          <div
            className="relative z-10 rounded-2xl border border-white/10 overflow-hidden flex flex-col"
            style={{
              width: 480,
              height: 'min(720px, calc(100vh - 80px))',
              background: 'rgba(10,15,30,0.98)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            }}
          >
            <AiSettingsPanel onClose={() => setShowAiSettings(false)} />
          </div>
        </div>
      )}
    </>
  ) : null;

  if (view === 'overview') return (
    <>
      <EmployerOverview
        onLogout={onHomeClick}
        onEmployeeClick={onEmployeeClick}
        onSectionNavigate={onSectionNavigate}
        clientName={loggedInUser}
      />
      {GlobalAiOverlay}
    </>
  );
  if (view === 'employees') return (
    <>
      <EmployeesPage
        onLogout={onHomeClick}
        onEmployeeClick={onEmployeeClick}
        onSectionNavigate={onSectionNavigate}
        clientName={loggedInUser}
      />
      {GlobalAiOverlay}
    </>
  );
  if (view === 'alerts') return (
    <>
      <AlertsPage
        onLogout={onHomeClick}
        onEmployeeClick={onEmployeeClick}
        onSectionNavigate={onSectionNavigate}
        clientName={loggedInUser}
      />
      {GlobalAiOverlay}
    </>
  );
  if (view === 'dashboard') return (
    <>
      <Dashboard
        onLogout={onHomeClick}
        userName={loggedInUser}
        initialEmployee={activeEmployee ?? undefined}
        onBack={onBackToOverview}
      />
      {GlobalAiOverlay}
    </>
  );
  if (view === 'login') return <div className="min-h-screen bg-navy-900 text-white flex flex-col"><Navbar onLoginClick={onLoginClick} onHomeClick={onHomeClick} onHowItWorksClick={onHowItWorksClick} onFeaturesClick={onFeaturesClick} showActions={false} currentView={view} /><div className="flex-grow flex items-center justify-center"><LoginPage onBack={onHomeClick} onDashboard={onDashboardClick} /></div><Footer {...navHandlers} /></div>;
  if (view === 'how-it-works') return <div className="min-h-screen bg-navy-900 text-white"><Navbar onLoginClick={onLoginClick} onHomeClick={onHomeClick} onHowItWorksClick={onHowItWorksClick} onFeaturesClick={onFeaturesClick} currentView={view} /><HowItWorksPage onScrollToDemo={() => document.getElementById('book-demo')?.scrollIntoView({ behavior: 'smooth' })} onFeatureClick={(idx) => { setActiveFeatureTab(idx); setView('landing'); setTimeout(() => document.getElementById('feature-showcase')?.scrollIntoView({ behavior: 'smooth' }), 100); }} /><Footer {...navHandlers} /></div>;
  if (['privacy', 'terms', 'gdpr'].includes(view)) return <div className="min-h-screen bg-navy-900 text-white flex flex-col"><Navbar onLoginClick={onLoginClick} onHomeClick={onHomeClick} onHowItWorksClick={onHowItWorksClick} onFeaturesClick={onFeaturesClick} currentView={view} /><LegalPage view={view as any} /><Footer {...navHandlers} /></div>;
  if (['integrations', 'security'].includes(view)) return <div className="min-h-screen bg-navy-900 text-white flex flex-col"><Navbar onLoginClick={onLoginClick} onHomeClick={onHomeClick} onHowItWorksClick={onHowItWorksClick} onFeaturesClick={onFeaturesClick} currentView={view} />{view === 'integrations' ? <IntegrationsPage /> : <SecurityPage />}<Footer {...navHandlers} /></div>;
  if (['about', 'careers', 'contact'].includes(view)) return <div className="min-h-screen bg-navy-900 text-white flex flex-col"><Navbar onLoginClick={onLoginClick} onHomeClick={onHomeClick} onHowItWorksClick={onHowItWorksClick} onFeaturesClick={onFeaturesClick} currentView={view} /><div className="flex-grow pt-20">{view === 'about' && <AboutPage />}{view === 'careers' && <CareersPage />}{view === 'contact' && <ContactPage />}</div><Footer {...navHandlers} /></div>;

  return (
    <div className="min-h-screen bg-navy-900 text-white grid-bg">
      <Navbar onLoginClick={onLoginClick} onHomeClick={onHomeClick} onHowItWorksClick={onHowItWorksClick} onFeaturesClick={onFeaturesClick} currentView={view} />
      <header className="relative pt-32 pb-20 overflow-hidden min-h-[85vh] flex items-center">
        <SignalWaveBackground />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center gap-12 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <FadeIn>
              <div className="inline-block px-3 py-1 mb-6 border border-cyan-500/30 rounded-full bg-cyan-500/5 text-cyan-400 text-xs font-bold tracking-wider uppercase">Productivity Intelligence</div>
              <TypingHeadline />
              <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                TELER validates professional work hours through signal-based telemetry. It provides objective performance data without manual time reporting or invasive surveillance.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button variant="primary" onClick={() => document.getElementById('book-demo')?.scrollIntoView({ behavior: 'smooth' })}>Book a Demo</Button>
                <Button variant="secondary" onClick={onHowItWorksClick}>Methodology</Button>
              </div>
            </FadeIn>
          </div>
          <div className="flex-1 w-full max-w-[600px] lg:max-w-none"><FadeIn delay={300}><HeroRadar /></FadeIn></div>
        </div>
      </header>
      <ProblemSection />
      <div id="feature-showcase"><FeatureShowcase activeTab={activeFeatureTab} setActiveTab={setActiveFeatureTab} /></div>
      <PrivacyPromise />
      <ProcessSection />
      <AiVizSection />
      <ComparisonSection />
      <ImpactSection />
      <MarketStats />
      <DemoSection />
      <Footer {...navHandlers} />
    </div>
  );
};

export default App;
