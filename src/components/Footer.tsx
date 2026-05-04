import React from 'react';
import { Download, Loader2 } from 'lucide-react';

interface FooterProps {
  isLoading: boolean;
  statusText: string;
  onDownload: () => void;
  canDownload: boolean;
  progress?: number;
}

export const Footer: React.FC<FooterProps> = ({ isLoading, statusText, onDownload, canDownload, progress = 0 }) => {
  return (
    <footer className="h-10 md:h-12 border-t border-white/10 bg-black/60 flex items-center justify-between px-4 md:px-8 z-50 backdrop-blur-2xl shrink-0 relative overflow-hidden">
       {/* Global Progress Bar */}
       {progress > 0 && (
         <div 
           className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500 transition-all duration-500 ease-out z-[60]"
           style={{ width: `${progress}%`, boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)' }}
         />
       )}

       <div className="flex gap-4 md:gap-6 items-center overflow-hidden">
         <div className="flex items-center gap-2 shrink-0">
           <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-orange-500 animate-pulse' : 'bg-cyan-500 animate-pulse shadow-[0_0_10px_cyan]'}`} />
           <span className="text-[10px] font-mono tracking-[0.2em] text-slate-400 uppercase hidden xs:inline">Core System Ready</span>
         </div>
         <div className="w-px h-3 bg-white/10 hidden sm:block" />
         <span className="text-[10px] font-mono text-slate-500 italic truncate max-w-[200px] sm:max-w-md flex items-center gap-2">
           {isLoading && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin shrink-0" />}
           {isLoading && progress > 0 ? `[${Math.round(progress)}%] ${statusText}` : statusText}
         </span>
       </div>

       <button 
         disabled={!canDownload || isLoading}
         onClick={onDownload}
         className="flex items-center gap-2 bg-gradient-to-r from-cyan-600/20 to-purple-600/20 hover:from-cyan-600/40 hover:to-purple-600/40 disabled:opacity-30 disabled:cursor-not-allowed border border-cyan-500/30 text-cyan-400 px-3 md:px-4 py-1.5 rounded-md text-[9px] md:text-[10px] font-bold tracking-widest uppercase transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
       >
         <Download className="w-3 h-3" />
         <span className="hidden xs:inline">Baixar ZIP Corrigido</span>
         <span className="xs:hidden">Download</span>
       </button>
    </footer>
  );
};
