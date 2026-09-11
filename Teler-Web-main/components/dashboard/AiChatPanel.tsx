import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Session } from '../../types';
import { aiAgentHandler, AiSource } from '../../services/aiAgentHandler';
import { getAiSettings, getActiveApiKey, getModelLabel } from '../../services/aiAgentService';
import { AiSettingsPanel } from '../settings/AiSettingsPanel';
import { TelerIcon } from '../ui/TelerIcon';
import { IconButton } from '../ui/IconButton';
import { InlineAlert } from '../ui/InlineAlert';
import { AiComposer, AiSourceCard } from '../ui/AiPrimitives';
import { OverlaySurface } from '../ui/Overlay';
import { generateAlerts } from './alertUtils';
import { X, Settings, RotateCcw, User, ChevronDown, ChevronUp, FileSearch } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
  sources?: AiSource[];
  confidence?: number;
}

const WELCOME: Message = { role: 'assistant', content: "Hello! I'm TELER AI. Ask me about productivity, focus, risks, or supporting sessions." };


interface Props { sessions: Session[]; onClose: () => void; }

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
  const suggestedPrompts = useMemo(() => {
    const prompts: string[] = ['Summarize the current workforce activity.'];
    if (sessions.some(session => session.overall_productivity_score > 0)) prompts.push('Who has the highest average productivity score?');
    else prompts.push('Which sessions have enough evidence to evaluate productivity?');
    if (sessions.some(session => (session.app_switches?.length ?? 0) > 0)) prompts.push('Which employee has the most context switches?');
    else prompts.push('What can we conclude from the available focus and activity evidence?');
    const activeAlerts = generateAlerts(sessions);
    if (activeAlerts.length) prompts.push('Summarize the active risks and supporting evidence.');
    else prompts.push('Are there any meaningful risk signals in the current telemetry?');
    return prompts.slice(0, 4);
  }, [sessions]);

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

  return <OverlaySurface label="TELER AI assistant" onClose={onClose} kind="panel" backdrop={false} className="w-full sm:w-[440px] h-[calc(100vh-5rem)] sm:h-[660px] sm:max-h-[calc(100vh-80px)]">
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-subtle overflow-hidden bg-surface-card shadow-2xl">
      {showSettings ? <AiSettingsPanel onClose={() => setShowSettings(false)} /> : <>
        <header className="flex items-center justify-between px-4 py-3.5 border-b border-subtle shrink-0">
          <div className="flex items-center gap-2.5 min-w-0"><div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent flex items-center justify-center shrink-0"><TelerIcon size={14} className="text-accent" /></div><div className="min-w-0"><p className="text-primary font-bold text-sm">TELER AI</p><p className="text-secondary text-[11px] truncate">{modelLabel} · {sessions.length} filtered sessions</p></div></div>
          <div className="flex items-center gap-1 shrink-0"><IconButton label="Clear TELER AI chat" size="sm" variant="ghost" onClick={() => setMessages([WELCOME])}><RotateCcw className="w-4 h-4" /></IconButton><IconButton label="Open AI settings" size="sm" variant="ghost" onClick={() => setShowSettings(true)}><Settings className="w-4 h-4" /></IconButton><IconButton label="Close TELER AI" size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></IconButton></div>
        </header>

        {!isConfigured && <InlineAlert tone="warning" className="mx-4 mt-3 text-xs">The selected provider needs configuration. <button type="button" onClick={() => setShowSettings(true)} className="underline font-semibold">Open AI Settings</button>.</InlineAlert>}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
          {messages.map((message, index) => <div key={index} className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role !== 'user' && <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 border ${message.role === 'error' ? 'bg-danger-soft border-danger' : 'bg-accent-soft border-accent'}`}><TelerIcon size={12} className={message.role === 'error' ? 'text-danger' : 'text-accent'} /></div>}
            <div className="max-w-[88%] min-w-0">
              <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words border ${message.role === 'user' ? 'bg-accent-soft border-accent text-primary' : message.role === 'error' ? 'bg-danger-soft border-danger text-danger' : 'bg-surface-raised border-subtle text-primary'}`}>{message.content}</div>
              {message.role === 'assistant' && message.sources?.length ? <div className="mt-2">
                <button type="button" onClick={() => setExpanded(current => ({ ...current, [index]: !current[index] }))} className="flex items-center gap-1.5 text-xs text-accent hover:underline"><FileSearch className="w-3.5 h-3.5" />Why this conclusion? · {message.confidence}% confidence {expanded[index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</button>
                {expanded[index] && <div className="mt-2 space-y-2">{message.sources.map(source => <AiSourceCard key={source.id} source={source} />)}</div>}
              </div> : null}
            </div>
            {message.role === 'user' && <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 bg-surface-raised border border-subtle"><User className="w-3.5 h-3.5 text-secondary" /></div>}
          </div>)}

          {loading && <div className="flex gap-2.5 justify-start" role="status" aria-label="TELER AI is responding"><div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-accent/10 border border-accent"><TelerIcon size={12} className="text-accent" /></div><div className="bg-surface-card border border-subtle rounded-xl px-4 py-3 flex gap-1.5">{[0,1,2].map(value => <span key={value} className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${value * 140}ms` }} />)}</div></div>}

          {messages.length === 1 && !loading && <div className="space-y-1.5 pt-1"><p className="text-xs text-secondary font-semibold px-1">Suggested questions</p>{suggestedPrompts.map(prompt => <button key={prompt} type="button" onClick={() => send(prompt)} className="w-full text-left text-xs text-secondary hover:text-primary bg-surface-raised hover:bg-surface-hover border border-subtle rounded-xl px-3 py-2.5">{prompt}</button>)}</div>}
          <div ref={bottomRef} />
        </div>

        <footer className="px-3 sm:px-4 pb-3 sm:pb-4 pt-3 shrink-0 border-t border-subtle"><AiComposer compact inputRef={inputRef} value={input} onChange={setInput} onSend={() => send(input)} onKeyDown={handleKey} disabled={loading} /><p className="text-[11px] text-secondary mt-1.5 text-center hidden sm:block">Enter to send · Shift+Enter for new line</p></footer>
      </>}
    </div>
  </OverlaySurface>;
};