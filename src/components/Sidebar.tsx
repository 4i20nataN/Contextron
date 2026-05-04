
import React from 'react';
import { Upload, FileArchive, FileText, Activity, Clock, Terminal, BookOpen } from 'lucide-react';
import { Document, AppConfig } from '../types';

interface SidebarProps {
  documents: Document[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  activeStep: string;
  onStepClick: (stepId: string) => void;
  isLoading: boolean;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onSkillUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  documents, 
  onUpload, 
  activeStep, 
  onStepClick, 
  isLoading,
  config,
  onConfigChange,
  onSkillUpload
}) => {
  const steps = [
    { 
      label: "Análise Completa", 
      id: "01",
      desc: "FASE 1: Reconhcimento profundo. Mapeia e segmenta a base em LOTÉIS técnicos."
    },
    { 
      label: "Plano M2M Refactor", 
      id: "02",
      desc: "FASE 2: Transforma análise em PLANO DE AÇÃO com logs de severidade e impacto."
    },
    { 
      label: "Executar Correção", 
      id: "03",
      desc: "FASE 3: FIX exaustivo. Execução granular com review de diff e aprovação."
    }
  ];

  return (
    <section className="w-full lg:w-72 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0 min-w-0 min-h-[500px] lg:min-h-0">
      {/* Upload Zone */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Fonte de Dados</h2>
        </div>
        
        <label className="group relative cursor-pointer">
          <input type="file" multiple className="hidden" onChange={onUpload} accept=".zip, .txt, .md, .js, .ts, .tsx, .py, .java, .cpp" />
          <div className="border-2 border-dashed border-white/10 group-hover:border-cyan-500/50 rounded-xl p-6 flex flex-col items-center gap-3 transition-all bg-white/5 group-hover:bg-cyan-500/5">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileArchive className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">Upload de Base</p>
              <p className="text-[8px] text-slate-500 font-medium">ZIP ou Arquivos Individuais</p>
            </div>
          </div>
        </label>

        {documents.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
            {documents.slice(0, 5).map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-cyan-500/20 transition-all font-mono text-[9px]">
                <div className="flex items-center gap-2 truncate">
                  <FileText className={`w-3 h-3 shrink-0 ${doc.isRefactored ? 'text-emerald-400' : 'text-cyan-500'}`} />
                  <span className={`truncate ${doc.isRefactored ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>{doc.name}</span>
                </div>
              </div>
            ))}
            {documents.length > 5 && (
              <p className="text-[9px] text-center text-slate-500 mt-1">+{documents.length - 5} arquivos...</p>
            )}
          </div>
        )}
      </div>

      {/* Coding Skills / Injector */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Skill Injector</h2>
          </div>
          <label className="cursor-pointer p-1 hover:bg-white/5 rounded transition-all">
            <input type="file" multiple className="hidden" onChange={onSkillUpload} accept=".zip, .md, .txt" />
            <Upload className="w-3 h-3 text-slate-500 hover:text-emerald-400" />
          </label>
        </div>

        <textarea 
          placeholder="Injetar técnicas manuais..."
          value={config.skills}
          onChange={(e) => onConfigChange({ ...config, skills: e.target.value })}
          className="w-full h-20 bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all font-mono resize-none"
        />

        {config.skillDocuments.length > 0 && (
          <div className="flex flex-col gap-1 max-h-[80px] overflow-y-auto custom-scrollbar p-1 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
            {config.skillDocuments.map((doc, idx) => (
              <div key={idx} className="flex items-center gap-2 text-[9px] font-mono text-emerald-400/70 truncate">
                <Terminal className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{doc.name}</span>
              </div>
            ))}
          </div>
        )}
        
        <p className="text-[8px] text-slate-500 font-mono leading-tight">Arquivos .md ou .zip injetados aqui definem as REGRAS MESTRAS do agente.</p>
      </div>

      {/* Processing Flow */}
      <div className="bg-[#0b0e14] border border-white/5 rounded-2xl p-4 flex flex-col gap-4 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Fluxo de Processamento</h2>
        </div>

        <div className="flex flex-col gap-3">
          {steps.map((step) => (
            <button
              key={step.id}
              onClick={() => onStepClick(step.id)}
              disabled={isLoading || documents.length === 0}
              className={`text-left p-4 rounded-xl border transition-all relative overflow-hidden group ${
                activeStep === step.id 
                  ? 'bg-cyan-500/10 border-cyan-500/40' 
                  : 'bg-white/5 border-white/10 hover:border-white/20 opacity-60 hover:opacity-100'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-black font-mono ${activeStep === step.id ? 'text-cyan-400' : 'text-slate-500'}`}>{step.id}</span>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${activeStep === step.id ? 'text-cyan-400' : 'text-slate-400'}`}>{step.label}</span>
              </div>
              <p className="text-[9px] leading-relaxed text-slate-500 group-hover:text-slate-400 transition-colors italic">
                {step.desc}
              </p>
              {activeStep === step.id && (
                <div className="absolute bottom-0 left-0 h-0.5 bg-cyan-500 w-full animate-pulse" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-auto pt-4 border-t border-white/5">
          <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-tighter">Estimativa M2M</span>
            </div>
            <p className="text-[8px] text-slate-500 leading-tight">Cálculo de granularidade: ~{documents.length * 5.5}s para análise.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
