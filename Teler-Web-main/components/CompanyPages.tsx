import React, { useState } from 'react';
import { FadeIn } from './ui/FadeIn';
import { SignalWaveBackground } from '../App';
import { Button } from './ui/Button';
import { ShieldCheck, Target, Users, Mail, CheckCircle2 } from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="bg-navy-900 min-h-screen relative overflow-hidden">
      <SignalWaveBackground />
      <section className="max-w-4xl mx-auto px-4 py-24 relative z-10">
        <FadeIn>
          <div className="inline-block px-3 py-1 mb-8 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-widest border border-cyan-500/20">
            Our Mission
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-12 tracking-tight">About TELER</h1>
          
          <div className="space-y-10 text-xl text-gray-400 leading-relaxed">
            <p>
              TELER is an AI-powered workforce intelligence platform designed to help organizations understand how work actually happens — without invasive monitoring or micromanagement.
            </p>
            <p>
              Traditional tools focus on hours and activity volume. TELER focuses on alignment, context, and outcomes by using AI to analyze work patterns in a privacy-first way.
            </p>
            <p>
              Our approach is built on trust. Managers see AI-generated insights and summaries, not screenshots or personal activity. Employees keep their privacy, while organizations gain clarity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-20">
            {[
              { title: "Privacy-first by design", icon: ShieldCheck },
              { title: "Role-aware intelligence", icon: Target },
              { title: "Trust over surveillance", icon: Users },
              { title: "Clarity over noise", icon: Mail },
            ].map((value, i) => (
              <div key={i} className="flex items-center gap-4 p-6 bg-navy-800/40 rounded-2xl border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 border border-cyan-500/20">
                  <value.icon className="w-5 h-5" />
                </div>
                <span className="text-white font-semibold text-lg">{value.title}</span>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>
    </div>
  );
};

export const CareersPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div className="bg-navy-900 min-h-screen relative overflow-hidden">
      <SignalWaveBackground />
      <section className="max-w-4xl mx-auto px-4 py-24 relative z-10">
        <FadeIn>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-8 tracking-tight">Careers at TELER</h1>
          <p className="text-xl text-gray-400 leading-relaxed mb-16">
            We are building TELER thoughtfully and deliberately. While we are not actively hiring at the moment, we are always interested in connecting with people who care about privacy, trust, and the future of work.
          </p>

          <div className="p-12 rounded-[2rem] bg-navy-800/40 border border-white/10 text-center relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[80px] rounded-full"></div>
             <div className="text-cyan-500 font-bold uppercase tracking-widest text-xs mb-4">Current Status</div>
             <h2 className="text-2xl font-bold text-white mb-8">No open positions at this time.</h2>
             
             <div className="max-w-md mx-auto">
               <p className="text-gray-400 mb-6">Want to stay informed when roles open?</p>
               {!submitted ? (
                 <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                   <input 
                     type="email" 
                     required
                     placeholder="Enter your email address"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     className="flex-grow bg-navy-900 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500/50 transition-colors"
                   />
                   <Button variant="primary" type="submit">Notify me</Button>
                 </form>
               ) : (
                 <div className="text-cyan-400 font-semibold flex items-center justify-center gap-2">
                   <CheckCircle2 className="w-5 h-5" />
                   We'll notify you!
                 </div>
               )}
               <p className="text-[10px] text-gray-600 uppercase tracking-widest mt-4">
                 We’ll only reach out when relevant roles open.
               </p>
             </div>
          </div>
        </FadeIn>
      </section>
    </div>
  );
};

export const ContactPage: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="bg-navy-900 min-h-screen relative overflow-hidden">
      <SignalWaveBackground />
      <section className="max-w-3xl mx-auto px-4 py-24 relative z-10">
        <FadeIn>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">Contact Us</h1>
          <p className="text-xl text-gray-400 mb-12">
            Have a question about TELER, a potential partnership, or an enterprise use case? Get in touch.
          </p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-6 bg-navy-800/40 p-10 rounded-[2rem] border border-white/10 shadow-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Name</label>
                  <input required placeholder="Your full name" className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none focus:border-cyan-500/50 transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Company</label>
                  <input required placeholder="Company name" className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none focus:border-cyan-500/50 transition-colors" />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Work Email</label>
                <input required type="email" placeholder="name@company.com" className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none focus:border-cyan-500/50 transition-colors" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Number of Employees</label>
                <select className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none focus:border-cyan-500/50 transition-colors appearance-none">
                  <option>1–10</option>
                  <option>11–50</option>
                  <option>51–200</option>
                  <option>201–500</option>
                  <option>501–1,000</option>
                  <option>1,000+</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Message</label>
                <textarea required rows={4} placeholder="Tell us a bit about what you’re looking for" className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none focus:border-cyan-500/50 transition-colors resize-none"></textarea>
              </div>

              <Button variant="primary" type="submit" className="w-full py-4 text-lg">Send message</Button>
            </form>
          ) : (
            <div className="bg-navy-800/40 p-20 rounded-[2rem] border border-cyan-500/20 text-center shadow-2xl">
              <div className="w-20 h-20 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500 border border-cyan-500/20 mx-auto mb-8">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Message Sent</h2>
              <p className="text-xl text-gray-400">Thanks for reaching out. We’ll get back to you shortly.</p>
              <Button variant="secondary" onClick={() => setSubmitted(false)} className="mt-10">Send another message</Button>
            </div>
          )}
        </FadeIn>
      </section>
    </div>
  );
};