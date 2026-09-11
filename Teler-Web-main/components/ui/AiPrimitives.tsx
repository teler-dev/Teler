import React from 'react';
import { Send, Sparkles } from 'lucide-react';
import { AiSource } from '../../services/aiAgentHandler';
import { Button } from './Button';
import { Textarea } from './FormControls';

export const AiSourceCard: React.FC<{ source: AiSource; onEmployee?: () => void; onSession?: () => void }> = ({ source, onEmployee, onSession }) => (
  <div className="p-3 rounded-xl border border-subtle bg-surface-raised">
    <div className="flex flex-wrap gap-2 items-center justify-between">
      {onEmployee ? <button type="button" onClick={onEmployee} className="text-sm font-semibold text-accent hover:underline">{source.employee}</button> : <p className="text-sm font-semibold text-primary truncate">{source.employee}</p>}
      {onSession ? <button type="button" onClick={onSession} className="text-xs text-secondary hover:text-primary">Open session</button> : <span className="text-xs text-secondary">Supporting session</span>}
    </div>
    <p className="text-xs text-secondary mt-1">{source.timeRange}</p>
    <div className="flex flex-wrap gap-1.5 mt-2">
      {source.metrics.map(metric => <span key={metric} className="text-[11px] px-2 py-1 rounded-md bg-surface-card border border-subtle text-secondary">{metric}</span>)}
    </div>
    <p className="text-[11px] text-secondary mt-2">{source.confidence}% confidence</p>
  </div>
);

export const AiEmptyState: React.FC<{ title?: string; description?: string; children?: React.ReactNode }> = ({
  title = 'Ask with evidence',
  description = 'TELER AI will cite the employee, session, metrics and time range used for its answer.',
  children,
}) => (
  <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-4">
    <div className="w-11 h-11 rounded-2xl border border-accent bg-accent-soft flex items-center justify-center">
      <Sparkles className="w-5 h-5 text-accent" />
    </div>
    <h2 className="font-semibold mt-4">{title}</h2>
    <p className="text-sm text-secondary max-w-md mt-2">{description}</p>
    {children}
  </div>
);

interface AiComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  disabled?: boolean;
  placeholder?: string;
  leadingAction?: React.ReactNode;
  compact?: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

export const AiComposer: React.FC<AiComposerProps> = ({
  value,
  onChange,
  onSend,
  onKeyDown,
  disabled = false,
  placeholder = "Ask about your team's productivity…",
  leadingAction,
  compact = false,
  inputRef,
}) => (
  <div className={compact ? 'bg-transparent border-0 p-0 shadow-none' : 'bg-surface-card border border-subtle rounded-2xl p-3 md:p-4 shadow-card'}>
    <Textarea
      ref={inputRef}
      value={value}
      onChange={event => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      aria-label="Ask TELER AI"
      placeholder={placeholder}
      rows={compact ? 1 : 3}
      disabled={disabled}
      className={compact ? 'min-h-10 bg-surface-input' : 'min-h-20 border-0 bg-transparent px-1 py-1 focus:border-transparent'}
    />
    <div className="flex items-center justify-between gap-3 mt-2">
      <div>{leadingAction}</div>
      <Button
        size="sm"
        variant={compact ? 'accentSoft' : 'primary'}
        onClick={onSend}
        disabled={!value.trim() || disabled}
        aria-label="Send to TELER AI"
        className={compact ? 'w-10 px-0' : undefined}
      >
        <Send className="w-4 h-4" />
        {!compact && 'Send'}
      </Button>
    </div>
  </div>
);