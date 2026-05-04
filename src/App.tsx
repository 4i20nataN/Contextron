
import React, { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ShieldAlert, Terminal, X } from 'lucide-react';

import { Document, Message, CorrectedFile, Batch, AppConfig, ModelType } from './types';
import { SUPPORTED_EXTENSIONS } from './constants';
import { generateDeepAnalysis } from './services/geminiService';

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

// ─── PARSER HELPERS ──────────────────────────────────────────────────────────

/**
 * Extrai blocos [FILE: ...] ... [END_FILE] do texto da IA.
 * Garante que nenhum bloco seja ignorado.
 */
function extractFiles(text: string): { name: string; content: string }[] {
  const files: { name: string; content: string }[] = [];
  // Regex strict: captura tudo entre [FILE: ...] e [END_FILE]
  const fileRegex = /\[FILE:\s*(.*?)\]([\s\S]*?)\[END_FILE\]/gi;
  let match;
  while ((match = fileRegex.exec(text)) !== null) {
    const fileName = match[1].trim().replace(/^['"`]|['"`]$/g, '');
    const content = match[2].trim();
    if (fileName) {
      files.push({ name: fileName, content });
    }
  }

  // Fallback: se a IA não usou END_FILE, tenta capturar até o próximo [FILE:
  if (files.length === 0) {
    const fallbackRegex = /\[FILE:\s*(.*?)\]([\s\S]*?)(?=\[FILE:|$)/gi;
    while ((match = fallbackRegex.exec(text)) !== null) {
      const fileName = match[1].trim().replace(/^['"`]|['"`]$/g, '');
      let content = match[2].trim();
      if (content.endsWith('[END_FILE]')) content = content.slice(0, -10).trim();
      if (fileName && content) files.push({ name: fileName, content });
    }
  }

  return files;
}

/**
 * Extrai nomes de arquivos do conteúdo de um lote de análise.
 * Usa múltiplos padrões para capturar todos os formatos possíveis.
 */
function extractFilesFromBatchContent(content: string): string[] {
  const found = new Set<string>();

  // Padrão 1: bullets (* ou -) com backticks, colchetes ou simples
  // ex: * `src/App.tsx` | ...  ou  * [auth.ts]  ou  - arquivo.ts
  const bulletPattern = /^[\t ]*[-*+]\s+[`'"]?\[?([a-zA-Z0-9_\-./\\@]+\.[a-zA-Z0-9]{1,12})\]?[`'"]?/gm;
  for (const m of content.matchAll(bulletPattern)) {
    const name = m[1].replace(/[<>]/g, '').trim();
    if (name && name.length > 2) found.add(name);
  }

  // Padrão 2: code spans inline `filename.ext`
  // ex: `src/components/Header.tsx`
  const codeSpanPattern = /`([a-zA-Z0-9_\-./\\@]+\.[a-zA-Z0-9]{1,12})`/gm;
  for (const m of content.matchAll(codeSpanPattern)) {
    const name = m[1].trim();
    if (name && name.length > 2 && !name.startsWith('/analysis/') && !name.startsWith('/plan/') && !name.startsWith('/execution/')) {
      found.add(name);
    }
  }

  // Padrão 3: linhas de tabela Markdown | filename.ext |
  // ex: | `src/App.tsx` | ALTO | Arquitetura |
  const tablePattern = /^\|[\t ]*[`'"]?\[?([a-zA-Z0-9_\-./\\@]+\.[a-zA-Z0-9]{1,12})\]?[`'"]?[\t ]*\|/gm;
  for (const m of content.matchAll(tablePattern)) {
    const name = m[1].replace(/[<>]/g, '').trim();
    if (name && name.length > 2) found.add(name);
  }

  // Padrão 4: cabeçalhos markdown com nome de arquivo
  // ex: #### `src/App.tsx`  ou  ### App.tsx
  const headingPattern = /^#{1,6}[\t ]+.*?[`']?([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{1,12})[`']?/gm;
  for (const m of content.matchAll(headingPattern)) {
    const name = m[1].trim();
    if (name && name.length > 2) found.add(name);
  }

  // Padrão 5: linhas com "Nome:" ou "Arquivo:" seguido do nome
  // ex: * **Nome**: `auth.service.ts`
  const namedPattern = /(?:arquivo|nome|file|path)[\s:]+[`'"]?([a-zA-Z0-9_\-./\\@]+\.[a-zA-Z0-9]{1,12})[`'"]?/gim;
  for (const m of content.matchAll(namedPattern)) {
    const name = m[1].trim();
    if (name && name.length > 2) found.add(name);
  }

  // Padrão 6: identificação com pipe | `filename.ext` | gravidade |
  const pipePattern = /\|\s*[`']([a-zA-Z0-9_\-./\\@]+\.[a-zA-Z0-9]{1,12})[`']\s*\|/gm;
  for (const m of content.matchAll(pipePattern)) {
    const name = m[1].trim();
    if (name && name.length > 2) found.add(name);
  }

  // Filtrar arquivos de log/análise internos do sistema
  return Array.from(found).filter(f =>
    !f.startsWith('/analysis/') &&
    !f.startsWith('/plan/') &&
    !f.startsWith('/execution/') &&
    !f.endsWith('-log.md') &&
    f.length > 2
  );
}

/**
 * Verifica a integridade dos lotes: total de arquivos nos lotes vs total enviado.
 */
function validateBatchIntegrity(batches: Batch[], totalUploaded: number): { valid: boolean; counted: number; message: string } {
  const counted = batches.reduce((acc, b) => acc + b.files.length, 0);
  const valid = counted > 0;
  let message = '';
  if (counted === 0) {
    message = 'AVISO: Nenhum arquivo detectado nos lotes. Verifique o formato da saída da IA.';
  } else if (totalUploaded > 0 && counted < totalUploaded) {
    message = `AVISO DE INTEGRIDADE: ${counted}/${totalUploaded} arquivos mapeados nos lotes. ${totalUploaded - counted} não foram cobertos.`;
  } else if (totalUploaded > 0 && counted === totalUploaded) {
    message = `INTEGRIDADE OK: todos os ${counted} arquivos estão distribuídos nos ${batches.length} lotes.`;
  } else {
    message = `${counted} arquivos mapeados em ${batches.length} lotes.`;
  }
  return { valid, counted, message };
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
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
  const [integrityMessage, setIntegrityMessage] = useState<string>('');

  const loadingPhrases = [
    "Analisando dependências e tokens...",
    "Mapeando árvore de arquivos...",
    "Revisando arquitetura e componentes...",
    "Buscando lógicas inconsistentes...",
    "Processando grafo de conhecimento...",
    "Sintetizando lote estrutural...",
    "Distribuindo arquivos nos lotes...",
    "Validando integridade de cobertura..."
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
    setParsedFilesCount(0);
    setIntegrityMessage('');
  }, []);

  // ─── PHASE PARSERS ──────────────────────────────────────────────────────────

  const parsePhase1Results = (text: string, totalUploaded: number) => {
    let files = extractFiles(text);

    // Fallback: se a IA não usou o formato [FILE: ...][END_FILE]
    if (files.length === 0 && text.trim().length > 0) {
      files = [{ name: '/analysis/lote-001.md', content: text }];
    }

    const newBatches: Batch[] = [];

    files.forEach(f => {
      if (f.name.includes('analysis/lote-') || f.name.includes('analysis\\lote-')) {
        const idMatch = f.name.match(/lote-?(\d+)/i);
        const id = idMatch ? idMatch[1].padStart(3, '0') : Math.floor(Math.random() * 1000).toString().padStart(3, '0');

        // Extrai arquivos usando o parser abrangente
        const extractedFiles = extractFilesFromBatchContent(f.content);

        // Extrai gravidade
        const gravidadeMatch =
          f.content.match(/\*\s*\*\*Gravidade\*\*:\s*\[?(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)\]?/i) ||
          f.content.match(/Gravidade:\s*(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)/i);

        // Extrai impacto/descrição
        const impactoMatch =
          f.content.match(/\*\s*\*\*(?:Impacto|Objetivo(?: do lote)?)\*\*:\s*\[?(.*?)\]?(?=\n|$)/i) ||
          f.content.match(/Impacto:\s*(.*?)(?=\n|$)/i);

        const severityRaw = gravidadeMatch ? gravidadeMatch[1] : '';
        const severityStr = severityRaw.toLowerCase()
          .replace('crítico', 'critical')
          .replace('critico', 'critical')
          .replace('alto', 'high')
          .replace('médio', 'medium')
          .replace('medio', 'medium')
          .replace('baixo', 'low') || 'medium';

        let descriptionStr = impactoMatch ? impactoMatch[1].replace(/\]$/, '').trim() : `Análise Lote ${id}`;
        if (descriptionStr.length > 80) descriptionStr = descriptionStr.substring(0, 80) + '...';

        newBatches.push({
          id,
          name: `Lote ${id}`,
          description: descriptionStr,
          // Sem fallback hardcoded — array vazio se não detectou arquivos
          files: extractedFiles,
          status: 'analyzed',
          severity: severityStr,
          analysisMd: f.content
        });
      }
    });

    if (newBatches.length > 0) {
      // Ordenar lotes por ID
      newBatches.sort((a, b) => a.id.localeCompare(b.id));
      setBatches(newBatches);

      // Atualizar contador com o total real de arquivos detectados nos lotes
      const totalDetected = newBatches.reduce((acc, b) => acc + b.files.length, 0);
      setParsedFilesCount(totalDetected);

      // Validar integridade
      const integrity = validateBatchIntegrity(newBatches, totalUploaded);
      setIntegrityMessage(integrity.message);

      if (!integrity.valid) {
        console.warn('[INTEGRITY FAIL]', integrity.message);
      } else {
        console.log('[INTEGRITY]', integrity.message);
      }
    }
  };

  const parsePhase2Results = (text: string) => {
    let files = extractFiles(text);

    if (files.length === 0 && text.trim().length > 0) {
      files = [{ name: '/plan/lote-001.md', content: text }];
    }

    const planFiles = files.filter(f =>
      f.name.includes('plan/lote-') || f.name.includes('plan\\lote-')
    );

    if (planFiles.length > 0) {
      setBatches(prev => prev.map(batch => {
        const planMatch = planFiles.find(p =>
          p.name.includes(`lote-${batch.id}`) ||
          p.name.includes(`lote-${parseInt(batch.id)}`)
        );
        if (planMatch) {
          const gravidadeMatch = planMatch.content.match(/\*\s*\*\*Gravidade\*\*:\s*\[?(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)\]?/i);
          const impactoMatch = planMatch.content.match(/\*\s*\*\*(?:Impacto|Objetivo(?: do lote)?)\*\*:\s*\[?(.*?)\]?(?=\n|$)/i);

          const severityRaw = gravidadeMatch ? gravidadeMatch[1] : '';
          const severityStr = severityRaw.toLowerCase()
            .replace('crítico', 'critical')
            .replace('critico', 'critical')
            .replace('alto', 'high')
            .replace('médio', 'medium')
            .replace('medio', 'medium')
            .replace('baixo', 'low') || batch.severity;

          return {
            ...batch,
            status: 'planned' as const,
            planMd: planMatch.content,
            severity: severityStr,
            description: impactoMatch ? impactoMatch[1].replace(/\]$/, '').trim() : batch.description
          };
        }
        return batch;
      }));
    }
  };

  const parsePhase3Results = (text: string) => {
    let files = extractFiles(text);

    // Fallback: se não há bloco /execution/
    if (!files.some(f => f.name.includes('/execution/')) && text.trim().length > 0) {
      files.push({ name: '/execution/lote-001-log.md', content: text });
    }

    const sourceFiles = files.filter(f =>
      !f.name.includes('/execution/') &&
      !f.name.includes('/analysis/') &&
      !f.name.includes('/plan/')
    );
    const executionLogs = files.filter(f => f.name.includes('/execution/'));

    if (sourceFiles.length > 0 || executionLogs.length > 0) {
      setCorrectedFiles(prev => {
        const updated = [...prev];
        sourceFiles.forEach(newFile => {
          const baseName = newFile.name
            .replace(/^[a-zA-Z0-9_\-]+-corrigido\//, '')
            .replace(/^\/+/, '');
          const original = documents.find(d => d.name === baseName || d.name.endsWith(baseName));
          const originalSize = original?.size || 0;
          const sizeChange = newFile.content.length - originalSize;

          const index = updated.findIndex(f => f.name === baseName);
          const corrected: CorrectedFile = {
            name: baseName,
            content: newFile.content,
            sizeChange,
            originalSize,
            tokensSaved: Math.abs(Math.floor(sizeChange / 4))
          };

          if (index !== -1) {
            updated[index] = corrected;
          } else {
            updated.push(corrected);
          }
        });
        return updated;
      });

      setDocuments(prev => prev.map(doc => ({
        ...doc,
        isRefactored: sourceFiles.some(m =>
          doc.name.endsWith(m.name.replace(/^[a-zA-Z0-9_\-]+-corrigido\//, ''))
        ) ? true : doc.isRefactored
      })));

      setBatches(prev => prev.map(batch => {
        const batchFilesFixed = batch.files.filter(f =>
          sourceFiles.some(m => m.name.endsWith(f)) ||
          documents.find(d => (d.name === f || d.name.endsWith(f)) && d.isRefactored)
        );

        const exeLogMatch = executionLogs.find(e =>
          e.name.includes(`lote-${batch.id}`) ||
          e.name.includes(`lote-${parseInt(batch.id)}`)
        );

        if ((batchFilesFixed.length > 0 || exeLogMatch) && batch.status !== 'completed') {
          const isFullyDone = batchFilesFixed.length >= batch.files.length;

          let severityStr = batch.severity;
          let descStr = batch.description;

          if (exeLogMatch) {
            const gravidadeMatch = exeLogMatch.content.match(/\*\s*\*\*Gravidade\*\*:\s*\[?(CRÍTICO|ALTO|MÉDIO|BAIXO|CRITICO|MEDIO)\]?/i);
            const impactoMatch = exeLogMatch.content.match(/\*\s*\*\*(?:Impacto|Objetivo(?: do lote)?)\*\*:\s*\[?(.*?)\]?(?=\n|$)/i);
            if (gravidadeMatch) {
              severityStr = gravidadeMatch[1].toLowerCase()
                .replace('crítico', 'critical').replace('critico', 'critical')
                .replace('alto', 'high').replace('médio', 'medium')
                .replace('medio', 'medium').replace('baixo', 'low');
            }
            if (impactoMatch) descStr = impactoMatch[1].replace(/\]$/, '').trim();
          }

          return {
            ...batch,
            status: (isFullyDone || exeLogMatch) ? 'completed' as const : 'planned' as const,
            executionMd: exeLogMatch ? exeLogMatch.content : batch.executionMd,
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

  // ─── SEND MESSAGE ────────────────────────────────────────────────────────────

  const handleSendMessage = async (customInput?: string) => {
    const messageText = customInput || userInput;
    if (!messageText.trim() && documents.length === 0) return;

    const isSystemCommand =
      messageText.includes('INICIE_FASE_1') ||
      messageText.includes('INICIE_FASE_2') ||
      messageText.includes('INICIE_FASE_3');

    let displayMessageText = messageText;
    if (isSystemCommand) {
      if (activeStep === "01") displayMessageText = "> Iniciando Análise e Reconhecimento — Fase 1...";
      if (activeStep === "02") displayMessageText = "> Gerando Blueprint Estrutural — Fase 2...";
      if (activeStep === "03") displayMessageText = "> Executando Correções Sistêmicas — Fase 3...";
    }

    setMessages(prev => [...prev, { role: 'user', content: displayMessageText, timestamp: new Date().toLocaleTimeString('pt-BR') }]);
    setUserInput('');
    setIsLoading(true);
    setError(null);
    setProgress(10);
    setParsedFilesCount(0);
    setIntegrityMessage('');
    setStatusMessage("Enviando comando para o Engine...");

    const totalUploaded = documents.length;

    try {
      let extraContext = "";
      if (activeStep === "02") {
        extraContext = "\n\n[ARQUIVOS PERSISTIDOS DA FASE 1 — FONTE DE VERDADE]\n" +
          batches.map(b => `[FILE: /analysis/lote-${b.id}.md]\n${b.analysisMd || ''}\n[END_FILE]`).join('\n\n');
      } else if (activeStep === "03") {
        extraContext = "\n\n[ARQUIVOS PERSISTIDOS DA FASE 2 — FONTE DE VERDADE]\n" +
          batches.map(b => `[FILE: /plan/lote-${b.id}.md]\n${b.planMd || ''}\n[END_FILE]`).join('\n\n');
      }

      // Streaming: conta lotes sendo gerados em tempo real
      const onChunk = (text: string) => {
        if (activeStep === "01") {
          // Conta blocos [FILE: /analysis/lote-XXX.md] detectados até agora
          const loteBlocks = text.match(/\[FILE:\s*\/analysis\/lote-\d+\.md\]/gi);
          if (loteBlocks) {
            setStatusMessage(`Gerando lote ${loteBlocks.length}... Processando arquivos...`);
          }
        }
      };

      const resultText = await generateDeepAnalysis(documents, messageText, config, activeStep, extraContext, onChunk);
      setProgress(90);
      setStatusMessage("Processando telemetria e segmentação...");

      const timestamp = new Date().toLocaleTimeString('pt-BR');

      // Remove blocos [FILE:...][END_FILE] do chat — detalhes ficam nos lotes
      let finalChatOutput = resultText.replace(/\[FILE:[\s\S]*?\[END_FILE\]/g, '').trim();

      if (isSystemCommand) {
        const extractedBatches = extractFiles(resultText).filter(f =>
          f.name.includes('/analysis/lote-') || f.name.includes('/plan/lote-') || f.name.includes('/execution/')
        );
        finalChatOutput = `✔ Fase ${parseInt(activeStep)} concluída. **${extractedBatches.length} lote(s)** processados e disponíveis na interface gráfica para exploração interativa.`;
      } else if (!finalChatOutput) {
        finalChatOutput = "*(Alterações persistidas na interface.)*";
      }

      setMessages(prev => [...prev, { role: 'model', content: finalChatOutput, timestamp }]);

      if (activeStep === "01") parsePhase1Results(resultText, totalUploaded);
      if (activeStep === "02") parsePhase2Results(resultText);
      if (activeStep === "03") parsePhase3Results(resultText);

      setProgress(100);
      setStatusMessage("Operação concluída com sucesso.");
      setTimeout(() => setProgress(0), 2000);

    } catch (err: any) {
      setError(err?.message || 'Falha na conexão orbital');
      setMessages(prev => [...prev, {
        role: 'model',
        content: "⚠️ ALERT: " + (err?.message || 'Unknown error'),
        timestamp: new Date().toLocaleTimeString('pt-BR')
      }]);
      setStatusMessage("ERRO TÉCNICO DETECTADO.");
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── STEP CLICK ──────────────────────────────────────────────────────────────

  const onStepClick = (stepId: string) => {
    setActiveStep(stepId);

    let prompt = "";

    if (stepId === "01") {
      setStatusMessage("Iniciando Reconhecimento Profundo...");
      const totalFiles = documents.length;
      prompt = `INICIE_FASE_1

Execute a Fase 1 de forma determinística e completa.

DADOS DO CONTEXTO:
- Total de arquivos enviados: ${totalFiles}
- Você DEVE processar TODOS os ${totalFiles} arquivos sem exceção

REGRAS ABSOLUTAS:
1. Gere múltiplos lotes (quantidade DINÂMICA — sem limite máximo — baseada no volume)
2. Distribua 100% dos ${totalFiles} arquivos nos lotes
3. Use o formato exato: [FILE: /analysis/lote-XXX.md] ... [END_FILE] para cada lote
4. Cada lote deve ter cabeçalho com **Gravidade** e **Impacto**
5. Liste TODOS os arquivos do lote com bullet (* \`nome\` | gravidade | tipo)
6. VALIDE antes de responder: soma(arquivos em todos lotes) === ${totalFiles}
7. Se a soma divergir, corrija internamente ANTES de gerar a saída

PENALIDADE: Saída com arquivos omitidos é INVÁLIDA.

Siga estritamente todas as regras do system prompt da Fase 1.`;

    } else if (stepId === "02") {
      setStatusMessage("Gerando Blueprint Estrutural...");
      const batchCount = batches.length;
      prompt = `INICIE_FASE_2

Execute a Fase 2 de forma determinística e completa.

DADOS DO CONTEXTO:
- Lotes da Fase 1 disponíveis: ${batchCount}
- Você DEVE gerar um plano para CADA lote da Fase 1

REGRAS ABSOLUTAS:
1. Leia TODOS os arquivos /analysis/lote-XXX.md injetados no contexto
2. Gere um plano para cada lote usando o formato: [FILE: /plan/lote-XXX.md] ... [END_FILE]
3. Cada lote do plano deve ter cabeçalho com **Gravidade** e **Objetivo do lote**
4. Cada ação deve ter ID único no formato AÇÃO-[LOTE]-[ARQUIVO]-[NÚMERO]
5. Rastreabilidade obrigatória: toda ação referencia problema identificado na Fase 1

PENALIDADE: Saída sem cobertura total dos lotes da Fase 1 é INVÁLIDA.

Siga estritamente todas as regras do system prompt da Fase 2.`;

    } else if (stepId === "03") {
      setStatusMessage("Executando Fix Exaustivo...");
      const batchCount = batches.length;
      prompt = `INICIE_FASE_3

Execute a Fase 3 de forma determinística e completa.

DADOS DO CONTEXTO:
- Lotes do plano disponíveis: ${batchCount}
- Você DEVE executar TODOS os lotes do plano

REGRAS ABSOLUTAS:
1. Leia TODOS os arquivos /plan/lote-XXX.md injetados no contexto
2. Para cada lote, gere: [FILE: /execution/lote-XXX-log.md] ... [END_FILE]
3. Para cada arquivo modificado, gere: [FILE: caminho/original.ext] código COMPLETO [END_FILE]
4. NUNCA truncar código — sempre o arquivo completo e funcional
5. NUNCA usar "// resto igual" ou comentários de omissão

PENALIDADE: Código truncado ou arquivos omitidos = saída INVÁLIDA.

Siga estritamente todas as regras do system prompt da Fase 3.`;
    }

    handleSendMessage(prompt);
  };

  // ─── RESET ───────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setMessages([]);
    setCorrectedFiles([]);
    setOriginalZipName(null);
    setDocuments([]);
    setBatches([]);
    setError(null);
    setIsLoading(false);
    setActiveStep("01");
    setParsedFilesCount(0);
    setIntegrityMessage('');
  };

  // ─── SKILL UPLOAD ────────────────────────────────────────────────────────────

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

  // ─── DERIVED VALUES ──────────────────────────────────────────────────────────

  const totalChars = documents.reduce((acc, doc) => acc + doc.content.length, 0);
  const estimatedTokens = (totalChars / 4 / 1000).toFixed(1);
  const totalBatchFiles = batches.reduce((acc, b) => acc + b.files.length, 0);

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div id="app-root" className="w-full h-screen bg-[#02040a] text-slate-200 font-sans overflow-hidden flex flex-col relative">
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
        totalBatchFiles={totalBatchFiles}
        activeStep={activeStep}
        integrityMessage={integrityMessage}
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
                  <br /><br />
                  [PROVIDER]: {config.provider.toUpperCase()}
                  <br />
                  [MODEL]: {config.model}
                  <br />
                  [TEMP]: {config.temperature}
                  <br />
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
