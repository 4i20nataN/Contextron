
import React, { useState } from 'react';
import { Zap, RefreshCcw, Settings, Check, Globe, Layout, ShieldCheck, HelpCircle, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ModelType, AppConfig, ProviderType } from '../types';

interface HeaderProps {
  isLoading: boolean;
  onReset: () => void;
  tokenCount?: string;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  fileCount: number;
  refactoredCount: number;
  parsedFilesCount?: number;
  totalBatchFiles?: number;
  activeStep?: string;
  integrityMessage?: string;
}

export const Header: React.FC<HeaderProps> = ({
  isLoading,
  onReset,
  tokenCount,
  config,
  onConfigChange,
  fileCount,
  refactoredCount,
  parsedFilesCount = 0,
  totalBatchFiles = 0,
  activeStep = "01",
  integrityMessage = ''
}) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const googleModels: { id: ModelType; label: string; desc: string }[] = [
    { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro', desc: 'Raciocínio avançado & janela 1M tokens' },
    { id: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash', desc: 'Equilíbrio ideal entre velocidade e inteligência' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Rápido & confiável para análise de código' },
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp', desc: 'Versão experimental com recursos extras' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', desc: 'Janela 2M tokens — projetos gigantes' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Rápido & econômico — 1M tokens' }
  ];

  const providers: { id: ProviderType; label: string; icon: any }[] = [
    { id: 'google', label: 'Google AI', icon: Zap },
    { id: 'openrouter', label: 'OpenRouter', icon: Globe },
    { id: 'custom', label: 'Custom/Local', icon: Layout }
  ];

  const getTempDescription = (temp: number) => {
    if (temp <= 0.3) return "Preciso & Analítico (Ideal para código)";
    if (temp <= 0.6) return "Equilibrado (Foco em clareza)";
    return "Criativo & Variado (Experimental)";
  };

  // Determina o estado de integridade para exibição
  const integrityOk = integrityMessage.includes('OK') || integrityMessage.includes('todos os');
  const integrityWarn = integrityMessage.includes('AVISO');
  const showIntegrity = integrityMessage.length > 0;

  // Contador: após parsing, usa totalBatchFiles; durante loading usa parsedFilesCount
  const displayedCount = totalBatchFiles > 0 ? totalBatchFiles : parsedFilesCount;

  return (
    <header className="h-16 border-b border-white/5 bg-white/5 flex items-center justify-between px-4 md:px-6 z-50 shrink-0 relative">
      <div className="absolute inset-0 backdrop-blur-md z-[-1]" />

      {/* Left: Logo + Title */}
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-white/10">
          <Zap className="w-5 h-5 text-white fill-white/10" />
        </div>
        <div>
          <h1 className="text-[11px] xs:text-sm md:text-lg font-bold tracking-tight flex items-center gap-2">
            MEGA ANALISADOR
            <span className="hidden sm:inline">DE CONTEXTO</span>
            <span className="text-[7px] md:text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 md:px-2 py-0.5 rounded border border-cyan-500/30 uppercase font-mono tracking-tighter shrink-0">
              {config.provider.toUpperCase()}
            </span>
          </h1>
          <p className="hidden xs:flex text-[10px] text-slate-500 font-mono items-center gap-1">
            <span className="hidden sm:inline">CORE LAYER: <span className="text-slate-400">DEEP_SCAN_V8.0</span></span>
            <span className="hidden sm:inline mx-2 text-white/10">|</span>
            MODEL: <span className="text-purple-400">{(config.model as string).split('/').pop()?.toUpperCase()}</span>
          </p>
        </div>
      </div>

      {/* Center: Stats */}
      <div className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-white/5 rounded-lg border border-white/5">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            <span className={isLoading ? 'text-orange-400' : 'text-emerald-400'}>{isLoading ? 'Processando' : 'Online'}</span>
          </span>
        </div>

        <div className="w-px h-3 bg-white/10" />

        {/* File counter: arquivos mapeados / arquivos carregados */}
        <div className="flex items-center gap-2 text-cyan-400">
          <Layout className="w-3 h-3" />
          <span className="text-[10px] font-mono uppercase tracking-widest">
            {displayedCount}/{fileCount} Mapeados
          </span>
          {fileCount > 0 && displayedCount === fileCount && !isLoading && (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" title="Integridade: 100% coberto" />
          )}
          {fileCount > 0 && displayedCount > 0 && displayedCount < fileCount && !isLoading && (
            <AlertTriangle className="w-3 h-3 text-yellow-400" title={`Atenção: ${fileCount - displayedCount} arquivo(s) não mapeado(s)`} />
          )}
        </div>

        <div className="w-px h-3 bg-white/10" />

        <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400">
          {refactoredCount} Fixes
        </span>

        {/* Integrity badge (só exibe após parsing) */}
        {showIntegrity && (
          <>
            <div className="w-px h-3 bg-white/10" />
            <span
              className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                integrityOk
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : integrityWarn
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                  : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
              }`}
              title={integrityMessage}
            >
              {integrityOk ? '✓ INTEGRIDADE OK' : integrityWarn ? '⚠ COBERTURA PARCIAL' : 'VERIFICANDO'}
            </span>
          </>
        )}
      </div>

      {/* Right: Config + Reset */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`p-2 rounded-lg border transition-all ${isConfigOpen ? 'bg-cyan-500/10 border-cyan-500/30 text-white' : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'}`}
          >
            <Settings className="w-4 h-4" />
          </button>

          {isConfigOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/60 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-opacity"
                onClick={() => setIsConfigOpen(false)}
              />
              <div
                className="relative w-full max-w-sm bg-[#0d1117] border border-white/10 rounded-2xl shadow-3xl p-5 overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5" /> Engine System
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[8px] font-mono text-cyan-400">v8.0</div>
                    <button onClick={() => setIsConfigOpen(false)} className="p-1 text-slate-500 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Provider Selection */}
                  <div>
                    <label className="text-[9px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Provedor de IA</label>
                    <div className="grid grid-cols-3 gap-2">
                      {providers.map(p => {
                        const Icon = p.icon;
                        return (
                          <button
                            key={p.id}
                            onClick={() => onConfigChange({ ...config, provider: p.id, model: p.id === 'google' ? 'gemini-2.0-flash-exp' : config.model })}
                            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${config.provider === p.id ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-white/5 border-transparent text-slate-500 hover:bg-white/10'}`}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="text-[8px] font-bold uppercase">{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div>
                    {config.provider === 'google' ? (
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Modelo Google</label>
                        {googleModels.map(m => (
                          <button
                            key={m.id}
                            onClick={() => onConfigChange({ ...config, model: m.id })}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all ${config.model === m.id ? 'bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.05)]' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[10px] font-bold ${config.model === m.id ? 'text-cyan-400' : 'text-slate-300'}`}>{m.label}</span>
                              {config.model === m.id && <ShieldCheck className="w-3 h-3 text-cyan-400" />}
                            </div>
                            <p className="text-[8px] text-slate-500 mt-0.5 leading-tight">{m.desc}</p>
                          </button>
                        ))}
                        <div className="pt-2 border-t border-white/5 mt-2">
                          <label className="text-[9px] uppercase font-bold text-slate-500 mb-1 block">Custom ID</label>
                          <input
                            type="text"
                            placeholder="gemini-2.0-flash-exp"
                            value={config.model}
                            onChange={(e) => onConfigChange({ ...config, model: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-cyan-300 focus:outline-none focus:border-cyan-500/50 font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[9px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Model ID</label>
                          <input
                            type="text"
                            placeholder={config.provider === 'openrouter' ? "anthropic/claude-3.5-sonnet" : "llama3"}
                            value={config.model}
                            onChange={(e) => onConfigChange({ ...config, model: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 focus:outline-none focus:border-cyan-500/50 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Base URL (Opcional)</label>
                          <input
                            type="text"
                            placeholder={config.provider === 'openrouter' ? "Default (OpenRouter)" : "http://localhost:11434/v1"}
                            value={config.baseUrl || ''}
                            onChange={(e) => onConfigChange({ ...config, baseUrl: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 focus:outline-none focus:border-cyan-500/50 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-black text-slate-500 mb-2 block tracking-widest">API Key</label>
                          <input
                            type="password"
                            placeholder="sk-..."
                            value={config.apiKey || ''}
                            onChange={(e) => onConfigChange({ ...config, apiKey: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 focus:outline-none focus:border-cyan-500/50 font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Temperature */}
                  <div className="pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Neural Temp</label>
                        <div className="group relative">
                          <HelpCircle className="w-3 h-3 text-slate-600" />
                          <div className="absolute left-0 bottom-full mb-2 w-48 bg-black border border-white/10 p-2 rounded-lg text-[8px] text-slate-400 invisible group-hover:visible shadow-2xl z-50">
                            Controla a aleatoriedade. Baixa (0.2) para código estável. Alta (0.8) para exploração criativa.
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-cyan-400">{config.temperature}</span>
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.1"
                      value={config.temperature}
                      onChange={(e) => onConfigChange({ ...config, temperature: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <p className="text-[8px] text-slate-600 mt-2 font-mono italic">{getTempDescription(config.temperature)}</p>
                  </div>

                  {/* Save Button */}
                  <div className="pt-2 border-t border-white/5">
                    <button
                      onClick={() => {
                        localStorage.setItem('context_analyzer_config', JSON.stringify(config));
                        setIsConfigOpen(false);
                      }}
                      className="w-full py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl transition-all duration-300 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Check className="w-3 h-3" /> Salvar Configurações
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-red-500/10 text-slate-300 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-xl transition-all duration-300 group text-[10px] font-bold uppercase tracking-widest"
        >
          <RefreshCcw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500 text-red-500/50" />
          Reset
        </button>
      </div>
    </header>
  );
};
