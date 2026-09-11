import React from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';

interface QuickAiDockProps {
  onOpen: () => void;
}

export const QuickAiDock: React.FC<QuickAiDockProps> = ({ onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label="Open Quick AI"
    title="Quick AI"
    className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-[70] inline-flex items-center gap-2 rounded-full border border-accent bg-surface-card/95 backdrop-blur-xl shadow-2xl px-3.5 py-3 text-primary hover:bg-surface-raised hover:border-strong transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  >
    <span className="relative w-8 h-8 rounded-full bg-accent-soft border border-accent flex items-center justify-center shrink-0">
      <MessageSquareText className="w-4 h-4 text-accent" />
      <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-accent" />
    </span>
    <span className="hidden sm:block pr-1 text-sm font-semibold">Quick AI</span>
  </button>
);