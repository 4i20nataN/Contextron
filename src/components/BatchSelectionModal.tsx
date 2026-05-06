import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Layers, CheckSquare, Square } from 'lucide-react';
import { Batch } from '../types';
import { SEVERITY_DATA } from './Registry';

interface BatchSelectionModalProps {
  batches: Batch[];
  targetStep: string;
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}

const PHASE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  "02": { label: "FASE 2 — PLANEJAMENTO", color: "text-purple-300", desc: "Escolha quais lotes receberão plano de refatoração." },
  "03": { label: "FASE 3 — DECISÃO",       color: "text-amber-300",  desc: "Escolha quais lotes passarão pela análise de decisões." },
  "04": { label: "FASE 4 — EXECUÇÃO",      color: "text-emerald-300",desc: "Escolha quais lotes serão executados e refatorados." },
};

function getSev(severity?: string) {
  if (!severity) return SEVERITY_DATA.info;
  const lower = severity.toLowerCase();
  if (lower === 'super_critical' || lower.includes('super cr')) return SEVERITY_DATA.super_critical;
  if (lower === 'critical' || lower.includes('crítico') || lower.includes('critico')) return SEVERITY_DATA.critical;
  if (lower === 'high' || lower.includes('alto')) return SEVERITY_DATA.high;
  if (lower === 'medium' || lower.includes('médio') || lower.includes('medio')) return SEVERITY_DATA.medium;
  if (lower === 'low' || lower.includes('baixo')) return SEVERITY_DATA.low;
  if (lower === 'verde') return SEVERITY_DATA.verde;
  if (lower === 'cinza') return SEVERITY_DATA.cinza;
  return SEVERITY_DATA.info;
}

export const BatchSelectionModal: React.FC<BatchSelectionModalProps> = ({
  batches,
  targetStep,
  onConfirm,
  onCancel,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(batches.map(b => b.id))
  );

  const phase = PHASE_LABELS[targetStep] || { label: `FASE ${targetStep}`, color: 'text-slate-300', desc: '' };
  const allSelected = selectedIds.size === batches.length;

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(batches.map(b => b.id)));
  };

  const handleConfirm = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onConfirm(ids);
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-[#02040a]/92 backdrop-blur-md">
      <div className="bg-[#0b0e14] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-slate-300" />
            </div>
            <div>
              <h2 className={`text-[11px] font-black uppercase tracking-widest ${phase.color}`}>
                {phase.label}
              </h2>
              <p className="text-[9px] text-slate-500 font-mono mt-0.5">{phase.desc}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Select all + count */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-black/20">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-[9px] font-mono text-slate-400 hover:text-slate-200 transition-colors"
          >
            {allSelected
              ? <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
              : <Square className="w-3.5 h-3.5 text-slate-500" />
            }
            {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
          <span className="text-[9px] font-mono text-slate-500">
            {selectedIds.size}/{batches.length} lotes
          </span>
        </div>

        {/* Batch list */}
        <div className="flex flex-col gap-1.5 p-4 max-h-[360px] overflow-y-auto custom-scrollbar">
          {batches.map(batch => {
            const sev = getSev(batch.severity);
            const selected = selectedIds.has(batch.id);
            return (
              <label
                key={batch.id}
                onClick={() => toggle(batch.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:brightness-110 ${
                  selected
                    ? `${sev.bg} ${sev.border}`
                    : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {}}
                  className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer shrink-0"
                />
                <span className="text-sm shrink-0">{sev.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black font-mono ${selected ? sev.color : 'text-slate-500'}`}>
                      LOTE {batch.id}
                    </span>
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                      selected ? `${sev.bg} ${sev.color} ${sev.border}` : 'bg-white/5 text-slate-600 border-white/5'
                    }`}>
                      {sev.label}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono truncate mt-0.5">
                    {batch.description || '—'} · {batch.files.length} arq
                  </p>
                </div>
                {/* Phase status badges */}
                <div className="flex gap-1 shrink-0">
                  {batch.analysisMd && <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">F1</span>}
                  {batch.planMd && <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">F2</span>}
                  {batch.decisions && batch.decisions.length > 0 && <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">F3</span>}
                  {batch.executionMd && <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">F4</span>}
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-white/5 bg-black/10">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className={`flex-1 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              targetStep === "02" ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30' :
              targetStep === "03" ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30' :
              'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            Executar {selectedIds.size} lote{selectedIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
