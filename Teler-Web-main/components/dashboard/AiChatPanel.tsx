import React, { useState, useRef, useEffect } from 'react';
import { Session } from '../../types';
import { aiAgentHandler } from '../../api/ai-agent';
import { getAiSettings, getActiveApiKey, getModelLabel } from '../../services/aiAgentService';
import { AiSettingsPanel } from '../settings/AiSettingsPanel';
import { TelerIcon } from '../ui/TelerIcon';
import { X, Settings, Send, RotateCcw, User, AlertTriangle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

const WELCOME: Message = {
  role: 'assistant',
  content: "Hello! I'm TELER AI. Ask me anything about your team's productivity data.",
};

const EXAMPLE_PROMPTS = [
  'Who has the highest average productivity score?',
  'Which employee has the most context switches?',
  'Show me a summary of all red flags this week.',
  'Who is at high risk and why?',
];

interface Props {
  sessions: Session[];
  onClose: () => void;
}

export const AiChatPanel: React.FC<Props> = ({ sessions, onClose }) => {
  const [messages, setMessages]         = useState<Message[]>([WELCOME]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const settings   = getAiSettings();
  const modelLabel = getModelLabel(settings);
  const apiKey     = getActiveApiKey(settings);
  const isConfigured = !!apiKey.trim() || settings.provider === 'local';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    if (!isConfigured) {
      setMessages(m => [...m, { role: 'user', content: q }, {
        role: 'error',
        content: 'AI is not configured. Please add your API key in Settings.',
      }]);
      setInput('');
      return;
    }

    setInput('');
    setMessages(m => [...m, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const s = getAiSettings();
      const { answer } = await aiAgentHandler({ question: q, sessions, settings: s });
      setMessages(m => [...m, { role: 'assistant', content: answer }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'error', content: err?.message ?? 'Unknown error.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const reset = () => {
    setMessages([WELCOME]);
    setInput('');
  };

  const showExamples = messages.length === 1;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col"
      style={{ width: 420, height: 620, maxHeight: 'calc(100vh - 80px)' }}
    >
      <div
        className="flex flex-col h-full rounded-2xl border border-white/10 overflow-hidden"
        style={{
          background: 'rgba(10,15,30,0.97)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(19,214,255,0.08)',
        }}
      >
        {showSettings ? (
          <AiSettingsPanel onClose={() => setShowSettings(false)} />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                  <TelerIcon size={14} className="text-cyan-400" />
                </div>
                <div>
                  <p className="text-white font-black text-sm tracking-tight">TELER AI</p>
                  <p className="text-gray-600 text-[10px]">
                    {modelLabel} · {sessions.length} sessions
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={reset}
                  title="Clear chat"
                  className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  title="AI Settings"
                  className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Not configured banner */}
            {!isConfigured && (
              <div className="mx-4 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  AI is not configured.{' '}
                  <button
                    onClick={() => setShowSettings(true)}
                    className="underline underline-offset-2 hover:text-amber-200 font-bold"
                  >
                    Add your API key in Settings
                  </button>.
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role !== 'user' && (
                    <div className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                      msg.role === 'error'
                        ? 'bg-red-500/15 border border-red-500/30'
                        : 'bg-cyan-500/15 border border-cyan-500/30'
                    }`}>
                      <TelerIcon size={12} className={msg.role === 'error' ? 'text-red-400' : 'text-cyan-400'} />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/15 border border-cyan-500/20 text-gray-100 rounded-tr-sm'
                        : msg.role === 'error'
                        ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-sm'
                        : 'bg-white/4 border border-white/8 text-gray-200 rounded-tl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5 bg-white/8 border border-white/10">
                      <User className="w-3 h-3 text-gray-400" />
                    </div>
                  )}
                </div>
              ))}

              {/* Loading animation */}
              {loading && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5 bg-cyan-500/15 border border-cyan-500/30">
                    <TelerIcon size={12} className="text-cyan-400" />
                  </div>
                  <div className="bg-white/4 border border-white/8 rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                    {[0, 1, 2].map(d => (
                      <div
                        key={d}
                        className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce"
                        style={{ animationDelay: `${d * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Example prompts */}
              {showExamples && !loading && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest px-1">Try asking</p>
                  {EXAMPLE_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => send(p)}
                      className="w-full text-left text-xs text-gray-400 hover:text-cyan-400 bg-white/3 hover:bg-cyan-500/8 border border-white/6 hover:border-cyan-500/20 rounded-lg px-3 py-2 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-4 pt-2 shrink-0 border-t border-white/5">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about your team's productivity..."
                  rows={1}
                  disabled={loading}
                  className="flex-1 bg-white/4 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 resize-none leading-relaxed disabled:opacity-50"
                  style={{ minHeight: 42, maxHeight: 100 }}
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || loading}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-gray-700 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
