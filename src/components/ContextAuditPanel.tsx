import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, FileText, FileX, AlertTriangle, CheckCircle, Zap, Eye } from 'lucide-react';
import { Document, Batch } from '../types';

interface ContextAuditPanelProps {
  activeStep: string;
  documents: Document[];
  selectedDocuments?: Document[];
  batches: Batch[];
  modelName: string;
}

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gemini-2.5-pro-preview-05-06':   1_048_576,
  'gemini-2.5-flash-preview-05-20': 1_048_576,
  'gemini-2.0-flash':               1_048_576,
  'gemini-2.0-flash-exp':           1_048_576,
  'gemini-1.5-pro':                 2_097_152,
  'gemini-1.5-flash':               1_048_576,
};

function getModelLimit(modelName: string | undefined): number {
  if (!modelName) return 1_000_000;
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (modelName.toLowerCase().includes(key.toLowerCase().split('-').slice(0, 3).join('-'))) {
      return limit;
    }
  }
  return 1_000_000;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatSize(chars: number): string {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)}MB`;
  if (chars >= 1_000) return `${(chars / 1_000).toFixed(0)}KB`;
  return `${chars}B`;
}

export const ContextAuditPanel: React.FC<ContextAuditPanelProps> = ({
  activeStep,
  documents,
  selectedDocuments,
  batches,
  modelName,
}) => {
  const [expanded, setExpanded] = useState(false);

  const audit = useMemo(() => {
    const modelLimit = getModelLimit(modelName);

    if (activeStep === "01") {
      // Use selectedDocuments if provided (file tree selection), otherwise all documents
      const effectiveDocs = selectedDocuments && selectedDocuments.length > 0
        ? selectedDocuments
        : documents;
      const omittedDocs = selectedDocuments && selectedDocuments.length > 0
        ? documents.filter(d => !selectedDocuments.find(s => s.id === d.id))
        : [];

      const contextChars = effectiveDocs.reduce((acc, d) => acc + d.content.length + d.name.length + 60, 0);
      const tokens = Math.round(contextChars / 4);
      const pct = (tokens / modelLimit) * 100;

      const selectionNote = selectedDocuments && selectedDocuments.length < documents.length
        ? `${selectedDocuments.length}/${documents.length} selecionados`
        : `${documents.length} arquivo(s)`;

      return {
        phase: "01",
        label: "Fase 1 — Análise",
        contextChars,
        tokens,
        pct,
        modelLimit,
        includedFiles: effectiveDocs.map(d => ({ name: d.name, size: d.size })),
        excludedFiles: omittedDocs.map(d => ({ name: d.name, size: d.size })),
        contextSummary: selectionNote,
        note: effectiveDocs.length === 0 ? "Nenhum arquivo selecionado." : null as string | null,
      };
    }

    if (activeStep === "02") {
      const phase1Data = {
        phase: 1,
        totalArquivos: batches.reduce((acc, b) => acc + b.files.length, 0),
        lotes: batches.map(b => ({
          id: b.id, gravidade: b.severity, impacto: b.description,
          arquivos: b.files, analise: b.analysisMd || ''
        }))
      };
      const jsonStr = JSON.stringify(phase1Data, null, 2);
      const contextChars = jsonStr.length + 40;
      const tokens = Math.round(contextChars / 4);
      const pct = (tokens / modelLimit) * 100;
      const excluded = documents.map(d => ({ name: d.name, size: d.size }));

      return {
        phase: "02",
        label: "Fase 2 — Planejamento",
        contextChars,
        tokens,
        pct,
        modelLimit,
        includedFiles: [{ name: `[FASE_1_JSON] — ${batches.length} lotes, ${formatSize(jsonStr.length)}`, size: jsonStr.length }],
        excludedFiles: excluded,
        contextSummary: `JSON F1 (${batches.length} lote(s)) — ${documents.length} arq. omitido(s)`,
        note: batches.length === 0 ? "Execute a Fase 1 primeiro." : null as string | null,
      };
    }

    if (activeStep === "03") {
      // Fase 3: only F2 JSON — no files
      const phase2Data = {
        phase: 2,
        lotes: batches.map(b => ({
          id: b.id, gravidade: b.severity, objetivo: b.description,
          plano: b.planMd || ''
        }))
      };
      const jsonStr = JSON.stringify(phase2Data, null, 2);
      const contextChars = jsonStr.length + 40;
      const tokens = Math.round(contextChars / 4);
      const pct = (tokens / modelLimit) * 100;
      const hasPlans = batches.some(b => b.planMd && b.planMd.trim().length > 0);

      return {
        phase: "03",
        label: "Fase 3 — Decisão",
        contextChars,
        tokens,
        pct,
        modelLimit,
        includedFiles: [{ name: `[FASE_2_JSON] — ${batches.length} plano(s), ${formatSize(jsonStr.length)}`, size: jsonStr.length }],
        excludedFiles: documents.map(d => ({ name: d.name, size: d.size })),
        contextSummary: `JSON F2 isolado — ${documents.length} arq. originais OMITIDOS`,
        note: !hasPlans && batches.length > 0 ? "Nenhum plano detectado. Execute a Fase 2 primeiro." : null as string | null,
      };
    }

    if (activeStep === "04") {
      // Fase 4: F2 + F3 JSON + relevant files
      const relevantPaths = new Set(batches.flatMap(b => b.files));
      const relevantDocs = documents.filter(d => relevantPaths.has(d.name));
      const excludedDocs = documents.filter(d => !relevantPaths.has(d.name));

      const f2JsonSize = JSON.stringify({ phase: 2, lotes: batches.map(b => ({ id: b.id, plano: b.planMd || '' })) }, null, 2).length;
      const f3JsonSize = JSON.stringify({ phase: 3, lotes: batches.map(b => ({ id: b.id, decisoes: b.decisions || [] })) }, null, 2).length;
      const filesChars = relevantDocs.reduce((acc, d) => acc + d.content.length + d.name.length + 60, 0);
      const contextChars = f2JsonSize + f3JsonSize + filesChars + 80;
      const tokens = Math.round(contextChars / 4);
      const pct = (tokens / modelLimit) * 100;

      return {
        phase: "04",
        label: "Fase 4 — Execução",
        contextChars,
        tokens,
        pct,
        modelLimit,
        includedFiles: [
          { name: `[FASE_2_JSON] — planos, ${formatSize(f2JsonSize)}`, size: f2JsonSize },
          { name: `[FASE_3_JSON] — decisões, ${formatSize(f3JsonSize)}`, size: f3JsonSize },
          ...relevantDocs.map(d => ({ name: d.name, size: d.size }))
        ],
        excludedFiles: excludedDocs.map(d => ({ name: d.name, size: d.size })),
        contextSummary: `F2+F3 JSON + ${relevantDocs.length}/${documents.length} arq. relevantes`,
        note: null as string | null,
      };
    }

    return null;
  }, [activeStep, documents, selectedDocuments, batches, modelName]);

  if (!audit || (documents.length === 0 && batches.length === 0)) return null;

  const pct = audit.pct;
  const statusColor = pct > 80
    ? { bar: 'bg-red-500', text: 'text-red-400', badge: 'bg-red-500/15 border-red-500/40', icon: 'text-red-400' }
    : pct > 50
    ? { bar: 'bg-amber-500', text: 'text-amber-400', badge: 'bg-amber-500/15 border-amber-500/40', icon: 'text-amber-400' }
    : { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/15 border-emerald-500/40', icon: 'text-emerald-400' };

  const phaseAccent: Record<string, string> = {
    "01": "text-cyan-400",
    "02": "text-purple-400",
    "03": "text-amber-400",
    "04": "text-emerald-400",
  };

  return (
    <div className="mx-4 mb-0 mt-2 rounded-xl border border-white/[0.07] bg-black/30 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <Eye className={`w-3 h-3 shrink-0 ${phaseAccent[activeStep] || 'text-slate-400'}`} />
        <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${phaseAccent[activeStep] || 'text-slate-400'}`}>
          Contexto
        </span>
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${statusColor.bar}`}
            style={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
          />
        </div>
        <div className={`flex items-center gap-1.5 shrink-0 border rounded-md px-2 py-0.5 ${statusColor.badge}`}>
          <Zap className={`w-2.5 h-2.5 ${statusColor.icon}`} />
          <span className={`text-[9px] font-black font-mono ${statusColor.text}`}>
            ~{formatTokens(audit.tokens)}
          </span>
          <span className="text-[8px] text-slate-500 font-mono">
            {pct.toFixed(0)}%
          </span>
        </div>
        <span className="text-[8px] text-slate-500 font-mono truncate max-w-[160px] hidden sm:block">
          {audit.contextSummary}
        </span>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-slate-600 shrink-0" />
          : <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 py-3 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-200">
          {audit.note && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[9px] text-amber-300 font-mono">{audit.note}</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Tokens est.', value: formatTokens(audit.tokens), color: statusColor.text },
              { label: 'Limite', value: formatTokens(audit.modelLimit), color: 'text-slate-400' },
              { label: 'Uso', value: `${pct.toFixed(1)}%`, color: statusColor.text },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/5 rounded-lg px-2 py-1.5 text-center border border-white/5">
                <p className="text-[8px] text-slate-500 uppercase tracking-widest">{label}</p>
                <p className={`text-[11px] font-black font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          {audit.includedFiles.length > 0 && (
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <FileText className="w-2.5 h-2.5 text-emerald-500" />
                Incluídos ({audit.includedFiles.length})
              </p>
              <div className="max-h-[100px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                {audit.includedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-2 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10">
                    <span className="text-[8px] font-mono text-emerald-300/70 truncate">{f.name}</span>
                    <span className="text-[7px] font-mono text-slate-500 shrink-0">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {audit.excludedFiles.length > 0 && (
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <FileX className="w-2.5 h-2.5 text-slate-500" />
                Omitidos ({audit.excludedFiles.length})
              </p>
              <div className="max-h-[80px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                {audit.excludedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-2 py-0.5 rounded bg-white/[0.02] border border-white/5">
                    <span className="text-[8px] font-mono text-slate-600 truncate">{f.name}</span>
                    <span className="text-[7px] font-mono text-slate-700 shrink-0">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[8px] font-mono text-slate-600 text-right">
            bruto: {formatSize(audit.contextChars)} · modelo: {modelName}
          </p>
        </div>
      )}
    </div>
  );
};
