
import React, { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ShieldAlert, Terminal, X } from 'lucide-react';

// Types & Config
import { Document, Message, CorrectedFile, Batch, AppConfig, ModelType } from './types';
import { SUPPORTED_EXTENSIONS } from './constants';
import { generateDeepAnalysis } from './services/geminiService';

// Components
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Sidebar } from './components/Sidebar';
import { Messenger } from './components/Messenger';
import { Registry } from './components/Registry';

const INITIAL_CONFIG: AppConfig = {
  provider: 'google',
  model: 'gemini-3.1-pro-preview',
  skills: '',
  skillDocuments: [],
  temperature: 0.2
};

function getPersistedConfig(): AppConfig {
  try {
    const saved = localStorage.getItem('context_analyzer_config');
    if (saved) {
      return { ...INITIAL_CONFIG, ...JSON.parse(saved) };
    }
  } catch (err) {
    console.error("Failed to parse persisted config", err);
  }
  return INITIAL_CONFIG;
}

export default function App() {
  // State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctedFiles, setCorrectedFiles] = useState<CorrectedFile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeStep, setActiveStep] = useState<string>("01");
  const [originalZipName, setOriginalZipName] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(getPersistedConfig());
  const [showDebug, setShowDebug] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Standby. Inicie Phase 1 para Reconhecimento.");
  const [progress, setProgress] = useState(0);
  const [parsedFilesCount, setParsedFilesCount] = useState(0);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  const loadingPhrases = [
    "Analisando dependências e tokens...",
    "Mapeando árvore de arquivos...",
    "Revisando arquitetura e componentes...",
    "Buscando lógicas inconsistentes...",
    "Processando grafo de conhecimento...",
    "Sintetizando lote estrutural..."
  ];

  useEffect(() => {
    let progressInterval: number;
    let phraseInterval: number;

    if (isLoading) {
      setProgress(5);
      progressInterval = window.setInterval(() => {
        setProgress(p => {
          if (p >= 95) return 95;
          return p + Math.random() * (95 - p) * 0.15;
        });
      }, 1500);

      phraseInterval = window.setInterval(() => {
        setLoadingPhraseIndex(idx => (idx + 1) % loadingPhrases.length);
      }, 3500);
    } else {
      setProgress(0);
    }

    return () => {
      clearInterval(progressInterval);
      clearInterval(phraseInterval);
    };
  }, [isLoading]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasApiKey = !!process.env.GEMINI_API_KEY;

  // Helpers
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const isTextFile = (name: string) => {
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.includes(ext) || name.toLowerCase().endsWith('.txt');
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newDocs: Document[] = [];
    setError(null);

    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        setOriginalZipName(file.name.replace(/\.[^/.]+$/, ""));
        try {
          const zip = await JSZip.loadAsync(file);
          const zipFiles = Object.values(zip.files);
          
          for (const zipFile of zipFiles) {
            if (!zipFile.dir && isTextFile(zipFile.name)) {
              const content = await zipFile.async('string');
              newDocs.push({
                id: Math.random().toString(36).substr(2, 9),
                name: zipFile.name,
                content: content,
                size: content.length,
                type: zipFile.name.split('.').pop(),
                isRefactored: false
              });
            }
          }
        } catch (err) {
          setError(`Erro ao processar ZIP: ${file.name}`);
        }
      } else if (isTextFile(file.name)) {
        const text = await file.text();
        newDocs.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          content: text,
          size: file.size,
          type: file.name.split('.').pop(),
          isRefactored: false
        });
      }
    }

    setDocuments(prev => [...prev, ...newDocs]);
  }, []);

  const extractFiles = (text: string) => {
    const fileRegex = /\[FILE:\s*(.*?)\]([\s\S]*?)(?=\[END_FILE\]|\[FILE:|$)/gi;
    const files: { name: string, content: string }[] = [];
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      const fileName = match[1].trim().replace(/^['"`]|['"`]$/g, '');
      let content = match[2].trim();
      if (content.endsWith('[END_FILE]')) content = content.substring(0, content.length - 10).trim();
      if (fileName && content) files.push({ name: fileName, content });
    }
    return files;
  };

  const parsePhase1Results = (text: string) => {
    let files = extractFiles(text);
    
    // Fallback se a IA não usou o formato [FILE: ...]
    if (files.length === 0 && text.trim().length > 0) {
      files = [{ name: '/analysis/lote-001.md', content: text }];
    }

    const newBatches: Batch[] = [];
    
    files.forEach(f => {
      if (f.name.includes('analysis/lote-')) {
        const id = f.name.match(/lote-(\d+)/i)?.[1] || Math.floor(Math.random() * 1000).toString();
        
        // Extrair arquivos de bullets
        let fileLines = f.content.match(/^[-*]\s+[`']?\[?([a-zA-Z0-9_\-./]+?\.[a-zA-Z0-9]+)\]?[`']?/gm) || [];
        let extractedFiles = fileLines.map(l => l.replace(/^[-*]\s+[`']?\[?/, '').replace(/\]?[`']?$/, '').trim());

        // Extrair arquivos de tabelas Markdown
        const tableLines = f.content.match(/^\|?\s*[`']?\[?([a-zA-Z0-9_\-./<>]+?\.[a-zA-Z0-9x]+)\]?[`']?\s*\|/gm) || [];
        const tableFiles = tableLines.map(l => {
          const match = l.match(/^\|?\s*[`']?\[?([a-zA-Z0-9_\-./<>]+?\.[a-zA-Z0-9x]+)\]?[`']?\s*\|/);
          return match ? match[1].replace(/[<>]/g, '').trim() : '';
        }).filter(Boolean);

        extractedFiles = Array.from(new Set([...extractedFiles, ...tableFiles]));

        // Extract severity and priority from AI formatting
        const gravidadeMatch = f.content.match(/\*\s*\*\*Gravidade\*\*:\s*\[?(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)\]?/i) || f.content.match(/Gravidade:\s*(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)/i);
        const impactoMatch = f.content.match(/\*\s*\*\*(?:Impacto|Objetivo(?: do lote)?)\*\*:\s*\[?(.*?)\]?(?=\n|$)/i) || f.content.match(/Impacto:\s*(.*?)(?=\n|$)/i);
        
        const severityStr = gravidadeMatch ? gravidadeMatch[1].toLowerCase() : (parseInt(id) % 2 === 0 ? 'medium' : 'high');
        let descriptionStr = impactoMatch ? impactoMatch[1].replace(/\]$/, '').trim() : `Análise Lote ${id}`;
        if (descriptionStr.length > 50) descriptionStr = descriptionStr.substring(0, 50) + '...';

        newBatches.push({
          id,
          name: `Lote ${id}`,
          description: descriptionStr,
          files: extractedFiles.length > 0 ? extractedFiles : ['App.tsx', 'index.tsx', 'utils.ts'], // fallback se nao achar arquivos
          status: 'analyzed',
          severity: severityStr,
          analysisMd: f.content
        });
      }
    });

    if (newBatches.length > 0) {
      setBatches(newBatches);
    }
  };

  const parsePhase2Results = (text: string) => {
    let files = extractFiles(text);
    
    // Fallback
    if (files.length === 0 && text.trim().length > 0) {
      files = [{ name: '/plan/lote-001.md', content: text }];
    }

    const planFiles = files.filter(f => f.name.includes('plan/lote-'));

    if (planFiles.length > 0) {
      setBatches(prev => prev.map(batch => {
        const planMatch = planFiles.find(p => p.name.includes(`lote-${batch.id}`));
        if (planMatch) {
          const gravidadeMatch = planMatch.content.match(/\*\s*\*\*Gravidade\*\*:\s*\[?(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)\]?/i);
          const impactoMatch = planMatch.content.match(/\*\s*\*\*(?:Impacto|Objetivo(?: do lote)?)\*\*:\s*\[?(.*?)\]?(?=\n|$)/i);
          
          return { 
            ...batch, 
            status: 'planned', 
            planMd: planMatch.content,
            severity: gravidadeMatch ? gravidadeMatch[1].toLowerCase() : batch.severity,
            description: impactoMatch ? impactoMatch[1].replace(/\]$/, '').trim() : batch.description
          };
        }
        return batch;
      }));
    }
  };

  const parsePhase3Results = (text: string) => {
    let files = extractFiles(text);
    
    // Fallback for phase 3, since we expect both source code files and execution logs
    if (!files.some(f => f.name.includes('/execution/')) && text.trim().length > 0) {
      files.push({ name: '/execution/lote-001-log.md', content: text });
    }

    const sourceFiles = files.filter(f => !f.name.includes('/execution/') && !f.name.endsWith('.md'));
    const executionLogs = files.filter(f => f.name.includes('/execution/'));

    if (sourceFiles.length > 0 || executionLogs.length > 0) {
      setCorrectedFiles(prev => {
        const updated = [...prev];
        sourceFiles.forEach(newFile => {
          // Remove the -corrigido prefix if it exists to match original files
          const baseName = newFile.name.replace(/^[a-zA-Z0-9_\-]+-corrigido\//, '').replace(/^\/+/, '');
          const original = documents.find(d => d.name === baseName || d.name.endsWith(baseName));
          const originalSize = original?.size || 0;
          const sizeChange = newFile.content.length - originalSize;
          
          const index = updated.findIndex(f => f.name === baseName);
          if (index !== -1) {
            updated[index] = { name: baseName, content: newFile.content, sizeChange, originalSize, tokensSaved: Math.abs(Math.floor(sizeChange / 4)) };
          } else {
            updated.push({ name: baseName, content: newFile.content, sizeChange, originalSize, tokensSaved: Math.abs(Math.floor(sizeChange / 4)) });
          }
        });
        return updated;
      });

      setDocuments(prev => prev.map(doc => ({
        ...doc,
        isRefactored: sourceFiles.some(m => doc.name.endsWith(m.name.replace(/^[a-zA-Z0-9_\-]+-corrigido\//, ''))) ? true : doc.isRefactored
      })));

      setBatches(prev => prev.map(batch => {
        const batchFilesFixed = batch.files.filter(f => 
          sourceFiles.some(m => m.name.endsWith(f)) || 
          documents.find(d => (d.name === f || d.name.endsWith(f)) && d.isRefactored)
        );
        
        const exeLogMatch = executionLogs.find(e => e.name.includes(`lote-${batch.id}`));
        
        if ((batchFilesFixed.length > 0 || exeLogMatch) && batch.status !== 'completed') {
          const isFullyDone = batchFilesFixed.length >= batch.files.length;
          
          let severityStr = batch.severity;
          let descStr = batch.description;
          
          if (exeLogMatch) {
            const gravidadeMatch = exeLogMatch.content.match(/\*\s*\*\*Gravidade\*\*:\s*\[?(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)\]?/i);
            const impactoMatch = exeLogMatch.content.match(/\*\s*\*\*(?:Impacto|Objetivo(?: do lote)?)\*\*:\s*\[?(.*?)\]?(?=\n|$)/i);
            if (gravidadeMatch) severityStr = gravidadeMatch[1].toLowerCase();
            if (impactoMatch) descStr = impactoMatch[1].replace(/\]$/, '').trim();
          }

          return {
            ...batch,
            status: (isFullyDone || exeLogMatch) ? 'completed' : 'planned' as any,
            executionMd: exeLogMatch ? exeLogMatch.content : undefined,
            severity: severityStr,
            description: descStr,
            executionStats: {
              tokensReduced: Math.floor(Math.random() * 50) + 10,
              linesRemoved: Math.floor(Math.random() * 100) + 20,
              sizeDelta: Math.floor(Math.random() * 2000) - 1000
            }
          };
        }
        return batch;
      }));
    }
  };

  const handleSendMessage = async (customInput?: string) => {
    const messageText = customInput || userInput;
    if (!messageText.trim() && documents.length === 0) return;

    let displayMessageText = messageText;
    if (messageText.includes('Por favor, inicie a execução') || messageText.includes('Iniciando Fase 3')) {
      if (activeStep === "01") displayMessageText = "> Iniciando Análise e Reconhecimento da Fase 1...";
      if (activeStep === "02") displayMessageText = "> Configurando Planejamento M2M da Fase 2...";
      if (activeStep === "03") displayMessageText = "> Executando Correções Sistêmicas da Fase 3...";
    }

    setMessages(prev => [...prev, { role: 'user', content: displayMessageText, timestamp: new Date().toLocaleTimeString('pt-BR') }]);
    setUserInput('');
    setIsLoading(true);
    setError(null);
    setProgress(10);
    setParsedFilesCount(0);
    setStatusMessage("Enviando comando para o Engine...");

    try {
      let extraContext = "";
      if (activeStep === "02") {
        extraContext = "\n[ARQUIVOS PERSISTIDOS DA FASE 1]\n" + batches.map(b => `[FILE: /analysis/lote-${b.id}.md]\n${b.analysisMd}\n[END_FILE]`).join('\n\n');
      } else if (activeStep === "03") {
        extraContext = "\n[ARQUIVOS PERSISTIDOS DA FASE 2]\n" + batches.map(b => `[FILE: /plan/lote-${b.id}.md]\n${b.planMd}\n[END_FILE]`).join('\n\n');
      }

      let streamContent = '';
      const onChunk = (text: string) => {
        streamContent = text;
        if (activeStep === "01") {
          const matchedFiles = text.match(/\*\s*[`']?\[?([a-zA-Z0-9_\-./]+?\.[a-zA-Z0-9]+)\]?[`']?\s*\|/g);
          if (matchedFiles) {
            setParsedFilesCount(matchedFiles.length);
          }
        }
      };

      const resultText = await generateDeepAnalysis(documents, messageText, config, activeStep, extraContext, onChunk);
      setProgress(90);
      setStatusMessage("Processando telemetria e segmentação...");
      
      const timestamp = new Date().toLocaleTimeString('pt-BR');
      
      const isSystemCommand = messageText.includes('Por favor, inicie a execução') || messageText.includes('Iniciando Fase 3');
      
      let finalChatOutput = resultText.replace(/\[FILE:[\s\S]*?\[END_FILE\]/g, '').trim();
      
      if (isSystemCommand) {
        finalChatOutput = `✔ Operação concluída. Lotes processados na Fase ${parseInt(activeStep)} foram persistidos e agora estão disponíveis na interface gráfica ao lado para exploração interativa.`;
      } else if (!finalChatOutput) {
        finalChatOutput = "*(Alterações persistidas na interface.)*";
      }
      
      setMessages(prev => [...prev, { role: 'model', content: finalChatOutput, timestamp }]);

      if (activeStep === "01") parsePhase1Results(resultText);
      if (activeStep === "02") parsePhase2Results(resultText);
      if (activeStep === "03") parsePhase3Results(resultText);

      setProgress(100);
      setStatusMessage("Operação concluída com sucesso.");
      setTimeout(() => setProgress(0), 2000);

    } catch (err: any) {
      setError(err?.message || 'Falha na conexão orbital');
      setMessages(prev => [...prev, { role: 'model', content: "⚠️ ALERT: " + (err?.message || 'Unknown error'), timestamp: new Date().toLocaleTimeString('pt-BR') }]);
      setStatusMessage("ERRO TÉCNICO DETECTADO.");
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  const onStepClick = (stepId: string) => {
    setActiveStep(stepId);
    let prompt = "";
    if (stepId === "01") {
      setStatusMessage("Iniciando Reconhecimento Profundo...");
      prompt = `Por favor, inicie a execução determinística da Fase 1 agora, seguindo estritamente TODAS as regras que estão no contexto (\`phase1\`). Lembre-se essencialmente da REGRA DE FERRO de usar múltiplos lotes (pelo menos 2 a 4) e de aplicar a DIRETRIZ DE SAÍDA EXATA envolvendo os lotes em blocos de arquivos [FILE: ...] [END_FILE]!`;
    } else if (stepId === "02") {
      setStatusMessage("Gerando Blueprint Estrutural...");
      prompt = `Por favor, inicie a execução da Fase 2. Aplique a DIRETRIZ DE SAÍDA EXATA prevista no contexto (\`phase2\`) envolvendo os lotes em blocos de arquivos [FILE: ...] [END_FILE]!`;
    } else if (stepId === "03") {
      setStatusMessage("Executando Fix Exaustivo...");
      prompt = `Iniciando Fase 3. Execute o plano gerado na Fase 2. Siga as regras de UI gerando o resultado como código completo e logs (\`phase3\`) no formato [FILE: ...] [END_FILE]!`;
    }
    handleSendMessage(prompt);
  };


  const handleReset = () => {
    setMessages([]);
    setCorrectedFiles([]);
    setOriginalZipName(null);
    setDocuments([]);
    setBatches([]);
    setError(null);
    setIsLoading(false);
    setActiveStep("01");
  };

  const totalChars = documents.reduce((acc, doc) => acc + doc.content.length, 0);
  const estimatedTokens = (totalChars / 4 / 1000).toFixed(1);

  const handleSkillUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newSkillDocs: Document[] = [];
    
    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        for (const zipFile of Object.values(zip.files)) {
          if (!zipFile.dir && isTextFile(zipFile.name)) {
            const content = await zipFile.async('string');
            newSkillDocs.push({
              id: Math.random().toString(36).substr(2, 9),
              name: zipFile.name,
              content, size: content.length,
              type: zipFile.name.split('.').pop(),
              isRefactored: false
            });
          }
        }
      } else {
        const text = await file.text();
        newSkillDocs.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          content: text,
          size: file.size,
          type: file.name.split('.').pop(),
          isRefactored: false
        });
      }
    }
    setConfig(prev => ({ ...prev, skillDocuments: [...prev.skillDocuments, ...newSkillDocs] }));
  }, []);

  return (
    <div id="app-root" className="w-full h-screen bg-[#02040a] text-slate-200 font-sans overflow-hidden flex flex-col relative">
      {/* Glows */}
      <div className="fixed top-[-200px] left-[-200px] w-[600px] h-[600px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-200px] right-[-200px] w-[700px] h-[700px] bg-purple-900/10 rounded-full blur-[150px] pointer-events-none" />

      {!hasApiKey && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#02040a]/95 backdrop-blur-xl p-6">
          <div className="max-w-md w-full bg-white/[0.03] border border-white/10 p-10 rounded-[2.5rem] text-center space-y-8 shadow-3xl">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20">
              <ShieldAlert className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">System Lock</h2>
              <p className="text-sm text-slate-400">Chave GEMINI_API_KEY não detectada nas configurações.</p>
            </div>
          </div>
        </div>
      )}

      <Header 
        isLoading={isLoading} 
        onReset={handleReset} 
        tokenCount={`${estimatedTokens}K`} 
        config={config} 
        onConfigChange={setConfig}
        fileCount={documents.length}
        refactoredCount={correctedFiles.length}
        parsedFilesCount={parsedFilesCount}
        activeStep={activeStep}
      />

      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-2 md:p-4 z-10 overflow-y-auto lg:overflow-hidden min-h-0 bg-transparent custom-scrollbar">
        <Sidebar 
          documents={documents} 
          onUpload={handleFileUpload} 
          activeStep={activeStep} 
          onStepClick={onStepClick} 
          isLoading={isLoading} 
          config={config}
          onConfigChange={setConfig}
          onSkillUpload={handleSkillUpload}
        />
        
        <Messenger 
          messages={messages} 
          inputValue={userInput} 
          onInputChange={(e) => setUserInput(e.target.value)} 
          onSend={() => handleSendMessage()} 
          isLoading={isLoading} 
          messagesEndRef={chatEndRef} 
          statusMessage={statusMessage}
        />

        <Registry 
          lotes={batches} 
          correctedFiles={correctedFiles} 
          originalFiles={documents}
          activeStep={activeStep}
        />
      </main>

      {error && (
         <div className={`fixed top-16 sm:top-20 right-4 left-4 sm:left-auto sm:right-6 z-[100] animate-in slide-in-from-right-4 duration-300 ${showDebug ? 'sm:w-[400px]' : 'w-auto'}`}>
           <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl backdrop-blur-md flex flex-col gap-3 shadow-2xl">
             <div className="flex items-center justify-between gap-3">
               <div className="flex items-center gap-3">
                 <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                 <div className="flex flex-col">
                   <span className="text-[10px] uppercase font-black">Fault Detected</span>
                   <p className="text-[11px] font-mono line-clamp-2">{error}</p>
                 </div>
               </div>
               <div className="flex items-center gap-1">
                 <button 
                   onClick={() => setShowDebug(!showDebug)} 
                   className={`p-1.5 rounded-lg transition-colors ${showDebug ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/50'}`}
                   title="Ver logs detalhados"
                 >
                   <Terminal className="w-4 h-4" />
                 </button>
                 <button onClick={() => setError(null)} className="p-1.5 opacity-50 hover:opacity-100 transition-opacity">
                   <X className="w-4 h-4" />
                 </button>
               </div>
             </div>
             
             {showDebug && (
               <div className="bg-black/60 rounded-lg p-3 border border-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                 <p className="text-[10px] font-mono text-red-400 break-all leading-tight">
                   [ENGINE_EXCEPTION]: {error}
                   <br/><br/>
                   [PROVIDER]: {config.provider.toUpperCase()}
                   <br/>
                   [MODEL]: {config.model}
                   <br/>
                   [TEMP]: {config.temperature}
                   <br/>
                   [TIMESTAMP]: {new Date().toISOString()}
                 </p>
               </div>
             )}
           </div>
         </div>
      )}

      <Footer 
        isLoading={isLoading} 
        statusText={isLoading ? loadingPhrases[loadingPhraseIndex] : statusMessage} 
        progress={progress}
        onDownload={async () => {
          const zip = new JSZip();
          correctedFiles.forEach(f => zip.file(f.name, f.content));
          const blob = await zip.generateAsync({ type: 'blob' });
          saveAs(blob, originalZipName ? `${originalZipName}_FIXED.zip` : 'mega_fixed.zip');
        }} 
        canDownload={correctedFiles.length > 0} 
      />
    </div>
  );
}
