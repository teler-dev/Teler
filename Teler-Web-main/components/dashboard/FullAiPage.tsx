import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Send, Sparkles, Trash2 } from 'lucide-react';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { useSessions } from './useSessions';
import { aiAgentHandler, AiSource } from '../../services/aiAgentHandler';
import { getAiSettings } from '../../services/aiAgentService';
import { generateAlerts } from './alertUtils';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { employeePath, navigate, sessionPath } from '../../services/routerService';

interface Props {
  onLogout: () => void;
  clientName: string;
  onSectionNavigate: (section: NavSection) => void;
}

type ConversationMessage = { role: 'user' | 'assistant' | 'error'; content: string; sources?: AiSource[]; confidence?: number };
type Conversation = { id: string; title: string; createdAt: string; messages: ConversationMessage[] };
const STORAGE_KEY = 'teler_ai_conversations';
const PROMPTS_KEY = 'teler_ai_saved_prompts';

function readConversations(): Conversation[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; } }
function saveConversations(items: Conversation[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 30))); }

export const FullAiPage: React.FC<Props> = ({ onLogout, clientName, onSectionNavigate }) => {
  const { sessions } = useSessions();
  const alerts = useMemo(() => generateAlerts(sessions), [sessions]);
  const [conversations, setConversations] = useState<Conversation[]>(() => readConversations());
  const [activeId, setActiveId] = useState<string>(() => readConversations()[0]?.id ?? crypto.randomUUID());
  const [messages, setMessages] = useState<ConversationMessage[]>(() => readConversations()[0]?.messages ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? '[]'); } catch { return []; } });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => {
    if (!messages.length) return;
    setConversations(current => {
      const existing = current.find(item => item.id === activeId);
      const title = messages.find(item => item.role === 'user')?.content.slice(0, 56) || 'TELER AI conversation';
      const next: Conversation = { id: activeId, title, createdAt: existing?.createdAt ?? new Date().toISOString(), messages };
      const merged = [next, ...current.filter(item => item.id !== activeId)];
      saveConversations(merged);
      return merged;
    });
  }, [messages, activeId]);

  const newConversation = () => { setActiveId(crypto.randomUUID()); setMessages([]); setInput(''); };
  const openConversation = (conversation: Conversation) => { setActiveId(conversation.id); setMessages(conversation.messages); };
  const deleteConversation = (id: string) => { const next = conversations.filter(item => item.id !== id); setConversations(next); saveConversations(next); if (id === activeId) newConversation(); };
  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    setMessages(current => [...current, { role: 'user', content: question }]);
    setInput(''); setLoading(true);
    try {
      const response = await aiAgentHandler({ question, sessions, settings: getAiSettings() });
      setMessages(current => [...current, { role: 'assistant', content: response.answer, sources: response.sources, confidence: response.confidence }]);
    } catch (error: unknown) {
      setMessages(current => [...current, { role: 'error', content: error instanceof Error ? error.message : 'TELER AI request failed.' }]);
    } finally { setLoading(false); }
  };
  const exportConversation = () => {
    const text = messages.map(message => `${message.role.toUpperCase()}\n${message.content}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'teler-ai-conversation.txt'; anchor.click(); URL.revokeObjectURL(url);
  };
  const savePrompt = () => { const prompt=input.trim(); if (!prompt || savedPrompts.includes(prompt)) return; const next=[prompt,...savedPrompts].slice(0,12); setSavedPrompts(next); localStorage.setItem(PROMPTS_KEY,JSON.stringify(next)); };

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection="workspace" onNavigate={onSectionNavigate} alertCount={alerts.length} onLogout={onLogout} clientName={clientName} />
    <div className="flex-1 ml-56 min-w-0 min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle"><div className="px-4 md:px-6 py-4 flex flex-wrap gap-3 items-center justify-between"><div><h1 className="text-xl md:text-2xl font-bold">TELER AI Workspace</h1><p className="text-sm text-secondary mt-1">Persistent conversations with employee, session, metric and time-range evidence.</p></div><div className="flex gap-2"><button type="button" onClick={newConversation} className="px-3 py-2 rounded-lg bg-accent text-white text-sm">New conversation</button><button type="button" onClick={exportConversation} disabled={!messages.length} className="px-3 py-2 rounded-lg border border-subtle bg-surface-raised text-sm disabled:opacity-40"><Download className="w-4 h-4 inline mr-1" />Export</button></div></div></header>
      <div className="flex-1 grid lg:grid-cols-[240px_1fr] min-h-0">
        <aside className="border-r border-subtle p-3 overflow-y-auto bg-surface-card"><p className="text-xs font-semibold text-secondary px-2 py-2">Conversation history</p>{conversations.length ? conversations.map(conversation => <div key={conversation.id} className={`group flex items-start gap-1 rounded-lg ${conversation.id===activeId?'bg-accent/10':'hover:bg-surface-raised'}`}><button type="button" onClick={() => openConversation(conversation)} className="flex-1 text-left px-3 py-2 min-w-0"><span className="block text-sm font-medium truncate">{conversation.title}</span><span className="block text-[11px] text-secondary mt-0.5">{new Date(conversation.createdAt).toLocaleDateString()}</span></button><button type="button" aria-label={`Delete ${conversation.title}`} onClick={() => deleteConversation(conversation.id)} className="p-2 mt-1 text-secondary opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button></div>) : <p className="text-xs text-secondary px-2 py-4">No saved conversations yet.</p>}</aside>
        <main className="min-w-0 p-4 md:p-6 flex flex-col gap-4"><WorkspaceToolbar sessions={sessions} compact />
          <div className="flex-1 min-h-[360px] bg-surface-card border border-subtle rounded-2xl p-4 md:p-5 overflow-y-auto space-y-4">
            {!messages.length && <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center"><Sparkles className="w-8 h-8 text-accent" /><h2 className="font-semibold mt-3">Ask with evidence</h2><p className="text-sm text-secondary max-w-md mt-2">TELER AI will cite the employee, session, metrics and time range used for its answer.</p>{savedPrompts.length > 0 && <div className="flex flex-wrap justify-center gap-2 mt-5">{savedPrompts.map(prompt => <button key={prompt} type="button" onClick={() => send(prompt)} className="text-xs px-3 py-2 rounded-lg border border-subtle bg-surface-raised">{prompt}</button>)}</div>}</div>}
            {messages.map((message,index) => <div key={index} className={message.role==='user'?'ml-auto max-w-2xl':'mr-auto max-w-3xl'}><div className={`rounded-xl p-3.5 border text-sm leading-6 whitespace-pre-wrap ${message.role==='user'?'bg-accent/10 border-accent':'bg-surface-raised border-subtle'}`}>{message.content}</div>{message.sources?.length ? <div className="mt-2 space-y-2"><p className="text-xs text-secondary">Why this conclusion? · {message.confidence}% confidence</p>{message.sources.map(source => <div key={source.id} className="p-3 rounded-xl border border-subtle bg-surface-card"><div className="flex flex-wrap gap-2 items-center justify-between"><a href={employeePath(source.employee)} onClick={event => { event.preventDefault(); navigate(employeePath(source.employee)); }} className="text-sm font-semibold text-accent">{source.employee}</a><a href={sessionPath(source.employee,source.sessionId)} onClick={event => { event.preventDefault(); navigate(sessionPath(source.employee,source.sessionId)); }} className="text-xs text-secondary hover:text-primary">Session {source.sessionId}</a></div><p className="text-xs text-secondary mt-1">{source.timeRange}</p><div className="flex flex-wrap gap-1.5 mt-2">{source.metrics.map(metric => <span key={metric} className="text-[11px] px-2 py-1 rounded-md bg-surface-raised border border-subtle">{metric}</span>)}</div></div>)}</div> : null}</div>)}
            {loading && <div className="text-sm text-secondary">TELER AI is analyzing the filtered evidence…</div>}<div ref={endRef} />
          </div>
          <div className="bg-surface-card border border-subtle rounded-2xl p-3"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send(input);} }} aria-label="Ask TELER AI" placeholder="Ask about productivity, risks, sessions or comparisons…" className="w-full min-h-20 bg-transparent outline-none resize-none text-sm" /><div className="flex items-center justify-between gap-3"><button type="button" onClick={savePrompt} disabled={!input.trim()} className="text-xs text-secondary hover:text-primary disabled:opacity-40">Save prompt</button><button type="button" onClick={() => send(input)} disabled={!input.trim()||loading} className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40" aria-label="Send to TELER AI"><Send className="w-4 h-4" /></button></div></div>
        </main>
      </div>
    </div>
  </div>;
};