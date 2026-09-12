import React, { useState, useEffect } from 'react';
import {
  AiSettings,
  DEFAULT_SETTINGS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  OPENROUTER_RERANK_MODELS,
  getAiSettings,
  saveAiSettings,
  getActiveApiKey,
  getActiveModel,
  getActiveRerankModel,
  askAiAgent,
} from '../../services/aiAgentService';
import { Eye, EyeOff, X, Save, RotateCcw, Zap, CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { FieldLabel, Select, Textarea, TextInput } from '../ui/FormControls';
import { StatusBadge, StatusTone } from '../ui/StatusBadge';

type ConnStatus = 'idle' | 'testing' | 'connected' | 'error';
type Toast = { type: 'success' | 'error'; message: string };

interface Props {
  onClose: () => void;
  showHeader?: boolean;
}

function KeyField({
  label, value, placeholder, onChange,
}: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <FieldLabel className="uppercase tracking-widest">{label}</FieldLabel>
      <div className="relative">
        <TextInput
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-11"
        />
        <IconButton
          label={show ? `Hide ${label}` : `Show ${label}`}
          size="sm"
          variant="ghost"
          onClick={() => setShow(v => !v)}
          className="absolute right-1 top-1/2 -translate-y-1/2"
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </IconButton>
      </div>
    </div>
  );
}

const STATUS_CFG: Record<ConnStatus, { label: string; tone: StatusTone }> = {
  idle:      { label: 'Not tested', tone: 'neutral' },
  testing:   { label: 'Testing…', tone: 'warning' },
  connected: { label: 'Connected', tone: 'success' },
  error:     { label: 'Error', tone: 'danger' },
};

export const AiSettingsPanel: React.FC<Props> = ({ onClose, showHeader = true }) => {
  const [settings, setSettings]   = useState<AiSettings>(() => getAiSettings());
  const [connStatus, setConn]     = useState<ConnStatus>('idle');
  const [toast, setToast]         = useState<Toast | null>(null);
  const [testing, setTesting]     = useState(false);
  const savedSettings = React.useRef(JSON.stringify(getAiSettings()));
  const isDirty = JSON.stringify(settings) !== savedSettings.current;

  // Reset connection status when model or provider changes
  const prevModel    = React.useRef(getActiveModel(settings));
  const prevProvider = React.useRef(settings.provider);
  useEffect(() => {
    const activeModel = getActiveModel(settings);
    if (activeModel !== prevModel.current || settings.provider !== prevProvider.current) {
      setConn('idle');
      prevModel.current    = activeModel;
      prevProvider.current = settings.provider;
    }
  }, [settings.model, settings.customModel, settings.provider]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [isDirty]);

  const update = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) =>
    setSettings(s => ({ ...s, [key]: value }));

  const handleClose = () => {
    if (isDirty && !window.confirm('Discard unsaved AI settings changes?')) return;
    onClose();
  };

  const handleSave = () => {
    if (!getActiveModel(settings)) {
      setToast({ type: 'error', message: 'Enter a model ID before saving.' });
      return;
    }
    if (settings.provider === 'openrouter' && settings.useReranking && !getActiveRerankModel(settings)) {
      setToast({ type: 'error', message: 'Enter a rerank model ID before saving.' });
      return;
    }
    saveAiSettings(settings);
    savedSettings.current = JSON.stringify(settings);
    setToast({ type: 'success', message: 'Settings saved.' });
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setConn('idle');
  };

  const handleTest = async () => {
    const apiKey = getActiveApiKey(settings);
    if (!apiKey.trim() && settings.provider === 'local') {
      setToast({ type: 'error', message: 'Connection failed. Check API key.' });
      setConn('error');
      return;
    }
    if (!getActiveModel(settings)) {
      setToast({ type: 'error', message: 'Enter a model ID first.' });
      setConn('error');
      return;
    }
    setTesting(true);
    setConn('testing');
    try {
      await askAiAgent('Respond with "TELER AI connected successfully".', {}, settings);
      setConn('connected');
      setToast({ type: 'success', message: 'AI model connected.' });
    } catch (error) {
      setConn('error');
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI connection failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  const modelOptions = settings.provider === 'openai' ? OPENAI_MODELS : OPENROUTER_MODELS;
  const selectedModel = settings.model;
  const selectedRerankModel = settings.rerankModel;
  const sc = STATUS_CFG[connStatus];

  const handleModelChange = (value: string) => {
    setSettings(current => ({
      ...current,
      model: value,
      customModel: '',
    }));
  };

  const handleRerankModelChange = (value: string) => {
    setSettings(current => ({
      ...current,
      rerankModel: value,
      customRerankModel: '',
    }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
      {toast && (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold shadow-card ${
            toast.type === 'success'
              ? 'bg-success-soft border-success text-success'
              : 'bg-danger-soft border-danger text-danger'
          }`}
          style={{ whiteSpace: 'nowrap' }}
        >
          {toast.type === 'success'
            ? <CheckCircle className="w-3.5 h-3.5" />
            : <AlertTriangle className="w-3.5 h-3.5" />}
          {toast.message}
        </div>
      )}

      {showHeader && <div className="flex items-center justify-between px-5 py-4 border-b border-subtle bg-surface-card shrink-0">
        <div>
          <h3 className="text-primary font-black text-sm tracking-tight">AI Settings</h3>
          <p className="text-secondary text-xs mt-0.5">Configure model, keys &amp; behaviour</p>
        </div>
        <IconButton label="Close AI settings" size="sm" variant="ghost" onClick={handleClose}>
          <X className="w-4 h-4" />
        </IconButton>
      </div>}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Provider */}
        <div className="space-y-1.5">
          <FieldLabel className="uppercase tracking-widest">AI Provider</FieldLabel>
          <div className="flex gap-2">
            {(['openrouter', 'openai'] as const).map(p => (
              <button
                key={p}
                onClick={() => setSettings(current => p === 'openai'
                  ? { ...current, provider: p, model: 'openai/gpt-4o-mini', customModel: '', useReranking: false }
                  : { ...current, provider: p, model: DEFAULT_SETTINGS.model, customModel: '', useReranking: true }
                )}
                className={`flex-1 min-h-10 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  settings.provider === p
                    ? 'bg-accent-soft border-accent text-primary'
                    : 'bg-surface-raised border-subtle text-secondary hover:border-accent hover:text-primary'
                }`}
              >
                {p === 'openai' ? 'OpenAI — GPT-4o Mini' : 'OpenRouter — free models'}
              </button>
            ))}
          </div>
        </div>

        {/* API Keys */}
        {settings.provider === 'openrouter' && (
          <div className="rounded-xl border border-accent bg-accent-soft px-3.5 py-3">
            <p className="text-xs font-bold text-primary">Managed securely by TELER</p>
            <p className="text-[11px] text-secondary mt-1">
              The OpenRouter key is stored server-side in Vercel and is never exposed to this browser.
            </p>
          </div>
        )}
        {settings.provider === 'openai' && (
          <div className="rounded-xl border border-accent bg-accent-soft px-3.5 py-3">
            <p className="text-xs font-bold text-primary">Managed securely by TELER</p>
            <p className="text-[11px] text-secondary mt-1">GPT-4o Mini uses TELER’s server-side provider key. The key is never exposed to this browser; paid usage may apply.</p>
          </div>
        )}

        {/* Model + status indicator */}
        <div className="space-y-1.5">
          <FieldLabel className="uppercase tracking-widest">Model</FieldLabel>
          <Select value={selectedModel} onChange={e => handleModelChange(e.target.value)}>
            {modelOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
          <StatusBadge tone={sc.tone} dot>{sc.label}</StatusBadge>
        </div>

        <details className="group rounded-xl border border-subtle bg-surface-raised">
          <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
            <span><span className="block text-xs font-bold text-primary uppercase tracking-widest">Advanced settings</span><span className="block text-[11px] text-secondary mt-1">Retrieval, generation controls and system prompt</span></span>
            <span className="text-xs font-semibold text-accent group-open:hidden">Show</span><span className="text-xs font-semibold text-accent hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-4 pb-4 pt-1 space-y-5 border-t border-subtle">
        {/* OpenRouter retrieval reranking */}
        {settings.provider === 'openrouter' && (
          <div className="space-y-3 rounded-xl border border-subtle bg-surface-raised p-3.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span>
                <span className="block text-xs font-bold text-primary uppercase tracking-widest">Context reranking</span>
                <span className="block text-[11px] text-secondary mt-1">Selects the most relevant sessions before Gemma answers.</span>
              </span>
              <input
                type="checkbox"
                checked={settings.useReranking}
                onChange={e => update('useReranking', e.target.checked)}
                className="w-4 h-4"
              />
            </label>

            {settings.useReranking && (
              <>
                <Select value={selectedRerankModel} onChange={e => handleRerankModelChange(e.target.value)}>
                  {OPENROUTER_RERANK_MODELS.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </Select>

              </>
            )}
          </div>
        )}

        {/* Temperature */}
        <div className="space-y-1.5">
          <FieldLabel className="uppercase tracking-widest">
            Temperature <span className="text-accent ml-1">{settings.temperature.toFixed(1)}</span>
          </FieldLabel>
          <input
            type="range" min={0} max={1} step={0.1}
            value={settings.temperature}
            onChange={e => update('temperature', parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted">
            <span>Precise (0.0)</span><span>Creative (1.0)</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="space-y-1.5">
          <FieldLabel className="uppercase tracking-widest">
            Max Tokens <span className="text-accent ml-1">{settings.maxTokens}</span>
          </FieldLabel>
          <TextInput
            type="number"
            min={256} max={8000} step={256}
            value={settings.maxTokens}
            onChange={e => update('maxTokens', parseInt(e.target.value) || 2000)}
          />
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <FieldLabel className="uppercase tracking-widest">System Prompt</FieldLabel>
          <Textarea
            value={settings.systemPrompt}
            onChange={e => update('systemPrompt', e.target.value)}
            rows={6}
            className="text-xs font-mono leading-relaxed"
          />
        </div>
          </div>
        </details>
      </div>

      <div className="px-5 py-4 border-t border-subtle bg-surface-card flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 shrink-0">
        <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing}>
          {testing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Test connection
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>
        <Button size="sm" onClick={handleSave}>
          <Save className="w-3.5 h-3.5" />
          Save settings
        </Button>
      </div>
    </div>
  );
};
