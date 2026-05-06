import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, FileSearch, Check, ChevronRight, Shuffle, RotateCcw } from 'lucide-react';
import { Document } from '../types';
import { FileTree } from './FileTree';

interface ReAnalysisModalProps {
  uncoveredFiles: Document[];
  allDocuments: Document[];
  onFullReanalysis: () => void;
  onSupplementalAnalysis: (files: Document[]) => void;
  onCancel: () => void;
}

type ModalMode = 'choose' | 'select-uncovered' | 'select-hybrid' | 'select-repeat';

export const ReAnalysisModal: React.FC<ReAnalysisModalProps> = ({
  uncoveredFiles,
  allDocuments,
  onFullReanalysis,
  onSupplementalAnalysis,
  onCancel,
}) => {
  const [mode, setMode] = useState<ModalMode>('choose');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(uncoveredFiles.map(f => f.id))
  );

  const coveredFiles = useMemo(() =>
    allDocuments.filter(d => !uncoveredFiles.find(u => u.id === d.id)),
    [allDocuments, uncoveredFiles]
  );

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (pool: Document[]) => {
    const allSelected = pool.every(f => selectedIds.has(f.id));
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(pool.map(f => f.id)));
  };

  // For FileTree toggle compatibility
  const handleTreeToggle = (ids: string[], selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => selected ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const handleConfirm = () => {
    let pool: Document[] = [];
    if (mode === 'select-hybrid') pool = allDocuments;
    else if (mode === 'select-repeat') pool = coveredFiles;
    else pool = uncoveredFiles;
    const selected = pool.filter(f => selectedIds.has(f.id));
    if (selected.length === 0) return;
    onSupplementalAnalysis(selected);
  };

  const enterUncoveredMode = () => {
    setSelectedIds(new Set(uncoveredFiles.map(f => f.id)));
    setMode('select-uncovered');
  };

  const enterHybridMode = () => {
    setSelectedIds(new Set(allDocuments.map(f => f.id)));
    setMode('select-hybrid');
  };

  const enterRepeatMode = () => {
    setSelectedIds(new Set(coveredFiles.map(f => f.id)));
    setMode('select-repeat');
  };

  // Simple file list for uncovered mode
  const SimpleFileList = ({ files, emptyMsg }: { files: Document[]; emptyMsg: string }) => (
    files.length === 0 ? (
      <p className="text-[9px] font-mono text-slate-600 text-center py-3">{emptyMsg}</p>
    ) : (
      <>
        {files.map(file => {
          const selected = selectedIds.has(file.id);
          return (
            <label
              key={file.id}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(file.id)}
                className="w-3 h-3 accent-cyan-500 cursor-pointer shrink-0"
              />
              <span className={`text-[9px] font-mono truncate flex-1 min-w-0 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                {file.name}
              </span>
              <span className="text-[8px] font-mono text-slate-700 shrink-0">
                {(file.size / 1024).toFixed(1)}K
              </span>
            </label>
          );
        })}
      </>
    )
  );

  const selectedCount = (() => {
    if (mode === 'select-hybrid') return allDocuments.filter(f => selectedIds.has(f.id)).length;
    if (mode === 'select-repeat') return coveredFiles.filter(f => selectedIds.has(f.id)).length;
    return uncoveredFiles.filter(f => selectedIds.has(f.id)).length;
  })();

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#02040a]/90 backdrop-blur-md">
      <div className={`bg-[#0b0e14] border border-white/10 rounded-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden ${
        mode === 'select-hybrid' ? 'max-w-2xl' : 'max-w-md'
      }`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <FileSearch className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-white">Fase 1 já executada</h2>
              <p className="text-[9px] text-slate-500 font-mono">Como deseja prosseguir?</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ─── CHOOSE MODE ─── */}
        {mode === 'choose' && (
          <div className="p-5 flex flex-col gap-3">

            {/* Uncovered only */}
            {uncoveredFiles.length > 0 ? (
              <button
                onClick={enterUncoveredMode}
                className="w-full p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <FileSearch className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-cyan-300 uppercase tracking-wider">
                        Analisar não-mapeados
                      </p>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono mt-1 leading-relaxed">
                      {uncoveredFiles.length} arquivo(s) ficaram fora. Analisa só esses sem reiniciar tudo.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[8px] font-mono bg-slate-500/10 border border-slate-500/20 text-slate-400 px-1.5 py-0.5 rounded">⬛ CINZA = sem nexo</span>
                      <span className="text-[8px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">🟢 VERDE = arquivo OK</span>
                    </div>
                  </div>
                </div>
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                <p className="text-[10px] text-emerald-400 font-mono">✓ Cobertura 100% — todos os arquivos foram mapeados.</p>
              </div>
            )}

            {/* Hybrid — folder tree */}
            <button
              onClick={enterHybridMode}
              className="w-full p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/10 transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                <Shuffle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-purple-300 uppercase tracking-wider">
                      Escolha personalizada — Árvore
                    </p>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 transition-colors" />
                  </div>
                  <p className="text-[9px] text-slate-400 font-mono mt-1 leading-relaxed">
                    Selecione via árvore de pastas — qualquer combinação dos {allDocuments.length} arquivos.
                  </p>
                </div>
              </div>
            </button>

            {/* Repeat analysis — re-select already analyzed files */}
            {coveredFiles.length > 0 && (
              <button
                onClick={enterRepeatMode}
                className="w-full p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10 transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <RotateCcw className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-amber-300 uppercase tracking-wider">
                        Repetir Análise
                      </p>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono mt-1 leading-relaxed">
                      Escolha quais arquivos já analisados ({coveredFiles.length}) deseja reanalisar novamente.
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* Full re-analysis */}
            <button
              onClick={onFullReanalysis}
              className="w-full p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 hover:border-orange-500/40 hover:bg-orange-500/10 transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <RefreshCw className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black text-orange-300 uppercase tracking-wider">Reanalisar tudo do zero</p>
                  <p className="text-[9px] text-slate-400 font-mono mt-1 leading-relaxed">
                    Descarta lotes existentes e reinicia Fase 1 com os arquivos selecionados.
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={onCancel}
              className="w-full py-2.5 rounded-xl border border-white/5 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ─── SELECT UNCOVERED MODE (simple list) ─── */}
        {mode === 'select-uncovered' && (
          <div className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400 font-mono">
                Arquivos não mapeados ({uncoveredFiles.length}):
              </p>
              <button onClick={() => toggleAll(uncoveredFiles)} className="text-[9px] font-mono text-cyan-500/70 hover:text-cyan-400 transition-colors">
                {uncoveredFiles.every(f => selectedIds.has(f.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>

            <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto custom-scrollbar bg-black/20 rounded-xl p-2 border border-white/5">
              <SimpleFileList files={uncoveredFiles} emptyMsg="Nenhum arquivo não coberto." />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setMode('choose')}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedCount === 0}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-[9px] font-bold uppercase tracking-widest text-cyan-300 hover:bg-cyan-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                Analisar {selectedCount}
              </button>
            </div>
          </div>
        )}

        {/* ─── SELECT HYBRID MODE (folder tree) ─── */}
        {mode === 'select-hybrid' && (
          <div className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-purple-300 font-mono font-bold">
                Escolha personalizada — {selectedCount} selecionado(s)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[8px] font-mono text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Limpar
                </button>
                <button
                  onClick={() => setSelectedIds(new Set(allDocuments.map(f => f.id)))}
                  className="text-[8px] font-mono text-purple-500/70 hover:text-purple-400 transition-colors"
                >
                  Todos
                </button>
              </div>
            </div>

            {/* Folder Tree */}
            <div className="max-h-[360px] overflow-y-auto custom-scrollbar bg-black/20 rounded-xl p-3 border border-white/5">
              <FileTree
                documents={allDocuments}
                selectedIds={selectedIds}
                onToggle={handleTreeToggle}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setMode('choose')}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedCount === 0}
                className="flex-1 py-2.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-[9px] font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                Analisar {selectedCount}
              </button>
            </div>
          </div>
        )}

        {/* ─── SELECT REPEAT MODE (covered files) ─── */}
        {mode === 'select-repeat' && (
          <div className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-amber-300 font-mono font-bold">
                Repetir Análise — {selectedCount} selecionado(s)
              </p>
              <button onClick={() => toggleAll(coveredFiles)} className="text-[9px] font-mono text-amber-500/70 hover:text-amber-400 transition-colors">
                {coveredFiles.every(f => selectedIds.has(f.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>

            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-[9px] text-amber-300/80 font-mono leading-relaxed">
              ℹ Estes arquivos já foram analisados. Selecione quais deseja incluir na nova rodada.
            </div>

            <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto custom-scrollbar bg-black/20 rounded-xl p-2 border border-white/5">
              <SimpleFileList files={coveredFiles} emptyMsg="Nenhum arquivo analisado anteriormente." />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setMode('choose')}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedCount === 0}
                className="flex-1 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold uppercase tracking-widest text-amber-300 hover:bg-amber-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                Reanalisar {selectedCount}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
