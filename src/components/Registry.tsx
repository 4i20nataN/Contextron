import React, { useState, useMemo, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  Grid2X2, CheckCircle2, X, Info, Bug, Code, CircleDot, Activity,
  AlertTriangle, FileCheck, FileX, Eye, RotateCcw, RefreshCw,
  Filter, Maximize2, FileCode, Zap, ChevronDown, Monitor,
  Hash, Database, Terminal
} from 'lucide-react';
import Markdown from 'react-markdown';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { Batch, CorrectedFile, Document } from '../types';

interface RegistryProps {
  lotes: Batch[];
  correctedFiles: CorrectedFile[];
  originalFiles: Document[];
  activeStep: string;
  uncoveredFiles: Document[];
  totalDocuments: number;
  onDecisionChoice?: (batchId: string, decisionId: string, choice: string) => void;
  onReloadBatch?: (batchId: string) => void;
  onRedecideBatch?: (batchId: string) => void;
  streamingText?: string;
  isStreaming?: boolean;
  provider?: string;
  model?: string;
}

export const SEVERITY_DATA: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  super_critical: { icon: '🟣', label: 'SUPER CRÍTICO', color: 'text-purple-300',  bg: 'bg-purple-500/10',  border: 'border-purple-500/40' },
  critical:       { icon: '🔴', label: 'CRÍTICO',       color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
  high:           { icon: '🟠', label: 'ALTO',          color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  medium:         { icon: '🟡', label: 'MÉDIO',         color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30' },
  low:            { icon: '🟢', label: 'BAIXO',         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  info:           { icon: '🟢', label: 'OK',            color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  verde:          { icon: '✅', label: 'ARQUIVO OK',    color: 'text-emerald-300', bg: 'bg-emerald-500/5',  border: 'border-emerald-500/20' },
  cinza:          { icon: '⬛', label: 'SEM NEXO',      color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20' },
};

export const DECISION_OPTION_COLORS: Record<string, string> = {
  SIM:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
  NÃO:      'bg-[#1f2937]/80 text-slate-400 border-slate-600/40 hover:bg-slate-700/60',
  NAO:      'bg-[#1f2937]/80 text-slate-400 border-slate-600/40 hover:bg-slate-700/60',
  MANTER:   'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20',
  DUPLICAR: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20',
};

function getDecisionColor(opt: string): string {
  return DECISION_OPTION_COLORS[opt.toUpperCase()] || 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10';
}

const DETAIL_TABS = [
  { id: "01", label: "Análise",  shortLabel: "F1", activeColor: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300" },
  { id: "02", label: "Plano",    shortLabel: "F2", activeColor: "bg-purple-500/10 border-purple-500/30 text-purple-300" },
  { id: "03", label: "Decisões", shortLabel: "F3", activeColor: "bg-amber-500/10 border-amber-500/30 text-amber-300" },
  { id: "04", label: "Execução", shortLabel: "F4", activeColor: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" },
];

function hasBatchDataForTab(batch: Batch, tabId: string): boolean {
  if (tabId === "01") return !!(batch.analysisMd || batch.description);
  if (tabId === "02") return !!batch.planMd;
  if (tabId === "03") return !!(batch.decisions && batch.decisions.length > 0);
  if (tabId === "04") return !!batch.executionMd;
  return false;
}

function defaultTab(batch: Batch, preferStep: string): string {
  if (hasBatchDataForTab(batch, preferStep)) return preferStep;
  for (const t of ["04", "03", "02", "01"]) {
    if (hasBatchDataForTab(batch, t)) return t;
  }
  return "01";
}

const NAV_GROUPS_CONFIG = [
  { phaseId: "04", label: "F4 — EXECUÇÃO",     color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/8', dot: 'bg-emerald-500', filter: (b: Batch) => !!b.executionMd },
  { phaseId: "03", label: "F3 — DECISÃO",       color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/5',   dot: 'bg-amber-500',   filter: (b: Batch) => !!(b.decisions && b.decisions.length > 0) },
  { phaseId: "02", label: "F2 — PLANEJAMENTO",  color: 'text-purple-400',  border: 'border-purple-500/30',  bg: 'bg-purple-500/5',  dot: 'bg-purple-500',  filter: (b: Batch) => !!b.planMd },
  { phaseId: "01", label: "F1 — ANÁLISE",       color: 'text-cyan-400',    border: 'border-cyan-500/30',    bg: 'bg-cyan-500/5',    dot: 'bg-cyan-500',    filter: (_b: Batch) => true },
];

const LOTES_PHASE_TABS = [
  { id: 'all', label: 'Todos', color: 'text-slate-300',   activeBg: 'bg-white/10 border-white/20 text-slate-200' },
  { id: '04',  label: 'F4',   color: 'text-emerald-400', activeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  { id: '03',  label: 'F3',   color: 'text-amber-400',   activeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  { id: '02',  label: 'F2',   color: 'text-purple-400',  activeBg: 'bg-purple-500/15 border-purple-500/30 text-purple-300' },
  { id: '01',  label: 'F1',   color: 'text-cyan-400',    activeBg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' },
];

function getBatchColorByFilter(batch: Batch, filterMode: string, allBatches: Batch[], getSeverityFn: (s?: string) => typeof SEVERITY_DATA[string]): typeof SEVERITY_DATA[string] {
  switch (filterMode) {
    case 'filecount': {
      const max = Math.max(...allBatches.map(b => b.files.length), 1);
      const ratio = batch.files.length / max;
      if (ratio > 0.65) return SEVERITY_DATA.critical;
      if (ratio > 0.4)  return SEVERITY_DATA.high;
      if (ratio > 0.2)  return SEVERITY_DATA.medium;
      return SEVERITY_DATA.low;
    }
    case 'decisions': {
      const pending = (batch.decisions || []).filter(d => !d.resolved).length;
      const total   = (batch.decisions || []).length;
      if (pending > 2) return SEVERITY_DATA.critical;
      if (pending > 0) return SEVERITY_DATA.high;
      if (total > 0)   return SEVERITY_DATA.verde;
      return SEVERITY_DATA.cinza;
    }
    case 'supplemental':
      return batch.isSupplemental ? SEVERITY_DATA.high : SEVERITY_DATA.cinza;
    default:
      return getSeverityFn(batch.severity);
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

type ModalSize = 'md' | 'lg' | 'xl' | 'full';
const MODAL_SIZES: Record<ModalSize, string> = {
  md:   'max-w-3xl max-h-[80vh]',
  lg:   'max-w-5xl max-h-[88vh]',
  xl:   'max-w-7xl max-h-[94vh]',
  full: 'w-[98vw] h-[98vh] max-w-none max-h-none',
};

const SizePresets: React.FC<{ current: ModalSize; onChange: (s: ModalSize) => void }> = ({ current, onChange }) => (
  <div className="hidden sm:flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/5">
    {(['md','lg','xl','full'] as ModalSize[]).map(s => (
      <button key={s} onClick={() => onChange(s)} title={s.toUpperCase()}
        className={`px-2 py-1 text-[7px] font-black rounded transition-all ${current === s ? 'bg-white/10 text-slate-200' : 'text-slate-600 hover:text-slate-300'}`}>
        {s === 'full' ? '⛶' : s.toUpperCase()}
      </button>
    ))}
  </div>
);

const TELEMETRY_TABS = [
  { id: "01", label: "F1", activeBg: "bg-cyan-500/15 border-cyan-500/30",    activeText: "text-cyan-300" },
  { id: "02", label: "F2", activeBg: "bg-purple-500/15 border-purple-500/30", activeText: "text-purple-300" },
  { id: "03", label: "F3", activeBg: "bg-amber-500/15 border-amber-500/30",  activeText: "text-amber-300" },
  { id: "04", label: "F4", activeBg: "bg-emerald-500/15 border-emerald-500/30", activeText: "text-emerald-300" },
];

function parseStreamingMeta(text: string) {
  const loteIds   = [...new Set((text.match(/"id"\s*:\s*"(\d{1,3})"/g) || []).map(m => m.replace(/.*"(\d+)"/, '$1')))].slice(0, 8);
  const filePaths = [...new Set((text.match(/"path"\s*:\s*"([^"]{3,80})"/g) || []).map(m => m.replace(/"path"\s*:\s*"([^"]+)"/, '$1')))].slice(-5);
  const tokensOut = Math.round(text.length / 4);
  return { loteIds, filePaths, tokensOut };
}

const StatCard = memo<{ label: string; val: string; color: string }>(({ label, val, color }) => (
  <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
    <p className="text-[7px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">{label}</p>
    <p className={`text-sm font-mono font-black ${color}`}>{val}</p>
  </div>
));

const EmptyTelemetry = memo<{ msg: string }>(({ msg }) => (
  <div className="flex flex-col items-center justify-center py-6 text-center opacity-30">
    <CheckCircle2 className="w-6 h-6 mb-2 text-slate-500" />
    <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400 leading-relaxed">{msg}</p>
  </div>
));

const EmptyTabState = memo<{ icon: React.ReactNode; msg: string; sub: string }>(({ icon, msg, sub }) => (
  <div className="flex flex-col items-center justify-center py-16 opacity-50 gap-3">
    {icon}
    <div className="text-center">
      <p className="text-[11px] font-mono">{msg}</p>
      <p className="text-[9px] text-slate-500 mt-1">{sub}</p>
    </div>
  </div>
));

const CoverageList = memo<{
  title: string; color: 'emerald' | 'yellow'; files: Document[];
  lotes: Batch[]; showLoteBadge?: boolean; showSize?: boolean;
}>(({ title, color, files, lotes, showLoteBadge, showSize }) => {
  const cls = color === 'emerald'
    ? { title: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-300', icon: <FileCheck className="w-2.5 h-2.5 text-emerald-400 shrink-0" />, badge: 'text-emerald-400/60' }
    : { title: 'text-yellow-400',  bg: 'bg-yellow-500/5',  border: 'border-yellow-500/10',  text: 'text-yellow-300',  icon: <FileX className="w-2.5 h-2.5 text-yellow-400 shrink-0" />,   badge: 'text-yellow-400/60' };
  return (
    <div>
      <h3 className={`text-[9px] font-black uppercase tracking-widest ${cls.title} mb-2.5 flex items-center gap-2`}>{cls.icon} {title}</h3>
      <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
        {files.map((doc, i) => {
          const lote = showLoteBadge ? lotes.find(b => b.files.includes(doc.name)) : null;
          return (
            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${cls.bg} border ${cls.border}`}>
              {cls.icon}
              <span className={`text-[9px] font-mono ${cls.text} truncate flex-1`}>{doc.name}</span>
              {lote && <span className={`text-[7px] font-mono ${cls.badge} shrink-0`}>#{lote.id}</span>}
              {showSize && <span className={`text-[7px] font-mono ${cls.badge} shrink-0`}>{(doc.size / 1024).toFixed(1)}KB</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const FilesColumn: React.FC<{
  batch: Batch;
  getCorrectedContent: (f: string) => string;
  getOriginalContent: (f: string) => string;
  showDiff: boolean;
  windowWidth: number;
  onViewFile?: (name: string, content: string) => void;
}> = ({ batch, getCorrectedContent, getOriginalContent, showDiff, windowWidth, onViewFile }) => {
  const [activeFile, setActiveFile] = useState<string | null>(() => {
    if (showDiff) {
      const first = batch.files.find(f => !!getCorrectedContent(f));
      return first || batch.files[0] || null;
    }
    return null;
  });

  React.useEffect(() => {
    if (showDiff) {
      const first = batch.files.find(f => !!getCorrectedContent(f));
      setActiveFile(first || batch.files[0] || null);
    }
  }, [batch.id]);

  if (!showDiff) {
    return (
      <div className="bg-[#0f1219] rounded-2xl border border-white/5 flex flex-col h-full min-h-[300px]">
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20 rounded-t-2xl shrink-0">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Code className="w-3.5 h-3.5" /> Elementos ({batch.files.length})
          </span>
          {onViewFile && <span className="text-[7px] font-mono text-slate-600">clique para ver código</span>}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {batch.files.map((file, idx) => {
            const originalContent = getOriginalContent(file);
            return (
              <div key={idx} onClick={() => onViewFile?.(file, originalContent)}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${onViewFile ? 'cursor-pointer bg-black/30 border-white/5 hover:border-cyan-500/30 hover:bg-black/50 group' : 'bg-black/30 border-white/5'}`}>
                <Bug className={`w-3.5 h-3.5 shrink-0 ${onViewFile ? 'text-slate-600 group-hover:text-cyan-400 transition-colors' : 'text-slate-500'}`} />
                <span className="text-[9px] font-mono text-slate-200 truncate flex-1 font-bold">{file}</span>
                {onViewFile && <Eye className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 transition-colors shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const modifiedFiles = batch.files.filter(f => !!getCorrectedContent(f));
  const allFiles = batch.files;
  const selectedFile = activeFile || allFiles[0] || '';
  const hasNewCode = !!getCorrectedContent(selectedFile);

  return (
    <div className="bg-[#0f1219] rounded-2xl border border-white/5 flex flex-col h-full min-h-[350px]">
      <div className="p-4 border-b border-white/5 bg-black/20 rounded-t-2xl shrink-0">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Code className="w-3.5 h-3.5" /> Arquivos do Lote ({allFiles.length})
          {modifiedFiles.length > 0 && (
            <span className="text-[7px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">{modifiedFiles.length} modificado(s)</span>
          )}
        </span>
      </div>
      <div className={`flex-1 flex ${windowWidth > 900 ? 'flex-row' : 'flex-col'} overflow-hidden min-h-0`}>
        <div className={`${windowWidth > 900 ? 'w-52 border-r' : 'border-b h-28'} border-white/5 overflow-y-auto custom-scrollbar bg-black/20 shrink-0`}>
          {allFiles.map(file => {
            const modified = !!getCorrectedContent(file);
            const isActive = file === selectedFile;
            return (
              <button key={file} onClick={() => setActiveFile(file)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-all border-b border-white/[0.03] ${isActive ? 'bg-white/10 border-l-2 border-l-cyan-500' : 'hover:bg-white/5'}`}>
                <Bug className={`w-3 h-3 shrink-0 ${modified ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span className="text-[8px] font-mono truncate flex-1" title={file}>{file.split('/').pop() || file}</span>
                {modified && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-auto min-h-0">
          {!hasNewCode ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40 gap-2 p-6">
              <Code className="w-8 h-8 text-slate-500" />
              <p className="text-[9px] font-mono text-slate-400">{selectedFile.split('/').pop() || selectedFile}</p>
              <p className="text-[8px] text-slate-500">Arquivo mapeado — sem modificações</p>
            </div>
          ) : (
            <div className="text-[10px]">
              <ReactDiffViewer
                oldValue={getOriginalContent(selectedFile)}
                newValue={getCorrectedContent(selectedFile)}
                splitView={windowWidth > 1100}
                hideLineNumbers={false}
                useDarkTheme={true}
                styles={{ variables: { dark: { diffViewerBackground: '#02040a', addedBackground: 'rgba(16,185,129,0.1)', addedColor: '#10b981', removedBackground: 'rgba(239,68,68,0.1)', removedColor: '#ef4444' } } }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Registry: React.FC<RegistryProps> = ({
  lotes, correctedFiles, originalFiles, activeStep, uncoveredFiles, totalDocuments,
  onDecisionChoice, onReloadBatch, onRedecideBatch, streamingText = '', isStreaming = false,
  provider, model,
}) => {
  const [selectedBatch, setSelectedBatch]       = useState<Batch | null>(null);
  const [showCoverage, setShowCoverage]         = useState(false);
  const [detailTab, setDetailTab]               = useState<string>("01");
  const [windowWidth, setWindowWidth]           = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [filterMode, setFilterMode]             = useState<string>('severity');
  const [showFilterMenu, setShowFilterMenu]     = useState(false);
  const [viewingFile, setViewingFile]           = useState<{ name: string; content: string } | null>(null);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [telemetryPhaseTab, setTelemetryPhaseTab]   = useState<string>(activeStep);
  const [showLotesPopover, setShowLotesPopover] = useState(false);
  const [lotesPhaseFilter, setLotesPhaseFilter] = useState<string>('all');

  // Separate modal sizes per modal — no more sharing
  const [batchDetailSize, setBatchDetailSize]   = useState<ModalSize>('xl');
  const [fileViewerSize, setFileViewerSize]     = useState<ModalSize>('lg');
  const [telemetrySize, setTelemetrySize]       = useState<ModalSize>('lg');
  const [lotesSize, setLotesSize]               = useState<ModalSize>('xl');
  const [coverageSize, setCoverageSize]         = useState<ModalSize>('md');

  React.useEffect(() => {
    const fn = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  React.useEffect(() => {
    if (selectedBatch) {
      const updated = lotes.find(l => l.id === selectedBatch.id);
      if (updated) setSelectedBatch(updated);
    }
  }, [lotes]);

  React.useEffect(() => {
    if (selectedBatch) setDetailTab(defaultTab(selectedBatch, activeStep));
  }, [selectedBatch?.id, activeStep]);

  React.useEffect(() => {
    setTelemetryPhaseTab(activeStep);
  }, [activeStep]);

  const getOriginalContent  = useCallback((f: string) => originalFiles.find(d => d.name === f)?.content || '', [originalFiles]);
  const getCorrectedContent = useCallback((f: string) => correctedFiles.find(d => d.name === f)?.content || '', [correctedFiles]);

  const getSeverity = useCallback((severity?: string): typeof SEVERITY_DATA[string] => {
    if (!severity) return SEVERITY_DATA.info;
    const l = severity.toLowerCase();
    if (l === 'super_critical' || l.includes('super cr'))                   return SEVERITY_DATA.super_critical;
    if (l === 'critical' || l.includes('crítico') || l.includes('critico')) return SEVERITY_DATA.critical;
    if (l === 'high' || l.includes('alto'))                                  return SEVERITY_DATA.high;
    if (l === 'medium' || l.includes('médio') || l.includes('medio'))       return SEVERITY_DATA.medium;
    if (l === 'low' || l.includes('baixo'))                                  return SEVERITY_DATA.low;
    if (l === 'verde' || l.includes('arquivo ok') || l.includes('file ok'))  return SEVERITY_DATA.verde;
    if (l === 'cinza' || l.includes('sem nexo') || l.includes('irrelevant')) return SEVERITY_DATA.cinza;
    return SEVERITY_DATA.info;
  }, []);

  const metrics = useMemo(() => {
    let oldLines = 0, newLines = 0, sizeBefore = 0, sizeAfter = 0, tokensSaved = 0;
    correctedFiles.forEach(f => {
      const oldC = getOriginalContent(f.name);
      const newC = f.content;
      oldLines    += oldC.split('\n').length;
      newLines    += newC.split('\n').length;
      sizeBefore  += f.originalSize || oldC.length;
      sizeAfter   += newC.length;
      tokensSaved += f.tokensSaved || Math.abs(Math.floor((newC.length - (f.originalSize || oldC.length)) / 4));
    });
    return { count: correctedFiles.length, linesDiff: newLines - oldLines, oldLines, newLines, sizeBefore, sizeAfter, tokensSaved };
  }, [correctedFiles, originalFiles]);

  const phase1Stats = useMemo(() => {
    if (!lotes.length) return null;
    const sevCount: Record<string, number> = {};
    lotes.forEach(b => { const k = b.severity || 'medium'; sevCount[k] = (sevCount[k] || 0) + 1; });
    return { totalLotes: lotes.length, totalFiles: lotes.reduce((a, b) => a + b.files.length, 0), sevCount, supplementalCount: lotes.filter(b => b.isSupplemental).length };
  }, [lotes]);

  const phase2Stats = useMemo(() => {
    const planned = lotes.filter(b => b.planMd).length;
    return { planned, total: lotes.length, pct: lotes.length ? Math.round(planned / lotes.length * 100) : 0 };
  }, [lotes]);

  const phase3Stats = useMemo(() => {
    const all = lotes.flatMap(b => b.decisions || []);
    const pending = all.filter(d => !d.resolved).length;
    return { total: all.length, pending, resolved: all.length - pending, agentDecided: all.filter(d => !d.requiresUser).length };
  }, [lotes]);

  const streamingMeta = useMemo(() => parseStreamingMeta(streamingText), [streamingText]);

  const availableFilters = useMemo(() => {
    const f: { id: string; label: string; icon: string }[] = [{ id: 'severity', label: 'Por Gravidade', icon: '🎯' }];
    if (lotes.length > 1 && Math.max(...lotes.map(b => b.files.length)) > Math.min(...lotes.map(b => b.files.length)))
      f.push({ id: 'filecount', label: 'Por Qtd. Arquivos', icon: '📁' });
    if (lotes.some(b => b.decisions?.length))
      f.push({ id: 'decisions', label: 'Decisões Pendentes', icon: '⚖️' });
    if (lotes.some(b => b.isSupplemental))
      f.push({ id: 'supplemental', label: 'Suplementares', icon: '🔁' });
    return f;
  }, [lotes]);

  const navGroups = useMemo(() =>
    NAV_GROUPS_CONFIG.map(g => ({ ...g, batches: lotes.filter(g.filter) })).filter(g => g.batches.length > 0),
    [lotes]
  );

  // For compact panel: filter batches by selected phase tab
  const compactGroups = useMemo(() => {
    if (lotesPhaseFilter === 'all') return navGroups;
    return navGroups.filter(g => g.phaseId === lotesPhaseFilter);
  }, [navGroups, lotesPhaseFilter]);

  const phaseTabCounts = useMemo(() => {
    const c: Record<string, number> = { all: lotes.length };
    NAV_GROUPS_CONFIG.forEach(g => { c[g.phaseId] = lotes.filter(g.filter).length; });
    return c;
  }, [lotes]);

  const coveredCount    = totalDocuments - uncoveredFiles.length;
  const coveragePercent = totalDocuments > 0 ? Math.round((coveredCount / totalDocuments) * 100) : 0;

  const openBatch = useCallback((batch: Batch) => {
    setSelectedBatch(batch);
    setDetailTab(defaultTab(batch, activeStep));
  }, [activeStep]);

  const hasTelemetryData = useCallback((phase: string) => {
    if (phase === "01") return !!phase1Stats;
    if (phase === "02") return phase2Stats.planned > 0;
    if (phase === "03") return phase3Stats.total > 0;
    if (phase === "04") return metrics.count > 0;
    return false;
  }, [phase1Stats, phase2Stats, phase3Stats, metrics]);

  const TelemetryContent: React.FC<{ phase: string; expanded?: boolean }> = ({ phase, expanded = false }) => {
    if (phase === "01") {
      if (!phase1Stats) return <EmptyTelemetry msg="Execute a Fase 1 para ver estatísticas." />;
      return (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Lotes',      val: phase1Stats.totalLotes,       color: 'text-cyan-400' },
              { label: 'Arqs.',      val: phase1Stats.totalFiles,        color: 'text-slate-200' },
              { label: 'Cobertura',  val: `${coveragePercent}%`,         color: coveragePercent === 100 ? 'text-emerald-400' : 'text-yellow-400' },
              { label: 'Suplement.', val: phase1Stats.supplementalCount, color: phase1Stats.supplementalCount > 0 ? 'text-orange-400' : 'text-slate-500' },
            ].map(({ label, val, color }) => <StatCard key={label} label={label} val={String(val)} color={color} />)}
          </div>
          <div className="bg-black/40 rounded-xl border border-white/5 p-2.5 space-y-1.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Impacto por Gravidade</p>
            {Object.entries(phase1Stats.sevCount).slice(0, expanded ? undefined : 5).map(([sev, count]) => {
              const sd = getSeverity(sev);
              return (
                <div key={sev} className="flex items-center gap-2">
                  <span className="text-xs">{sd.icon}</span>
                  <span className={`text-[8px] font-mono flex-1 ${sd.color}`}>{sd.label}</span>
                  <span className="text-[9px] font-black text-slate-300">{count}</span>
                </div>
              );
            })}
          </div>
          {expanded && (
            <div className="bg-black/30 rounded-xl border border-white/5 p-2.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-2">Distribuição por Severidade</p>
              <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
                {Object.entries(phase1Stats.sevCount).map(([sev, count]) => {
                  const pct = (count / phase1Stats.totalLotes) * 100;
                  const sd = getSeverity(sev);
                  return <div key={sev} style={{ width: `${pct}%` }} className={`h-full ${sd.bg}`} title={`${sd.label}: ${count}`} />;
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (phase === "02") {
      if (!phase2Stats.total) return <EmptyTelemetry msg="Execute a Fase 2 para ver estatísticas." />;
      return (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Planejados', val: String(phase2Stats.planned), color: 'text-purple-400' },
              { label: 'Total',      val: String(phase2Stats.total),   color: 'text-slate-200' },
              { label: 'Cobertura',  val: `${phase2Stats.pct}%`,       color: phase2Stats.pct === 100 ? 'text-emerald-400' : 'text-yellow-400' },
              { label: 'Pendentes',  val: String(phase2Stats.total - phase2Stats.planned), color: 'text-slate-500' },
            ].map(({ label, val, color }) => <StatCard key={label} label={label} val={val} color={color} />)}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[8px] font-mono text-slate-500">
              <span>Blueprints Gerados</span>
              <span className="text-purple-400">{phase2Stats.pct}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-700" style={{ width: `${phase2Stats.pct}%` }} />
            </div>
          </div>
          {expanded && lotes.filter(b => b.planMd).length > 0 && (
            <div className="space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Lotes com Plano</p>
              {lotes.filter(b => b.planMd).slice(0, 8).map(b => (
                <div key={b.id} className="flex items-center gap-2 bg-purple-500/5 border border-purple-500/15 rounded-lg px-2.5 py-1.5">
                  <span className="text-[7px] font-black text-purple-400 font-mono">#{b.id}</span>
                  <span className="text-[7px] font-mono text-slate-500 truncate flex-1">{b.description?.slice(0, 60) || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (phase === "03") {
      if (!phase3Stats.total && !lotes.some(b => b.decisions?.length)) return <EmptyTelemetry msg="Execute a Fase 3 para ver estatísticas." />;
      return (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total Dec.',  val: String(phase3Stats.total),       color: 'text-amber-400' },
              { label: 'Pendentes',   val: String(phase3Stats.pending),      color: phase3Stats.pending > 0 ? 'text-red-400' : 'text-emerald-400' },
              { label: 'Resolvidas',  val: String(phase3Stats.resolved),     color: 'text-emerald-400' },
              { label: 'Auto Agente', val: String(phase3Stats.agentDecided), color: 'text-cyan-400' },
            ].map(({ label, val, color }) => <StatCard key={label} label={label} val={val} color={color} />)}
          </div>
          {phase3Stats.pending > 0 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[9px] font-mono text-amber-300">{phase3Stats.pending} aguardando revisão</span>
            </div>
          )}
          {expanded && phase3Stats.total > 0 && (
            <div className="space-y-1.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Resolução por Lote</p>
              {lotes.filter(b => b.decisions?.length).map(b => {
                const pending = (b.decisions || []).filter(d => !d.resolved).length;
                const total   = (b.decisions || []).length;
                return (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="text-[7px] font-mono text-slate-600 w-8">#{b.id}</span>
                    <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${((total - pending) / total) * 100}%` }} />
                    </div>
                    <span className={`text-[7px] font-mono ${pending > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{total - pending}/{total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (phase === "04") {
      if (!metrics.count) return <EmptyTelemetry msg="Execute a Fase 4 para ver estatísticas." />;
      return (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Modificados', val: String(metrics.count),                                              color: 'text-cyan-400' },
              { label: 'Delta L',     val: `${metrics.linesDiff > 0 ? '+' : ''}${metrics.linesDiff}`,         color: metrics.linesDiff <= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: '~Tokens',     val: `~${formatTokens(metrics.tokensSaved)}`,                           color: 'text-purple-400' },
              { label: 'Delta KB',    val: `${((metrics.sizeAfter - metrics.sizeBefore) / 1024).toFixed(1)}`, color: metrics.sizeAfter <= metrics.sizeBefore ? 'text-emerald-400' : 'text-red-400' },
            ].map(({ label, val, color }) => <StatCard key={label} label={label} val={val} color={color} />)}
          </div>
          <div className="bg-black/40 p-2 rounded-xl border border-white/5 space-y-1.5">
            <p className="text-[8px] font-mono text-slate-500 uppercase tracking-wider font-black">Linhas: Antes → Depois</p>
            <div className="flex gap-1 h-1">
              <div className="h-full bg-red-500/50 rounded-full" style={{ width: `${(metrics.oldLines / (metrics.oldLines + metrics.newLines + 1)) * 100}%` }} />
              <div className="h-full bg-emerald-500/50 rounded-full" style={{ width: `${(metrics.newLines / (metrics.oldLines + metrics.newLines + 1)) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[8px] font-mono text-slate-600">
              <span>{metrics.oldLines.toLocaleString()}L antes</span>
              <span>{metrics.newLines.toLocaleString()}L depois</span>
            </div>
          </div>
          {expanded && correctedFiles.length > 0 && (
            <div className="space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Arquivos Modificados</p>
              {correctedFiles.slice(0, 10).map(f => {
                const delta = f.sizeChange || (f.content.length - f.originalSize);
                return (
                  <div key={f.name} className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-2 py-1">
                    <Code className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                    <span className="text-[7px] font-mono text-slate-400 truncate flex-1">{f.name.split('/').pop()}</span>
                    <span className={`text-[7px] font-mono shrink-0 ${delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {delta > 0 ? '+' : ''}{(delta / 1024).toFixed(1)}KB
                    </span>
                  </div>
                );
              })}
              {correctedFiles.length > 10 && <p className="text-[7px] font-mono text-slate-600 text-center">+{correctedFiles.length - 10} mais</p>}
            </div>
          )}
        </div>
      );
    }

    return <EmptyTelemetry msg="Selecione uma fase." />;
  };

  return (
    <section className="w-full lg:w-80 flex flex-col gap-3 shrink-0 min-w-0 font-sans min-h-[400px] lg:min-h-0">

      {/* ── COVERAGE PANEL ── */}
      {totalDocuments > 0 && (
        <div className="bg-[#0b0e14] border border-white/5 rounded-2xl p-4 flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Cobertura</span>
            </div>
            <button onClick={() => setShowCoverage(true)} className="text-[8px] font-mono text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/5 hover:border-cyan-500/30">
              <Eye className="w-2.5 h-2.5" /> ver
            </button>
          </div>
          <div className="flex justify-between text-[8px] font-mono mb-1">
            <span className={coveredCount === totalDocuments ? 'text-emerald-400' : 'text-yellow-400'}>{coveredCount}/{totalDocuments} analisados</span>
            <span className={coveragePercent === 100 ? 'text-emerald-400' : 'text-yellow-400'}>{coveragePercent}%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${coveragePercent === 100 ? 'bg-emerald-500' : coveragePercent > 80 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${coveragePercent}%` }} />
          </div>
        </div>
      )}

      {/* ── LOTES POR FASE — inline compact panel ── */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0">
        <button onClick={() => setShowLotesPopover(true)}
          className="px-4 py-2.5 border-b border-white/5 bg-black/20 flex items-center gap-2 shrink-0 w-full text-left hover:bg-white/[0.02] transition-colors">
          <Grid2X2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 flex-1">Lotes por Fase</span>
          {lotes.length > 0 && (
            <span className="text-[8px] font-mono bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/20">{lotes.length}</span>
          )}
          <Maximize2 className="w-3 h-3 text-slate-600 ml-1" />
        </button>

        {/* Phase filter tabs — above list, beside/below the expand button */}
        {lotes.length > 0 && (
          <div className="flex items-center gap-1 px-2 pt-2 pb-0 shrink-0 flex-wrap">
            {LOTES_PHASE_TABS.map(tab => {
              const count = phaseTabCounts[tab.id] ?? 0;
              if (tab.id !== 'all' && count === 0) return null;
              const isActive = lotesPhaseFilter === tab.id;
              return (
                <button key={tab.id} onClick={() => setLotesPhaseFilter(tab.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[7px] font-black rounded-lg border transition-all shrink-0 ${
                    isActive ? tab.activeBg : 'border-white/5 text-slate-600 hover:text-slate-400 hover:border-white/15'
                  }`}>
                  {tab.label}
                  {count > 0 && <span className="opacity-60">{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 pt-1.5">
          {lotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-30 py-8 gap-2">
              <CircleDot className="w-7 h-7 text-slate-500" />
              <p className="text-[8px] uppercase font-bold tracking-widest">Nenhum Lote Gerado</p>
              <p className="text-[7px] text-slate-500">Execute a Fase 1</p>
            </div>
          ) : compactGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center opacity-30 gap-2">
              <CircleDot className="w-5 h-5 text-slate-500" />
              <p className="text-[7px] uppercase font-bold tracking-widest">Nenhum lote nesta fase</p>
            </div>
          ) : (
            <div className="space-y-3">
              {compactGroups.map(group => (
                <div key={group.phaseId}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${group.dot} shrink-0`} />
                    <span className={`text-[7px] font-black uppercase tracking-[0.15em] ${group.color}`}>{group.label}</span>
                    <div className="flex-1 h-px bg-white/5" />
                    <span className={`text-[7px] font-mono ${group.color} opacity-60`}>{group.batches.length}</span>
                  </div>
                  <div className="space-y-1.5 pl-3">
                    {group.batches.map(lote => {
                      const sev = getBatchColorByFilter(lote, filterMode, lotes, getSeverity);
                      const pendingDec = (lote.decisions || []).filter(d => !d.resolved).length;
                      return (
                        <button key={lote.id} onClick={() => openBatch(lote)}
                          className={`w-full text-left p-2.5 rounded-xl ${sev.bg} border ${sev.border} hover:brightness-125 transition-all group`}>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-xs leading-none shrink-0">{sev.icon}</span>
                              <span className={`text-[7px] font-black ${sev.color} uppercase tracking-wide truncate`}>{sev.label}</span>
                              {lote.isSupplemental && <span className="text-[6px] font-bold px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0">SUPL</span>}
                            </div>
                            <span className={`text-[7px] font-black font-mono ${sev.color} opacity-50 shrink-0`}>#{lote.id}</span>
                          </div>
                          <p className="text-[7px] font-mono text-slate-500 truncate leading-snug mb-1.5">
                            {lote.description ? lote.description.split(' ').slice(0, 8).join(' ') + (lote.description.split(' ').length > 8 ? '…' : '') : '—'}
                          </p>
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1">
                              {lote.executionMd && <span className="text-[6px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-black">F4✓</span>}
                              {lote.decisions?.length ? (pendingDec > 0
                                ? <span className="text-[6px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/15 font-black animate-pulse">F3⚠{pendingDec}</span>
                                : <span className="text-[6px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/15 font-black">F3✓</span>
                              ) : null}
                              {lote.planMd && !lote.executionMd && <span className="text-[6px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15 font-black">F2✓</span>}
                            </div>
                            <span className="text-[6px] font-mono text-slate-700 shrink-0 group-hover:text-slate-500">{lote.files.length} arq.</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── TELEMETRIA ── */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl flex flex-col overflow-hidden shrink-0" style={{ minHeight: '200px', maxHeight: '340px' }}>
        <button onClick={() => setShowTelemetryModal(true)}
          className="px-4 py-2.5 border-b border-white/5 bg-black/20 flex items-center gap-2 shrink-0 w-full text-left hover:bg-white/[0.02] transition-colors">
          <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 flex-1">Telemetria</span>
          {isStreaming ? (
            <span className="flex gap-1 items-center text-[8px] font-mono text-orange-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500" />
              </span>
              LIVE
            </span>
          ) : <Maximize2 className="w-3 h-3 text-slate-600" />}
        </button>

        {/* Streaming ticker — symbolic, mini, shows live characters running */}
        {isStreaming && (
          <div className="mx-3 mt-2 shrink-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-2 h-2 text-emerald-500 animate-pulse shrink-0" />
              <span className="text-[6px] font-black text-emerald-600 uppercase tracking-[0.2em]">Verbose · Streaming</span>
              <span className="ml-auto text-[6px] font-mono text-emerald-800">~{formatTokens(streamingMeta.tokensOut)} tok</span>
            </div>
            {/* Single-line ticker — raw chars running, no format */}
            <div className="relative bg-black/80 border border-emerald-500/15 rounded-lg overflow-hidden" style={{ height: '22px' }}>
              <p className="absolute inset-0 flex items-center px-2 text-[6.5px] font-mono text-emerald-300/40 overflow-hidden whitespace-nowrap">
                {streamingText.slice(-300).replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ')}
              </p>
              <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black/80 to-transparent pointer-events-none" />
            </div>
            {/* Last file path detected */}
            {streamingMeta.filePaths.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1 overflow-hidden">
                <Code className="w-2 h-2 text-slate-700 shrink-0" />
                <span className="text-[6px] font-mono text-slate-700 truncate">{streamingMeta.filePaths[streamingMeta.filePaths.length - 1]}</span>
              </div>
            )}
          </div>
        )}

        {/* Provider / status row */}
        <div className="flex items-center gap-2 px-3 pt-2 shrink-0">
          <Monitor className="w-2.5 h-2.5 text-slate-600 shrink-0" />
          <span className="text-[7px] font-mono text-slate-600 truncate flex-1">
            {provider && <span className="text-slate-500 uppercase">{provider}</span>}
            {provider && model && <span className="text-slate-700"> · </span>}
            {model && <span className="text-slate-600">{String(model).replace('gemini-', 'gem-')}</span>}
          </span>
          <span className={`text-[6px] font-black px-1.5 py-0.5 rounded border ${isStreaming ? 'text-orange-400 border-orange-500/30 bg-orange-500/10 animate-pulse' : 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5'}`}>
            {isStreaming ? 'BUSY' : 'IDLE'}
          </span>
        </div>

        {/* Phase tabs */}
        <div className="flex gap-1 px-3 pt-2 shrink-0">
          {TELEMETRY_TABS.map(tab => {
            const hasData = hasTelemetryData(tab.id);
            const isActive = telemetryPhaseTab === tab.id;
            return (
              <button key={tab.id} onClick={() => hasData && setTelemetryPhaseTab(tab.id)} disabled={!hasData}
                className={`px-2.5 py-1 text-[8px] font-black rounded-lg border transition-all ${
                  isActive && hasData ? `${tab.activeBg} ${tab.activeText}` : hasData ? 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/20' : 'border-transparent text-slate-700 cursor-not-allowed'
                }`}>
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 pt-2">
          <TelemetryContent phase={telemetryPhaseTab} />
        </div>
      </div>

      {/* ── LOTES NAVIGATION MODAL ── */}
      {showLotesPopover && createPortal(
        <div className="fixed inset-0 z-[128] flex items-center justify-center p-3 bg-[#02040a]/95 backdrop-blur-md" onClick={() => setShowLotesPopover(false)}>
          <div className={`bg-[#090c12] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 w-full ${MODAL_SIZES[lotesSize]}`}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-white/5 bg-black/40 flex items-center gap-3 shrink-0">
              <Grid2X2 className="w-4 h-4 text-orange-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-white">Navegação por Lotes</h2>
                <p className="text-[8px] font-mono text-slate-500">{lotes.length} lote(s) · clique em qualquer card para abrir detalhes</p>
              </div>
              <SizePresets current={lotesSize} onChange={setLotesSize} />
              {/* Filter */}
              <div className="relative">
                <button onClick={e => { e.stopPropagation(); setShowFilterMenu(v => !v); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 hover:border-white/20 transition-all text-slate-400 hover:text-white">
                  <Filter className="w-3 h-3" />
                  <span className="text-[8px] font-mono">{availableFilters.find(f => f.id === filterMode)?.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showFilterMenu ? 'rotate-180' : ''}`} />
                </button>
                {showFilterMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden shadow-xl z-10 w-52">
                    <div className="px-3 py-2 border-b border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Ordenar / Filtrar</p>
                    </div>
                    {availableFilters.map(f => (
                      <button key={f.id} onClick={() => { setFilterMode(f.id); setShowFilterMenu(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-[9px] font-mono transition-colors ${filterMode === f.id ? 'bg-orange-500/10 text-orange-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                        <span className="text-sm">{f.icon}</span>
                        <span className="flex-1">{f.label}</span>
                        {filterMode === f.id && <span className="text-[7px] text-orange-400 font-black">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
                {showFilterMenu && <div className="fixed inset-0 z-[5]" onClick={() => setShowFilterMenu(false)} />}
              </div>
              <button onClick={() => setShowLotesPopover(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all border border-white/5 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {lotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-30">
                  <CircleDot className="w-12 h-12 mb-4 text-slate-500" />
                  <p className="text-sm uppercase font-bold tracking-widest">Nenhum lote gerado</p>
                  <p className="text-[10px] text-slate-500 mt-2">Execute a Fase 1 para gerar os lotes</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {navGroups.map(group => (
                    <div key={group.phaseId}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-2 h-2 rounded-full ${group.dot} shrink-0`} />
                        <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${group.color}`}>{group.label}</span>
                        <div className="flex-1 h-px bg-white/5" />
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${group.color} opacity-60`}>{group.batches.length} lote(s)</span>
                      </div>
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                        {group.batches.map(lote => {
                          const sev = getBatchColorByFilter(lote, filterMode, lotes, getSeverity);
                          const pendingDec = (lote.decisions || []).filter(d => !d.resolved).length;
                          const fileNames = lote.files.slice(0, 4).map(f => f.split('/').pop() || f);
                          return (
                            <button key={lote.id} onClick={() => { openBatch(lote); setShowLotesPopover(false); }}
                              className={`text-left p-4 rounded-xl ${sev.bg} border ${sev.border} hover:brightness-125 transition-all group flex flex-col gap-3`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-base leading-none shrink-0">{sev.icon}</span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${sev.bg} ${sev.color} ${sev.border} uppercase tracking-wide`}>{sev.label}</span>
                                      {lote.isSupplemental && <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">SUPL</span>}
                                    </div>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-black font-mono ${sev.color} opacity-50 shrink-0`}>#{lote.id}</span>
                              </div>
                              <p className="text-[9px] font-mono text-slate-400 leading-relaxed line-clamp-2">{lote.description || '—'}</p>
                              <div className="space-y-1">
                                {fileNames.map((name, i) => (
                                  <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-1 h-1 rounded-full bg-white/10 shrink-0" />
                                    <span className="text-[8px] font-mono text-slate-600 truncate">{name}</span>
                                  </div>
                                ))}
                                {lote.files.length > 4 && <span className="text-[7px] font-mono text-slate-700">+{lote.files.length - 4} arquivo(s)</span>}
                              </div>
                              <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/5">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {lote.executionMd && <span className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-black">F4 ✓</span>}
                                  {lote.decisions?.length ? (pendingDec > 0
                                    ? <span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/15 font-black animate-pulse">F3 ⚠ {pendingDec}p</span>
                                    : <span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/15 font-black">F3 ✓</span>
                                  ) : null}
                                  {lote.planMd && !lote.executionMd && <span className="text-[7px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15 font-black">F2 ✓</span>}
                                </div>
                                <span className="text-[8px] font-mono text-slate-600 shrink-0 group-hover:text-slate-400">{lote.files.length} arq.</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── TELEMETRIA EXPANDED MODAL ── */}
      {showTelemetryModal && createPortal(
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-[#02040a]/95 backdrop-blur-md" onClick={() => setShowTelemetryModal(false)}>
          <div className={`bg-[#0b0e14] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 w-full ${MODAL_SIZES[telemetrySize]}`}
            onClick={e => e.stopPropagation()}>
            <div className="border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-5 py-3 shrink-0">
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-cyan-400" />
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-white">Telemetria Expandida</h2>
                  <p className="text-[8px] font-mono text-slate-500">
                    {provider && <span className="text-slate-400 uppercase">{provider}</span>}
                    {provider && model && <span className="text-slate-600"> · </span>}
                    {model && <span className="text-slate-500">{model}</span>}
                    {isStreaming && <span className="text-orange-400 ml-2 animate-pulse">● STREAMING</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SizePresets current={telemetrySize} onChange={setTelemetrySize} />
                <div className="flex gap-1">
                  {TELEMETRY_TABS.map(tab => {
                    const hasData = hasTelemetryData(tab.id);
                    const isActive = telemetryPhaseTab === tab.id;
                    return (
                      <button key={tab.id} onClick={() => hasData && setTelemetryPhaseTab(tab.id)} disabled={!hasData}
                        className={`px-2 py-1 text-[8px] font-black rounded border transition-all ${isActive && hasData ? `${tab.activeBg} ${tab.activeText}` : hasData ? 'border-white/10 text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-700 cursor-not-allowed'}`}>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setShowTelemetryModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all border border-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live status bar */}
            <div className="flex items-center gap-4 px-5 py-2 border-b border-white/5 bg-black/20 shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-orange-400 animate-pulse' : 'bg-emerald-500'}`} />
                <span className={`text-[8px] font-black uppercase tracking-widest ${isStreaming ? 'text-orange-400' : 'text-emerald-500'}`}>
                  {isStreaming ? 'PROCESSANDO' : 'STANDBY'}
                </span>
              </div>
              {isStreaming && streamingText && (
                <>
                  <div className="flex items-center gap-1.5 text-[8px] font-mono text-slate-500">
                    <Terminal className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-400">{formatTokens(streamingMeta.tokensOut)}</span>
                    <span>tokens out</span>
                  </div>
                  {streamingMeta.loteIds.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[8px] font-mono text-slate-500">
                      <Hash className="w-3 h-3 text-slate-600" />
                      <span>lotes detectados: <span className="text-cyan-400">{streamingMeta.loteIds.join(', ')}</span></span>
                    </div>
                  )}
                  {streamingMeta.filePaths.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[8px] font-mono text-slate-500 overflow-hidden">
                      <FileCode className="w-3 h-3 text-slate-600 shrink-0" />
                      <span className="text-slate-400 truncate max-w-[220px]">{streamingMeta.filePaths[streamingMeta.filePaths.length - 1]}</span>
                    </div>
                  )}
                </>
              )}
              {!isStreaming && lotes.length > 0 && (
                <div className="flex items-center gap-2 text-[8px] font-mono text-slate-600 ml-auto">
                  <Database className="w-3 h-3" />
                  <span>{lotes.length} lotes · {lotes.reduce((a, b) => a + b.files.length, 0)} arqs · {correctedFiles.length} modificados</span>
                </div>
              )}
            </div>

            {/* Streaming verbose terminal */}
            {isStreaming && streamingText && (
              <div className="mx-5 mt-4 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Verbose Streaming</span>
                  <span className="ml-auto text-[8px] font-mono text-slate-500">~{formatTokens(streamingMeta.tokensOut)} tokens · {(streamingText.length / 1024).toFixed(1)}KB</span>
                </div>
                <div className="bg-black/80 border border-emerald-500/15 rounded-xl p-3 max-h-[180px] overflow-y-auto custom-scrollbar font-mono text-[9px] text-emerald-300/60 leading-relaxed">
                  <pre className="whitespace-pre-wrap break-all">{streamingText.slice(-2400)}</pre>
                </div>
                {streamingMeta.filePaths.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {streamingMeta.filePaths.map((p, i) => (
                      <span key={i} className="text-[7px] font-mono bg-slate-800/60 border border-white/5 text-slate-500 px-2 py-0.5 rounded">{p.split('/').pop() || p}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <TelemetryContent phase={telemetryPhaseTab} expanded={true} />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── FILE VIEWER MODAL — GitHub PR style line numbers ── */}
      {viewingFile && createPortal(
        <div className="fixed inset-0 z-[135] flex items-center justify-center p-3 bg-[#02040a]/95 backdrop-blur-md" onClick={() => setViewingFile(null)}>
          <div className={`bg-[#0b0e14] border border-white/10 rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 ${MODAL_SIZES[fileViewerSize]}`}
            onClick={e => e.stopPropagation()}>
            <div className="h-14 border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-5 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-[10px] font-black uppercase tracking-wider text-white truncate">{viewingFile.name.split('/').pop()}</h2>
                  <p className="text-[8px] font-mono text-slate-500 truncate">{viewingFile.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[7px] font-mono text-slate-600 hidden sm:block">{viewingFile.content.split('\n').length} linhas · {(viewingFile.content.length / 1024).toFixed(1)}KB</span>
                <SizePresets current={fileViewerSize} onChange={setFileViewerSize} />
                <button onClick={() => setViewingFile(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all border border-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Code viewer — GitHub PR compare style */}
            <div className="flex-1 min-h-0 overflow-auto bg-[#02040a]">
              <table className="w-full border-collapse text-[10px] font-mono leading-[1.6]">
                <tbody>
                  {(viewingFile.content || '(arquivo vazio)').split('\n').map((line, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] group">
                      <td className="select-none text-right pr-4 pl-4 text-slate-600 group-hover:text-slate-500 border-r border-white/5 w-12 shrink-0 align-top py-0.5 tabular-nums">{i + 1}</td>
                      <td className="pl-4 pr-4 text-slate-300 whitespace-pre-wrap break-all align-top py-0.5">{line || ' '}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── BATCH DETAIL MODAL ── */}
      {selectedBatch && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 bg-[#02040a]/95 backdrop-blur-md" onClick={() => setSelectedBatch(null)}>
          <div className={`bg-[#0b0e14] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 w-full ${MODAL_SIZES[batchDetailSize]}`}
            onClick={e => e.stopPropagation()}>
            <div className="h-14 border-b border-white/5 bg-white/[0.03] flex items-center justify-between px-5 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shrink-0">
                  <Grid2X2 className="w-4 h-4 text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[11px] font-black uppercase tracking-wider text-white">Lote {selectedBatch.id}</h2>
                  <p className="text-[8px] text-orange-400/80 font-mono truncate">
                    {selectedBatch.files.length} arqs{selectedBatch.planMd ? ' · plano' : ''}{selectedBatch.decisions?.length ? ` · ${selectedBatch.decisions.length} dec.` : ''}{selectedBatch.executionMd ? ' · executado' : ''}{selectedBatch.isSupplemental ? ' · suplementar' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <SizePresets current={batchDetailSize} onChange={setBatchDetailSize} />
                {detailTab === "02" && onReloadBatch && selectedBatch.planMd && (
                  <button onClick={() => { onReloadBatch(selectedBatch.id); setSelectedBatch(null); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 transition-all text-[8px] font-black uppercase tracking-widest">
                    <RotateCcw className="w-3 h-3" /><span className="hidden sm:inline">Replanar</span>
                  </button>
                )}
                {detailTab === "03" && onRedecideBatch && (
                  <button onClick={() => { onRedecideBatch(selectedBatch.id); setSelectedBatch(null); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-[8px] font-black uppercase tracking-widest">
                    <RefreshCw className="w-3 h-3" /><span className="hidden sm:inline">Redecida</span>
                  </button>
                )}
                <button onClick={() => setSelectedBatch(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all border border-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5 bg-black/10 shrink-0">
              {DETAIL_TABS.map(tab => {
                const hasData = hasBatchDataForTab(selectedBatch, tab.id);
                const isActive = detailTab === tab.id;
                if (!hasData) return (
                  <div key={tab.id} className="px-3 py-1.5 rounded-lg border text-[8px] font-bold uppercase tracking-widest opacity-20 bg-white/[0.02] border-white/5 text-slate-600 cursor-not-allowed">{tab.label}</div>
                );
                return (
                  <button key={tab.id} onClick={() => setDetailTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg border text-[8px] font-bold uppercase tracking-widest transition-all ${isActive ? tab.activeColor : 'bg-white/[0.03] border-white/8 text-slate-500 hover:border-white/20 hover:text-slate-300'}`}>
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    {tab.id === "03" && (selectedBatch.decisions || []).filter(d => !d.resolved).length > 0 && (
                      <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className={`flex-1 min-h-0 ${detailTab === "04" ? "overflow-hidden flex gap-0" : "overflow-y-auto custom-scrollbar"}`}>
              {detailTab === "04" && selectedBatch && (
                <>
                  <div className="w-72 shrink-0 overflow-y-auto custom-scrollbar border-r border-white/5 bg-black/20 p-5">
                    <h4 className="text-[9px] font-black uppercase text-slate-500 mb-4 tracking-[0.2em] flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-emerald-400" />LOG DE EXECUÇÃO
                    </h4>
                    <div className="markdown-body text-xs text-slate-300 leading-relaxed">
                      <Markdown>{selectedBatch.executionMd || selectedBatch.planMd || "Execução concluída."}</Markdown>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <FilesColumn batch={selectedBatch} getCorrectedContent={getCorrectedContent} getOriginalContent={getOriginalContent} showDiff={true} windowWidth={windowWidth} />
                  </div>
                </>
              )}
              {detailTab !== "04" && (
                <div className="p-5 md:p-7">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {detailTab === "01" && (
                      <>
                        <div className="col-span-1 lg:col-span-6">
                          <div className="bg-black/50 p-5 rounded-2xl border border-white/5 h-full">
                            <h4 className="text-[9px] font-black uppercase text-slate-500 mb-4 tracking-[0.2em] flex items-center gap-2">
                              <Info className="w-3.5 h-3.5 text-cyan-400" />ANÁLISE DO LOTE
                            </h4>
                            <div className="markdown-body text-xs text-slate-300 leading-relaxed">
                              <Markdown>{selectedBatch.analysisMd || selectedBatch.description || "Sem análise."}</Markdown>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-1 lg:col-span-6">
                          <FilesColumn batch={selectedBatch} getCorrectedContent={getCorrectedContent} getOriginalContent={getOriginalContent}
                            showDiff={false} windowWidth={windowWidth} onViewFile={(n, c) => setViewingFile({ name: n, content: c })} />
                        </div>
                      </>
                    )}
                    {detailTab === "02" && (
                      <div className="col-span-1 lg:col-span-12">
                        <div className="bg-black/50 p-5 rounded-2xl border border-white/5">
                          <h4 className="text-[9px] font-black uppercase text-slate-500 mb-4 tracking-[0.2em] flex items-center gap-2">
                            <Info className="w-3.5 h-3.5 text-purple-400" />BLUEPRINT (PLANO)
                          </h4>
                          {selectedBatch.planMd
                            ? <div className="markdown-body text-xs text-slate-300 leading-relaxed"><Markdown>{selectedBatch.planMd}</Markdown></div>
                            : <EmptyTabState icon={<AlertTriangle className="w-8 h-8 text-yellow-500" />} msg="Plano ainda não gerado." sub="Execute a Fase 2." />
                          }
                        </div>
                      </div>
                    )}
                    {detailTab === "03" && (
                      <div className="col-span-1 lg:col-span-12 space-y-5">
                        {selectedBatch.decisionsMd && (
                          <div className="bg-black/50 p-5 rounded-2xl border border-white/5">
                            <h4 className="text-[9px] font-black uppercase text-slate-500 mb-4 tracking-[0.2em] flex items-center gap-2">
                              <Info className="w-3.5 h-3.5 text-amber-400" />SUMÁRIO
                            </h4>
                            <div className="markdown-body text-xs text-slate-300 leading-relaxed"><Markdown>{selectedBatch.decisionsMd}</Markdown></div>
                          </div>
                        )}
                        {selectedBatch.decisions && selectedBatch.decisions.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-[9px] font-black uppercase text-amber-400 tracking-[0.15em] flex items-center gap-2 pb-2 border-b border-amber-500/15">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              DECISÕES — {selectedBatch.decisions.filter(d => !d.resolved).length} pendentes / {selectedBatch.decisions.length} total
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {selectedBatch.decisions.map(decision => {
                                const finalChoice = decision.userChoice || decision.agentChoice;
                                const isPending = !decision.resolved;
                                return (
                                  <div key={decision.id} className={`p-4 rounded-2xl border flex flex-col gap-3 ${isPending ? 'bg-amber-500/5 border-amber-500/30' : 'bg-white/[0.02] border-white/8'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-mono text-slate-500 mb-0.5">{decision.id}</p>
                                        <p className="text-xs font-bold text-slate-200 leading-snug">{decision.descricao}</p>
                                      </div>
                                      {!isPending && finalChoice
                                        ? <span className={`shrink-0 text-[7px] font-black px-2 py-1 rounded border uppercase ${getDecisionColor(finalChoice)}`}>{finalChoice}</span>
                                        : isPending && <span className="shrink-0 text-[7px] font-black px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase animate-pulse">AGUARDA</span>
                                      }
                                    </div>
                                    <p className="text-[9px] text-slate-400 italic leading-relaxed">{decision.rationale}</p>
                                    {decision.requiresUser ? (
                                      <div className="flex flex-wrap gap-2">
                                        {decision.options.map(opt => (
                                          <button key={opt} onClick={() => onDecisionChoice?.(selectedBatch.id, decision.id, opt)}
                                            className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-all hover:brightness-125 ${getDecisionColor(opt)}`}>
                                            {opt}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[8px] font-mono text-slate-500">Agente:</span>
                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase ${finalChoice ? getDecisionColor(finalChoice) : 'bg-white/5 text-slate-300 border-white/8'}`}>{finalChoice || '—'}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── COVERAGE MODAL ── */}
      {showCoverage && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-[#02040a]/95 backdrop-blur-md" onClick={() => setShowCoverage(false)}>
          <div className={`bg-[#0b0e14] border border-white/10 rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 ${MODAL_SIZES[coverageSize]}`}
            onClick={e => e.stopPropagation()}>
            <div className="h-14 border-b border-white/5 bg-white/5 flex items-center justify-between px-5 shrink-0">
              <div className="flex items-center gap-3">
                <FileCheck className="w-4 h-4 text-cyan-400" />
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-white">Cobertura de Análise</h2>
                  <p className="text-[9px] font-mono text-cyan-400/70">{coveredCount}/{totalDocuments} arquivos · {coveragePercent}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SizePresets current={coverageSize} onChange={setCoverageSize} />
                <button onClick={() => setShowCoverage(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all border border-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-5">
              <CoverageList title={`Arquivos Analisados (${coveredCount})`} color="emerald" files={originalFiles.filter(f => !uncoveredFiles.find(u => u.name === f.name))} lotes={lotes} showLoteBadge />
              {uncoveredFiles.length > 0 && <CoverageList title={`Não Cobertos (${uncoveredFiles.length})`} color="yellow" files={uncoveredFiles} lotes={lotes} showSize />}
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
};
