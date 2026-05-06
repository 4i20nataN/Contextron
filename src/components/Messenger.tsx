import React from 'react';
import { Send, Loader2, BrainCircuit, MessageSquare, Terminal, Zap, StopCircle, Lock } from 'lucide-react';
import Markdown from 'react-markdown';
import { Message, Document, Batch } from '../types';
import { ContextAuditPanel } from './ContextAuditPanel';

interface Step {
  id: string;
  label: string;
  shortLabel: string;
}

interface MessengerProps {
  messages: Message[];
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onAbort?: () => void;
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  statusMessage?: string;
  steps: Step[];
  activeStep: string;
  onStepClick: (stepId: string) => void;
  hasDocuments: boolean;
  documents: Document[];
  selectedDocuments?: Document[];
  batches: Batch[];
  modelName: string;
}

export const Messenger: React.FC<MessengerProps> = ({
  messages,
  inputValue,
  onInputChange,
  onSend,
  onAbort,
  isLoading,
  messagesEndRef,
  statusMessage,
  steps,
  activeStep,
  onStepClick,
  hasDocuments,
  documents,
  selectedDocuments,
  batches,
  modelName,
}) => {
  const stepColors: Record<string, { active: string; inactive: string; dot: string; locked: string }> = {
    "01": {
      active: 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300',
      inactive: 'bg-white/3 border-white/8 text-slate-500 hover:border-white/20 hover:text-slate-300',
      locked: 'bg-white/[0.02] border-white/5 text-slate-700 cursor-not-allowed',
      dot: 'bg-cyan-500'
    },
    "02": {
      active: 'bg-purple-500/15 border-purple-500/50 text-purple-300',
      inactive: 'bg-white/3 border-white/8 text-slate-500 hover:border-white/20 hover:text-slate-300',
      locked: 'bg-white/[0.02] border-white/5 text-slate-700 cursor-not-allowed',
      dot: 'bg-purple-500'
    },
    "03": {
      active: 'bg-amber-500/15 border-amber-500/50 text-amber-300',
      inactive: 'bg-white/3 border-white/8 text-slate-500 hover:border-white/20 hover:text-slate-300',
      locked: 'bg-white/[0.02] border-white/5 text-slate-700 cursor-not-allowed',
      dot: 'bg-amber-500'
    },
    "04": {
      active: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300',
      inactive: 'bg-white/3 border-white/8 text-slate-500 hover:border-white/20 hover:text-slate-300',
      locked: 'bg-white/[0.02] border-white/5 text-slate-700 cursor-not-allowed',
      dot: 'bg-emerald-500'
    }
  };

  // Phase accessibility — previous phases NEVER blocked after advancing
  const hasBatches = batches.length > 0;
  const hasAnyPlan = batches.some(b => b.planMd && b.planMd.trim().length > 0);
  const hasAnyDecision = batches.some(b => b.decisions && b.decisions.length > 0);

  function isStepLocked(stepId: string): boolean {
    if (!hasDocuments) return true;
    if (stepId === "01") return false; // always unlocked if has docs
    if (stepId === "02") return !hasBatches;
    if (stepId === "03") return !hasAnyPlan;
    if (stepId === "04") return !hasAnyDecision;
    return false;
  }

  function getStepLockReason(stepId: string): string {
    if (!hasDocuments) return "Carregue arquivos primeiro";
    if (stepId === "02") return "Execute a Fase 1 — Análise primeiro";
    if (stepId === "03") return "Execute a Fase 2 — Planejamento primeiro";
    if (stepId === "04") return "Execute a Fase 3 — Decisão primeiro";
    return "";
  }

  return (
    <section className="flex-1 min-w-0 min-h-[500px] lg:min-h-0 bg-[#0b0e14] border border-white/5 rounded-2xl flex flex-col relative overflow-hidden backdrop-blur-sm">
      {/* Terminal Header */}
      <div className="absolute top-0 inset-x-0 h-12 flex items-center justify-between px-6 border-b border-white/5 bg-white/5 z-20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Auditor Terminal Matrix</span>
        </div>
        <div className="flex items-center gap-3">
          {isLoading && onAbort && (
            <button
              onClick={onAbort}
              title="Interromper operação atual"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300 transition-all text-[9px] font-black uppercase tracking-widest"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Interromper</span>
            </button>
          )}
          <div className="flex gap-1">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
            <div className="w-2 h-2 rounded-full bg-slate-700" />
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6 scroll-smooth custom-scrollbar mt-12">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mb-6 relative">
              <div className="absolute inset-0 rounded-full bg-cyan-500/10 blur-xl animate-pulse" />
              <BrainCircuit className="w-8 h-8 text-cyan-400 relative z-10" />
            </div>
            <h3 className="text-xl font-black italic tracking-widest text-slate-200 mb-2">PIPELINE REFATORAÇÃO V4</h3>
            <p className="text-[10px] uppercase tracking-[0.5em] text-slate-500 max-w-xs leading-loose font-mono">
              Mapeamento granular linha-a-linha para conversão estrutural. Enriquecimento de lógica profunda para contextos de rede neural.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  {msg.role === 'model' ? (
                    <>
                      <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center">
                        <BrainCircuit className="w-2.5 h-2.5 text-cyan-400" />
                      </div>
                      <span className="text-[8px] font-bold font-mono text-slate-500 uppercase tracking-widest">EngineMatrix</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[8px] font-bold font-mono text-slate-500 uppercase tracking-widest">Operator</span>
                      <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      </div>
                    </>
                  )}
                  <span className="text-[8px] font-mono text-slate-600">{msg.timestamp || ''}</span>
                </div>
                <div className={`max-w-[90%] p-4 rounded-2xl text-[11px] font-mono leading-relaxed border ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-100 rounded-tr-none shadow-lg shadow-cyan-500/5'
                    : 'bg-white/5 border-white/10 text-slate-300 rounded-tl-none'
                }`}>
                  <Markdown>{msg.content}</Markdown>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex flex-col items-start animate-in fade-in duration-500">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />
                  <span className="text-[8px] font-bold font-mono text-cyan-500 uppercase tracking-widest">{statusMessage || 'Analisando...'}</span>
                </div>
                <div className="max-w-[90%] w-[300px] bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-4 flex flex-col gap-3">
                  <div className="h-2 w-full bg-white/5 rounded animate-pulse" />
                  <div className="h-2 w-3/4 bg-white/5 rounded animate-pulse delay-100" />
                  <div className="h-2 w-1/2 bg-white/5 rounded animate-pulse delay-200" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Step Buttons */}
      <div className="px-4 pt-3 pb-0 border-t border-white/5 bg-black/20 shrink-0">
        <div className="flex gap-2">
          {steps.map((step) => {
            const colors = stepColors[step.id] || stepColors["01"];
            const isActive = activeStep === step.id;
            const locked = isStepLocked(step.id);
            const lockReason = getStepLockReason(step.id);
            const disabledAll = isLoading || locked;

            return (
              <div key={step.id} className="flex-1 relative group">
                <button
                  onClick={() => !disabledAll && onStepClick(step.id)}
                  disabled={disabledAll}
                  title={locked && !isLoading ? lockReason : undefined}
                  className={`w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all relative overflow-hidden ${
                    isLoading
                      ? 'opacity-30 cursor-not-allowed ' + (isActive ? colors.active : colors.inactive)
                      : locked
                      ? colors.locked
                      : isActive
                      ? colors.active
                      : colors.inactive
                  }`}
                >
                  {locked && !isLoading
                    ? <Lock className="w-2.5 h-2.5 shrink-0 opacity-50" />
                    : isActive
                    ? <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} />
                    : null
                  }
                  <Zap className={`w-3 h-3 shrink-0 ${isActive && !locked ? '' : 'opacity-30'}`} />
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                  {isActive && !locked && !isLoading && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-current opacity-30 animate-pulse" />
                  )}
                </button>
                {/* Tooltip for locked steps */}
                {locked && !isLoading && lockReason && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-[#0b0e14] border border-white/10 rounded-lg text-[8px] font-mono text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl">
                    🔒 {lockReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Context Audit Panel */}
      <ContextAuditPanel
        activeStep={activeStep}
        documents={documents}
        selectedDocuments={selectedDocuments}
        batches={batches}
        modelName={modelName}
      />

      {/* Input Area */}
      <div className="p-4 bg-white/5 border-t border-white/5 backdrop-blur-xl shrink-0">
        <div className="relative group">
          <input
            type="text"
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Comandar auditoria exaustiva..."
            className="w-full bg-black/40 border border-white/10 rounded-xl px-12 py-4 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all font-mono shadow-inner group-focus-within:bg-black/60"
          />
          <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-cyan-400 transition-colors" />
          <button
            onClick={onSend}
            disabled={isLoading || !inputValue.trim()}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-white flex items-center justify-center transition-all disabled:opacity-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
