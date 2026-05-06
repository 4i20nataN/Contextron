import React, { useState } from 'react';
import { Upload, FileArchive, BookOpen, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { Document, AppConfig } from '../types';
import { FileTree } from './FileTree';

interface SidebarProps {
  documents: Document[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onSkillUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedDocIds: Set<string>;
  onToggleDocSelection: (ids: string[], selected: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  onUpload,
  isLoading,
  config,
  onConfigChange,
  onSkillUpload,
  selectedDocIds,
  onToggleDocSelection,
}) => {
  const [skillsExpanded, setSkillsExpanded] = useState(false);

  return (
    <section className="w-full lg:w-80 flex flex-col gap-3 overflow-y-auto custom-scrollbar shrink-0 min-w-0 min-h-[300px] lg:min-h-0">

      {/* Upload + File Tree */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl p-4 flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Fonte de Dados</h2>
          {documents.length > 0 && (
            <span className="ml-auto text-[9px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 shrink-0">
              {selectedDocIds.size}/{documents.length}
            </span>
          )}
        </div>

        {/* Drop zone */}
        <label className="group relative cursor-pointer shrink-0">
          <input
            type="file"
            multiple
            className="hidden"
            onChange={onUpload}
            disabled={isLoading}
            accept=".zip,.txt,.md,.mdx,.json,.csv,.log,.js,.ts,.tsx,.jsx,.py,.java,.cpp,.c,.h,.html,.css,.scss,.xml,.yaml,.yml,.sql,.sh,.env,.toml,.lock,.prisma,.graphql,.rs,.go,.rb,.php,.vue,.svelte"
          />
          <div className={`border-2 border-dashed rounded-xl px-4 py-3 flex items-center gap-3 transition-all ${
            isLoading
              ? 'border-white/5 bg-white/2 opacity-50 cursor-not-allowed'
              : 'border-white/10 group-hover:border-cyan-500/50 bg-white/5 group-hover:bg-cyan-500/5'
          }`}>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <FileArchive className="w-4 h-4 text-slate-400 group-hover:text-cyan-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">
                {documents.length > 0 ? 'Adicionar mais arquivos' : 'Upload de Base'}
              </p>
              <p className="text-[8px] text-slate-500 font-medium">ZIP ou arquivos individuais</p>
            </div>
          </div>
        </label>

        {/* File tree */}
        {documents.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-black/20 rounded-xl border border-white/5 p-2">
            <FileTree
              documents={documents}
              selectedIds={selectedDocIds}
              onToggle={onToggleDocSelection}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center opacity-20 py-6">
            <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest text-center">
              Nenhum arquivo carregado
            </p>
          </div>
        )}
      </div>

      {/* Skill Injector — compacto, expansível */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl overflow-hidden shrink-0">
        <button
          className="w-full flex items-center justify-between gap-2 p-3 hover:bg-white/5 transition-colors"
          onClick={() => setSkillsExpanded(e => !e)}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Skill Injector</h2>
            {(config.skillDocuments.length > 0 || config.skills.trim()) && (
              <span className="text-[8px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {config.skillDocuments.length > 0 ? `${config.skillDocuments.length} docs` : 'ativo'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer p-1 hover:bg-white/5 rounded transition-all" onClick={e => e.stopPropagation()}>
              <input type="file" multiple className="hidden" onChange={onSkillUpload} accept=".zip,.md,.txt" />
              <Upload className="w-3 h-3 text-slate-500 hover:text-emerald-400" />
            </label>
            {skillsExpanded
              ? <ChevronUp className="w-3 h-3 text-slate-600" />
              : <ChevronDown className="w-3 h-3 text-slate-600" />}
          </div>
        </button>

        {skillsExpanded && (
          <div className="px-3 pb-3 flex flex-col gap-2 border-t border-white/5">
            <textarea
              placeholder="Regras, padrões, técnicas manuais..."
              value={config.skills}
              onChange={(e) => onConfigChange({ ...config, skills: e.target.value })}
              className="w-full h-16 bg-black/40 border border-white/10 rounded-xl p-2.5 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all font-mono resize-none mt-2"
            />
            {config.skillDocuments.length > 0 && (
              <div className="flex flex-col gap-1 max-h-[80px] overflow-y-auto custom-scrollbar p-1.5 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                {config.skillDocuments.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[9px] font-mono text-emerald-400/70 truncate">
                    <Terminal className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[8px] text-slate-600 font-mono leading-tight">
              Arquivos .md ou .zip definem regras mestras nas 3 fases.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
