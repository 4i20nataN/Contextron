import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Grid2X2, CheckCircle2, X, Info, Zap, AlertTriangle, Bug, Code, CircleDot, Activity } from 'lucide-react';
import Markdown from 'react-markdown';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { Batch, CorrectedFile } from '../types';

interface RegistryProps {
  lotes: Batch[];
  correctedFiles: CorrectedFile[];
  originalFiles: any[];
  activeStep: string;
}

export const Registry: React.FC<RegistryProps> = ({ lotes, correctedFiles, originalFiles, activeStep }) => {
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getOriginalContent = (filename: string) => {
    return originalFiles.find(f => f.name === filename)?.content || '';
  };

  const getCorrectedContent = (filename: string) => {
    return correctedFiles.find(f => f.name === filename)?.content || '';
  };

  const getMiniDesc = (desc: string) => {
    if (!desc) return '';
    const words = desc.split(' ');
    if (words.length <= 5) return desc;
    return words.slice(0, 5).join(' ') + '...';
  };

  const severityData = {
    high: { icon: '🔴', label: 'ALTO', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    medium: { icon: '🟠', label: 'MÉDIO', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
    low: { icon: '🟡', label: 'BAIXO', color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    critical: { icon: '🔴', label: 'CRÍTICO', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    info: { icon: '🟢', label: 'SEGURO', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
  };

  const getSeverity = (severity?: string) => {
    if (!severity) return severityData.info;
    const lower = severity.toLowerCase();
    if (lower.includes('critical') || lower.includes('crítico') || lower.includes('critico')) return severityData.critical;
    if (lower.includes('high') || lower.includes('alto')) return severityData.high;
    if (lower.includes('medium') || lower.includes('médio') || lower.includes('medio')) return severityData.medium;
    if (lower.includes('low') || lower.includes('baixo')) return severityData.low;
    return severityData.info;
  };

  // Calculate fix logs metrics
  const calcMetrics = () => {
    let oldLinesTotal = 0;
    let newLinesTotal = 0;
    let sizeBefore = 0;
    let sizeAfter = 0;
    let tokensSaved = 0;

    correctedFiles.forEach(file => {
      const oldC = getOriginalContent(file.name);
      const newC = file.content;
      oldLinesTotal += oldC.split('\n').length;
      newLinesTotal += newC.split('\n').length;
      sizeBefore += file.originalSize || oldC.length;
      sizeAfter += newC.length;
      tokensSaved += file.tokensSaved || Math.abs(Math.floor((newC.length - (file.originalSize || oldC.length)) / 4));
    });

    return {
      modifiedFiles: correctedFiles.length,
      linesDiff: newLinesTotal - oldLinesTotal,
      oldLinesTotal,
      newLinesTotal,
      sizeBefore,
      sizeAfter,
      tokensSaved
    };
  };

  const metrics = calcMetrics();

  return (
    <section className="w-full lg:w-80 flex flex-col gap-4 shrink-0 min-w-0 min-h-[400px] lg:min-h-0 font-sans">
      {/* Batch Explorer */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl p-4 flex flex-col gap-4 flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-2 p-1 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Grid2X2 className="w-4 h-4 text-orange-400" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">Navegação de Lotes</h2>
          </div>
          <span className="text-[9px] font-mono bg-orange-500/20 text-orange-400 px-2 py-1 rounded border border-orange-500/30 font-bold">
            FASE {activeStep}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
          {lotes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 mt-10">
              <CircleDot className="w-8 h-8 mb-4 text-slate-500" />
              <p className="text-[10px] uppercase font-bold tracking-widest leading-loose">Nenhum lote gerado na Fase {activeStep}</p>
            </div>
          ) : (
            lotes.map((lote) => {
              const sev = getSeverity(lote.severity);
              return (
                <div 
                  key={lote.id} 
                  onClick={() => setSelectedBatch(lote)}
                  className={`group cursor-pointer p-4 rounded-xl ${sev.bg} border ${sev.border} hover:brightness-125 transition-all flex flex-col gap-3`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-black ${sev.color} font-mono tracking-wider`}>
                      Lote {lote.id}
                    </span>
                    <span className="text-[10px] text-slate-300/80 font-mono font-medium">
                      {lote.files.length} arquivos
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="text-sm">{sev.icon}</span>
                     <span className={`text-[10px] font-bold ${sev.color} uppercase tracking-tight leading-none`}>
                       {sev.label} IMPACTO<br/>
                       <span className="text-[9px] font-medium text-slate-300 italic opacity-80 leading-snug lowercase">
                         {getMiniDesc(lote.description)}
                       </span>
                     </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedBatch && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 bg-[#02040a]/95 backdrop-blur-md">
          <div className="bg-[#0b0e14] border border-white/10 rounded-[1.5rem] md:rounded-[2rem] w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="h-16 border-b border-white/5 bg-white/5 flex items-center justify-between px-6 shrink-0">
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                   <Grid2X2 className="w-5 h-5 text-orange-400" />
                 </div>
                 <div>
                   <h2 className="text-sm font-black uppercase tracking-widest text-white">LOTE {selectedBatch.id}: VISÃO DETALHADA</h2>
                   <p className="text-[10px] text-orange-400/80 font-mono uppercase tracking-widest">
                     FASE {activeStep} • {selectedBatch.files.length} ARQUIVOS Mapeados
                   </p>
                 </div>
               </div>
               <button onClick={() => setSelectedBatch(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all border border-white/5">
                 <X className="w-5 h-5" />
               </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Markdown Structure Column */}
                <div className={`col-span-1 ${activeStep === "02" ? "lg:col-span-12" : activeStep === "03" ? "lg:col-span-4" : "lg:col-span-6"} space-y-6`}>
                  <div className="bg-black/50 p-6 rounded-3xl border border-white/5 h-full">
                    <h4 className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-[0.2em] flex items-center gap-2">
                       <Info className="w-4 h-4 text-blue-400" /> 
                       {activeStep === "01" ? "DETALHES DO LOTE (ANÁLISE)" : activeStep === "02" ? "BLUEPRINT DO LOTE (PLANO)" : "RESULTADOS DA EXECUÇÃO"}
                    </h4>
                    <div className="markdown-body text-xs text-slate-300 leading-relaxed font-sans">
                      <Markdown>{
                        activeStep === "01" ? (selectedBatch.analysisMd || selectedBatch.description || "Sem análise.") :
                        activeStep === "02" ? (selectedBatch.planMd || "Sem plano estruturado. Proceda para planejamento.") :
                        (selectedBatch.executionMd || selectedBatch.planMd || "Ações concluídas do lote.")
                      }</Markdown>
                    </div>
                  </div>
                </div>

                {/* Right Column: Files Details */}
                {activeStep !== "02" && (
                <div className={`col-span-1 ${activeStep === "03" ? "lg:col-span-8" : "lg:col-span-6"}`}>
                   <div className="bg-[#0f1219] rounded-3xl border border-white/5 flex flex-col h-full min-h-[400px]">
                      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-black/20 rounded-t-3xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Code className="w-4 h-4" /> Elementos do Lote
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-5 space-y-5">
                         {selectedBatch.files.map((file, idx) => {
                           const hasNewCode = !!getCorrectedContent(file);
                           const isPhase3 = activeStep === "03";
                           return (
                             <div key={idx} className="flex flex-col gap-3">
                               <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5 group hover:border-white/10 transition-all">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Bug className={`w-4 h-4 shrink-0 ${isPhase3 && hasNewCode ? 'text-emerald-400' : 'text-slate-500'}`} />
                                    <span className="text-xs font-mono text-slate-200 truncate font-bold">{file}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isPhase3 && hasNewCode && (
                                      <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">Modificado</span>
                                    )}
                                    {!isPhase3 && (
                                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-black/40 text-slate-500">Mapeado</span>
                                    )}
                                  </div>
                               </div>
                               
                               {/* Only show Diff in Phase 3 */ }
                               {isPhase3 && hasNewCode && (
                                 <div className="rounded-xl overflow-hidden border border-white/10 bg-black text-[10px]">
                                   <ReactDiffViewer
                                     oldValue={getOriginalContent(file)}
                                     newValue={getCorrectedContent(file)}
                                     splitView={windowWidth > 1024}
                                     hideLineNumbers={false}
                                     useDarkTheme={true}
                                     styles={{
                                       variables: {
                                         dark: {
                                           diffViewerBackground: '#02040a',
                                           addedBackground: 'rgba(16, 185, 129, 0.1)',
                                           addedColor: '#10b981',
                                           removedBackground: 'rgba(239, 68, 68, 0.1)',
                                           removedColor: '#ef4444',
                                         }
                                       }
                                     }}
                                   />
                                 </div>
                               )}
                             </div>
                           );
                         })}
                      </div>
                   </div>
                </div>
                )}

              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Telemetry Panel / Fix Logs */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl flex flex-col h-[280px] overflow-hidden relative">
        <div className="p-4 flex items-center justify-between gap-2 border-b border-white/5 bg-black/20">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">Fix Logs & Telemetria</h2>
          </div>
          {activeStep === "03" && (
             <span className="flex h-2 w-2 relative">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
             </span>
          )}
        </div>

        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {activeStep === "03" && correctedFiles.length > 0 ? (
            <div className="flex flex-col gap-3 w-full animate-in fade-in duration-500 h-full">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Arquivos Modificados</p>
                   <p className="text-sm font-mono font-black text-cyan-400">{metrics.modifiedFiles}</p>
                 </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Diferença L/C</p>
                   <p className={`text-sm font-mono font-black ${metrics.linesDiff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                     {metrics.linesDiff > 0 ? '+' : ''}{metrics.linesDiff} <span className="text-[10px]">L</span>
                   </p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Tokens Salvos Est.</p>
                   <p className="text-sm font-mono font-black text-purple-400">~{metrics.tokensSaved}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Delta Size</p>
                   <p className={`text-sm font-mono font-black ${metrics.sizeAfter - metrics.sizeBefore <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                     {((metrics.sizeAfter - metrics.sizeBefore) / 1024).toFixed(2)} KB
                   </p>
                </div>
              </div>

              <div className="mt-auto bg-black/40 p-3 rounded-xl border border-white/5 space-y-2">
                 <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase tracking-widest font-black">
                   <span>Redução Redundânica</span>
                   <span className="text-emerald-400">Excelente</span>
                 </div>
                 <div className="flex gap-2 w-full pt-1">
                   <div className="h-1.5 bg-red-500/50 rounded-full" style={{ width: `${(metrics.oldLinesTotal / (metrics.oldLinesTotal + metrics.newLinesTotal)) * 100}%` }}></div>
                   <div className="h-1.5 bg-emerald-500/50 rounded-full" style={{ width: `${(metrics.newLinesTotal / (metrics.oldLinesTotal + metrics.newLinesTotal)) * 100}%` }}></div>
                 </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
               <CheckCircle2 className="w-8 h-8 mb-3 text-slate-500" />
               <p className="text-[9px] font-black uppercase tracking-[0.2em] leading-relaxed text-slate-400">
                  Sem telemetria.<br/>Execute o Plano<br/>na Fase 3.
               </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
