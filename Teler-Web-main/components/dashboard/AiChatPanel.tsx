import React, { useEffect, useRef, useState } from 'react';
import { Session } from '../../types';
import { aiAgentHandler, AiSource } from '../../services/aiAgentHandler';
import { getAiSettings, getActiveApiKey, getModelLabel } from '../../services/aiAgentService';
import { AiSettingsPanel } from '../settings/AiSettingsPanel';
import { TelerIcon } from '../ui/TelerIcon';
import { X, Settings, Send, RotateCcw, User, AlertTriangle, ChevronDown, ChevronUp, FileSearch } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
  sources?: AiSource[];
  confidence?: number;
}

const WELCOME: Message = { role: 'assistant', content: "Hello! I'm TELER AI. Ask me about productivity, focus, risks, or supporting sessions." };
const EXAMPLE_PROMPTS = [
  'Who has the highest average productivity score?',
  'Which employee has the most context switches?',
  'Show me a summary of all red flags this week.',
  'Who is at high risk and why?',
];

interface Props { sessions: Session[]; onClose: () => void; }

const SourceCard: React.FC<{ source: AiSource }> = ({ source }) => <div className="bg-surface-raised border border-subtle rounded-lg p-3">
  <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-primary truncate">{source.employee}</p><span className="text-[11px] text-secondary shrink-0">{source.confidence}% confidence</span></div>
  <p className="text-[11px] text-secondary mt-1">Session {source.sessionId} · {source.timeRange}</p>
  <div className="flex flex-wrap gap-1.5 mt-2">{source.metrics.map(metric => <span key={metric} className="text-[11px] px-2 py-1 rounded-md border border-subtle bg-surface-card text-secondary">{metric}</span>)}</div>
</div>;

export const AiChatPanel: React.FC<Props> = ({ sessions, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const settings = getAiSettings();
  const modelLabel = getModelLabel(settings);
  const apiKey = getActiveApiKey(settings);
  const isConfigured = settings.provider === 'openrouter' || settings.provider === 'local' || !!apiKey.trim();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(current => [...current, { role: 'user', content: q }]);
    if (!isConfigured) {
      setMessages(current => [...current, { role: 'error', content: 'The selected AI provider needs configuration. Open AI Settings to continue.' }]);
      return;
    }
    setLoading(true);
    try {
      const response = await aiAgentHandler({ question: q, sessions, settings: getAiSettings() });
      setMessages(current => [...current, { role: 'assistant', content: response.answer, sources: response.sources, confidence: response.confidence }]);
    } catch (error: unknown) {
      setMessages(current => [...current, { role: 'error', content: error instanceof Error ? error.message : 'Unknown TELER AI error.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(input); }
  };

  return <div role="dialog" aria-modal="true" aria-label="TELER AI assistant" className="fixed inset-x-3 top-16 bottom-3 z-[80] flex flex-col sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[440px] sm:h-[660px] sm:max-h-[calc(100vh-80px)]">
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-subtle overflow-hidden bg-surface-page shadow-2xl">
      {showSettings ? <AiSettingsPanel onClose={() => setShowSettings(false)} /> : <>
        <header className="flex items-center justify-between px-4 py-3.5 border-b border-subtle shrink-0">
          <div className="flex items-center gap-2.5 min-w-0"><div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent flex items-center justify-center shrink-0"><TelerIcon size={14} className="text-accent" /></div><div className="min-w-0"><p className="text-primary font-bold text-sm">TELER AI</p><p className="text-secondary text-[11px] truncate">{modelLabel} · {sessions.length} filtered sessions</p></div></div>
          <div className="flex items-center gap-1 shrink-0"><button type="button" onClick={() => setMessages([WELCOME])} aria-label="Clear TELER AI chat" title="Clear chat" className="p-2 text-secondary hover:text-primary rounded-lg hover:bg-surface-raised"><RotateCcw className="w-4 h-4" /></button><button type="button" onClick={() => setShowSettings(true)} aria-label="Open AI settings" title="AI Settings" className="p-2 text-secondary hover:text-primary rounded-lg hover:bg-surface-raised"><Settings className="w-4 h-4" /></button><button type="button" onClick={onClose} aria-label="Close TELER AI" title="Close" className="p-2 text-secondary hover:text-primary rounded-lg hover:bg-surface-raised"><X className="w-4 h-4" /></button></div>
        </header>

        {!isConfigured && <div className="mx-4 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5" role="status"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /><p className="text-xs text-amber-300 leading-relaxed">The selected provider needs configuration. <button type="button" onClick={() => setShowSettings(true)} className="underline font-semibold">Open AI Settings</button>.</p></div>}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
          {messages.map((message, index) => <div key={index} className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role !== 'user' && <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 border ${message.role === 'error' ? 'bg-red-500/10 border-red-500/25' : 'bg-accent/10 border-accent'}`}><TelerIcon size={12} className={message.role === 'error' ? 'text-red-400' : 'text-accent'} /></div>}
            <div className="max-w-[88%] min-w-0">
              <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words border ${message.role === 'user' ? 'bg-accent/10 border-accent text-primary rounded-tr-sm' : message.role === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-300 rounded-tl-sm' : 'bg-surface-card border-subtle text-primary rounded-tl-sm'}`}>{message.content}</div>
              {message.role === 'assistant' && message.sources?.length ? <div className="mt-2">
                <button type="button" onClick={() => setExpanded(current => ({ ...current, [index]: !current[index] }))} className="flex items-center gap-1.5 text-xs text-accent hover:underline"><FileSearch className="w-3.5 h-3.5" />Why this conclusion? · {message.confidence}% confidence {expanded[index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</button>
                {expanded[index] && <div className="mt-2 space-y-2">{message.sources.map(source => <SourceCard key={source.id} source={source} />)}</div>}
              </div> : null}
            </div>
            {message.role === 'user' && <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 bg-surface-raised border border-subtle"><User className="w-3.5 h-3.5 text-secondary" /></div>}
          </div>)}

          {loading && <div className="flex gap-2.5 justify-start" role="status" aria-label="TELER AI is responding"><div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-accent/10 border border-accent"><TelerIcon size={12} className="text-accent" /></div><div className="bg-surface-card border border-subtle rounded-xl px-4 py-3 flex gap-1.5">{[0,1,2].map(value => <span key={value} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${value * 140}ms` }} />)}</div></div>}

          {messages.length === 1 && !loading && <div className="space-y-1.5 pt-1"><p className="text-xs text-secondary font-semibold px-1">Suggested questions</p>{EXAMPLE_PROMPTS.map(prompt => <button key={prompt} type="button" onClick={() => send(prompt)} className="w-full text-left text-xs text-secondary hover:text-primary bg-surface-card hover:bg-surface-raised border border-subtle rounded-lg px-3 py-2.5">{prompt}</button>)}</div>}
          <div ref={bottomRef} />
        </div>

        <footer className="px-3 sm:px-4 pb-3 sm:pb-4 pt-3 shrink-0 border-t border-subtle"><div className="flex gap-2 items-end"><textarea ref={inputRef} aria-label="Ask TELER AI" value={input} onChange={event => setInput(event.target.value)} onKeyDown={handleKey} placeholder="Ask about your team's productivity…" rows={1} disabled={loading} className="flex-1 min-w-0 bg-surface-card border border-subtle rounded-xl px-3.5 py-2.5 text-sm text-primary placeholder:text-secondary outline-none focus:border-accent resize-none disabled:opacity-50" style={{ minHeight: 42, maxHeight: 100 }} /><button type="button" aria-label="Send message" onClick={() => send(input)} disabled={!input.trim() || loading} className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent text-white disabled:opacity-30 shrink-0"><Send className="w-4 h-4" /></button></div><p className="text-[11px] text-secondary mt-1.5 text-center hidden sm:block">Enter to send · Shift+Enter for new line</p></footer>
      </>}
    </div>
  </div>;
};