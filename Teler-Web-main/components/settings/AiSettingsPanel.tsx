import React, { useState, useEffect } from 'react';
import {
  AiSettings,
  DEFAULT_SETTINGS,
  CUSTOM_MODEL_VALUE,
  OPENROUTER_MODELS,
  OPENROUTER_RERANK_MODELS,
  OPENAI_MODELS,
  getAiSettings,
  saveAiSettings,
  getActiveApiKey,
  getActiveModel,
  getActiveRerankModel,
  askAiAgent,
} from '../../services/aiAgentService';
import { Eye, EyeOff, X, Save, RotateCcw, Zap, CheckCircle, AlertTriangle, Loader } from 'lucide-react';

type ConnStatus = 'idle' | 'testing' | 'connected' | 'error';
type Toast = { type: 'success' | 'error'; message: string };

interface Props {
  onClose: () => void;
}

function KeyField({
  label, value, placeholder, onChange,
}: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 pr-9"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          title={show ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

const STATUS_CFG: Record<ConnStatus, { dot: string; label: string; text: string }> = {
  idle:      { dot: 'bg-gray-500',   label: 'Not Tested', text: 'text-gray-500'  },
  testing:   { dot: 'bg-amber-400 animate-pulse', label: 'Testing…', text: 'text-amber-400' },
  connected: { dot: 'bg-green-400',  label: 'Connected',  text: 'text-green-400' },
  error:     { dot: 'bg-red-400',    label: 'Error',       text: 'text-red-400'   },
};

export const AiSettingsPanel: React.FC<Props> = ({ onClose }) => {
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
    if (!apiKey.trim() && settings.provider !== 'local' && settings.provider !== 'openrouter') {
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
  const selectedModel = settings.customModel.trim() ? CUSTOM_MODEL_VALUE : settings.model;
  const selectedRerankModel = settings.customRerankModel.trim()
    ? CUSTOM_MODEL_VALUE
    : settings.rerankModel;
  const sc = STATUS_CFG[connStatus];

  const handleModelChange = (value: string) => {
    setSettings(current => ({
      ...current,
      model: value,
      customModel: value === CUSTOM_MODEL_VALUE ? current.customModel : '',
    }));
  };

  const handleRerankModelChange = (value: string) => {
    setSettings(current => ({
      ...current,
      rerankModel: value,
      customRerankModel: value === CUSTOM_MODEL_VALUE ? current.customRerankModel : '',
    }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
      {toast && (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold shadow-2xl transition-all ${
            toast.type === 'success'
              ? 'bg-green-500/15 border-green-500/30 text-green-400'
              : 'bg-red-500/15 border-red-500/30 text-red-400'
          }`}
          style={{ whiteSpace: 'nowrap' }}
        >
          {toast.type === 'success'
            ? <CheckCircle className="w-3.5 h-3.5" />
            : <AlertTriangle className="w-3.5 h-3.5" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
        <div>
          <h3 className="text-white font-black text-sm tracking-tight">AI Settings</h3>
          <p className="text-gray-500 text-xs mt-0.5">Configure model, keys &amp; behaviour</p>
        </div>
        <button type="button" onClick={handleClose} aria-label="Close AI settings" title="Close AI settings" className="text-gray-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Provider */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">AI Provider</label>
          <div className="flex gap-2">
            {(['openrouter', 'openai', 'local'] as const).map(p => (
              <button
                key={p}
                onClick={() => update('provider', p)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                  settings.provider === p
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                    : 'bg-white/3 border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                }`}
              >
                {p === 'openrouter' ? 'OpenRouter' : p === 'openai' ? 'OpenAI' : 'Local'}
              </button>
            ))}
          </div>
        </div>

        {/* API Keys */}
        {settings.provider === 'openrouter' && (
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
            <p className="text-xs font-bold text-cyan-300">Managed securely by TELER</p>
            <p className="text-[10px] text-gray-500 mt-1">
              The OpenRouter key is stored server-side in Vercel and is never exposed to this browser.
            </p>
          </div>
        )}

        {settings.provider === 'openai' && (
          <>
            <KeyField
              label="OpenAI API Key"
              value={settings.openAiApiKey}
              placeholder="sk-..."
              onChange={v => update('openAiApiKey', v)}
            />
            <p className="text-[10px] text-gray-600 -mt-3">
              Stored in this browser only.
            </p>
          </>
        )}

        {/* Model + status indicator */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Model</label>
          <select
            value={selectedModel}
            onChange={e => handleModelChange(e.target.value)}
            className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50 appearance-none"
          >
            {modelOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
            <option value={CUSTOM_MODEL_VALUE}>Custom model ID…</option>
          </select>
          {/* Connection status dot */}
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${sc.text}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
            {sc.label}
          </div>
        </div>

        {/* Custom chat model */}
        {selectedModel === CUSTOM_MODEL_VALUE && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Custom chat model ID
            </label>
            <input
              type="text"
              value={settings.customModel}
              onChange={e => update('customModel', e.target.value)}
              placeholder="e.g. mistralai/mistral-large"
              className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
            />
            <p className="text-[10px] text-gray-600">Paste an exact model ID supported by the selected provider.</p>
          </div>
        )}

        {/* OpenRouter retrieval reranking */}
        {settings.provider === 'openrouter' && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span>
                <span className="block text-xs font-bold text-gray-300 uppercase tracking-widest">Context reranking</span>
                <span className="block text-[10px] text-gray-600 mt-1">Selects the most relevant sessions before Gemma answers.</span>
              </span>
              <input
                type="checkbox"
                checked={settings.useReranking}
                onChange={e => update('useReranking', e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
            </label>

            {settings.useReranking && (
              <>
                <select
                  value={selectedRerankModel}
                  onChange={e => handleRerankModelChange(e.target.value)}
                  className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50 appearance-none"
                >
                  {OPENROUTER_RERANK_MODELS.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                  <option value={CUSTOM_MODEL_VALUE}>Custom rerank model ID…</option>
                </select>

                {selectedRerankModel === CUSTOM_MODEL_VALUE && (
                  <input
                    type="text"
                    value={settings.customRerankModel}
                    onChange={e => update('customRerankModel', e.target.value)}
                    placeholder="e.g. provider/rerank-model"
                    className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Temperature */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            Temperature <span className="text-cyan-400 ml-1">{settings.temperature.toFixed(1)}</span>
          </label>
          <input
            type="range" min={0} max={1} step={0.1}
            value={settings.temperature}
            onChange={e => update('temperature', parseFloat(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>Precise (0.0)</span><span>Creative (1.0)</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            Max Tokens <span className="text-cyan-400 ml-1">{settings.maxTokens}</span>
          </label>
          <input
            type="number"
            min={256} max={8000} step={256}
            value={settings.maxTokens}
            onChange={e => update('maxTokens', parseInt(e.target.value) || 2000)}
            className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">System Prompt</label>
          <textarea
            value={settings.systemPrompt}
            onChange={e => update('systemPrompt', e.target.value)}
            rows={6}
            className="w-full bg-navy-900/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50 resize-none font-mono leading-relaxed"
          />
        </div>
      </div>

      {/* Footer — right-aligned: [Test Connection] [Reset] [Save] */}
      <div className="px-5 py-4 border-t border-white/8 flex items-center justify-end gap-2 shrink-0">
        {/* Test Connection */}
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            bg-white/3 border-white/10 text-gray-400 hover:border-cyan-500/30 hover:text-cyan-400 hover:bg-cyan-500/5"
        >
          {testing
            ? <Loader className="w-3 h-3 animate-spin" />
            : <Zap className="w-3 h-3" />}
          Test Connection
        </button>

        {/* Reset Defaults */}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors
            bg-white/3 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>

        {/* Save Settings */}
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border transition-colors
            bg-cyan-500/15 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/25"
        >
          <Save className="w-3 h-3" />
          Save Settings
        </button>
      </div>
    </div>
  );
};
