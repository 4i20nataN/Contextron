
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ShieldAlert, Terminal, X, CheckCircle2, Download, Archive, FileDown, CheckSquare, Square } from 'lucide-react';

import {
  Document, Message, CorrectedFile, Batch, Decision, AppConfig,
  Phase1ResponseJSON, Phase2ResponseJSON, Phase3ResponseJSON, Phase3DecisionResponseJSON
} from './types';
import { SUPPORTED_EXTENSIONS } from './constants';
import { generateDeepAnalysis } from './services/geminiService';

import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Sidebar } from './components/Sidebar';
import { Messenger } from './components/Messenger';
import { Registry } from './components/Registry';
import { ReAnalysisModal } from './components/ReAnalysisModal';
import { BatchSelectionModal } from './components/BatchSelectionModal';

const INITIAL_CONFIG: AppConfig = {
  provider: 'google',
  model: 'gemini-2.0-flash-exp',
  skills: '',
  skillDocuments: [],
  temperature: 0.2
};

function getPersistedConfig(): AppConfig {
  try {
    const saved = localStorage.getItem('context_analyzer_config');
    if (saved) return { ...INITIAL_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return INITIAL_CONFIG;
}

// ─── JSON PARSER (ROBUSTO) ───────────────────────────────────────────────────

/**
 * Corrige newlines literais dentro de strings JSON — problema comum com Phase 3
 * onde conteúdo de arquivos de código contém quebras de linha não escapadas.
 * Usa máquina de estados para detectar contexto de string vs estrutura JSON.
 */
function fixLiteralNewlinesInJSON(jsonStr: string): string {
  let result = '';
  let inString = false;
  let i = 0;

  while (i < jsonStr.length) {
    const char = jsonStr[i];
    const prevChar = i > 0 ? jsonStr[i - 1] : '';

    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
      result += char;
    } else if (inString) {
      // Dentro de uma string: escapa caracteres de controle literais
      if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char === '\t') result += '\\t';
      else result += char;
    } else {
      result += char;
    }
    i++;
  }
  return result;
}

/**
 * Extrai e faz parse do bloco JSON da resposta da IA.
 * Estratégia em 4 níveis de robustez crescente.
 * BUG 4 FIX: detecta e corrige newlines literais em strings (falha comum da Phase 3).
 */
function extractJSON<T>(text: string): T | null {
  // Nível 1: tenta extrair bloco ```json ... ```
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  // Nível 2: parse direto
  try { return JSON.parse(jsonStr) as T; } catch {}

  // Nível 3: encontra início do objeto JSON
  const start = jsonStr.indexOf('{');
  if (start !== -1) {
    const sliced = jsonStr.slice(start);
    try { return JSON.parse(sliced) as T; } catch {}

    // Nível 4: corrige newlines literais dentro de strings (Phase 3 code content)
    try {
      const fixed = fixLiteralNewlinesInJSON(sliced);
      return JSON.parse(fixed) as T;
    } catch {}

    // Nível 5: remove vírgulas trailing (common AI mistake) + fix newlines
    try {
      const cleaned = fixLiteralNewlinesInJSON(sliced)
        .replace(/,(\s*[}\]])/g, '$1')  // trailing commas
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // chars de controle inválidos
      return JSON.parse(cleaned) as T;
    } catch {}
  }

  return null;
}

function validatePhase1(data: any): data is Phase1ResponseJSON {
  return (
    data && data.phase === 1 &&
    typeof data.totalArquivos === 'number' &&
    Array.isArray(data.lotes) &&
    data.lotes.every((l: any) =>
      typeof l.id === 'string' && typeof l.gravidade === 'string' &&
      typeof l.impacto === 'string' && Array.isArray(l.arquivos) &&
      typeof l.analise === 'string'
    )
  );
}

function validatePhase2(data: any): data is Phase2ResponseJSON {
  return (
    data && data.phase === 2 &&
    Array.isArray(data.lotes) &&
    data.lotes.every((l: any) =>
      typeof l.id === 'string' && typeof l.gravidade === 'string' &&
      typeof l.objetivo === 'string' && typeof l.plano === 'string'
    )
  );
}

function validatePhase3Decision(data: any): data is Phase3DecisionResponseJSON {
  return (
    data && data.phase === 3 &&
    Array.isArray(data.lotes) &&
    data.lotes.every((l: any) =>
      typeof l.id === 'string' && typeof l.gravidade === 'string' &&
      typeof l.sumario === 'string' && Array.isArray(l.decisoes)
    )
  );
}

function validatePhase4(data: any): data is Phase3ResponseJSON {
  return (
    data && (data.phase === 3 || data.phase === 4) &&
    Array.isArray(data.lotes) &&
    data.lotes.every((l: any) =>
      typeof l.id === 'string' && typeof l.gravidade === 'string' &&
      typeof l.status === 'string' && typeof l.log === 'string' &&
      Array.isArray(l.arquivosModificados)
    )
  );
}

/**
 * Aplica uma lista de edições cirúrgicas a um arquivo original.
 * Edições são aplicadas de baixo para cima (ordem decrescente de linha)
 * para preservar a validade dos números de linha das edições superiores.
 * Todos os números de linha são 1-indexados, baseados no arquivo ORIGINAL.
 */
function applyEdits(originalContent: string, edicoes: import('./types').Edicao[]): string {
  if (!edicoes || edicoes.length === 0) return originalContent;
  const lines = originalContent.split('\n');

  // Ordena decrescente: INSERIR usa linhaInicio + 0.5 para cair entre SUBSTITUIR/REMOVER da mesma linha
  const sorted = [...edicoes].sort((a, b) => {
    const aPos = a.linhaInicio + (a.tipo === 'INSERIR' ? 0.5 : 0);
    const bPos = b.linhaInicio + (b.tipo === 'INSERIR' ? 0.5 : 0);
    return bPos - aPos;
  });

  for (const edit of sorted) {
    const start = Math.max(0, edit.linhaInicio - 1); // 1-indexed → 0-indexed
    if (edit.tipo === 'SUBSTITUIR') {
      const end = Math.max(start, (edit.linhaFim ?? edit.linhaInicio) - 1);
      const newLines = (edit.conteudoNovo ?? '').split('\n');
      lines.splice(start, end - start + 1, ...newLines);
    } else if (edit.tipo === 'REMOVER') {
      const end = Math.max(start, (edit.linhaFim ?? edit.linhaInicio) - 1);
      lines.splice(start, end - start + 1);
    } else if (edit.tipo === 'INSERIR') {
      const insertAt = edit.linhaInicio === 0 ? 0 : start + 1;
      const newLines = (edit.conteudoNovo ?? '').split('\n');
      lines.splice(insertAt, 0, ...newLines);
    }
  }
  return lines.join('\n');
}

function normalizeSeverity(g: string): string {
  const lower = (g || '').toLowerCase();
  if (lower === 'cinza' || lower.includes('sem nexo') || lower.includes('irrelevant')) return 'cinza';
  if (lower === 'verde' || lower.includes('arquivo ok') || lower.includes('file ok')) return 'verde';
  if (lower === 'super_critical' || lower.includes('super cr')) return 'super_critical';
  if (lower.includes('crítico') || lower.includes('critico') || lower.includes('critical')) return 'critical';
  if (lower.includes('alto') || lower.includes('high')) return 'high';
  if (lower.includes('médio') || lower.includes('medio') || lower.includes('medium')) return 'medium';
  if (lower.includes('baixo') || lower.includes('low')) return 'low';
  return 'medium';
}

function validateBatchIntegrity(batches: Batch[], totalUploaded: number): { valid: boolean; counted: number; message: string } {
  const counted = batches.reduce((acc, b) => acc + b.files.length, 0);
  const valid = counted > 0;
  let message = '';
  if (counted === 0) message = 'AVISO: Nenhum arquivo detectado nos lotes.';
  else if (totalUploaded > 0 && counted < totalUploaded) message = `AVISO DE INTEGRIDADE: ${counted}/${totalUploaded} arquivos mapeados.`;
  else if (totalUploaded > 0 && counted === totalUploaded) message = `INTEGRIDADE OK: todos os ${counted} arquivos em ${batches.length} lotes.`;
  else message = `${counted} arquivos mapeados em ${batches.length} lotes.`;
  return { valid, counted, message };
}

// ─── CONSTANTS (fora do componente — evita recriação a cada render) ──────────

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
  const [reAnalysisModalOpen, setReAnalysisModalOpen] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [batchSelModal, setBatchSelModal] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [allOkPopup, setAllOkPopup] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedDownloadFiles, setSelectedDownloadFiles] = useState<Set<string>>(new Set());

  // ── REFS: valores sempre frescos em contextos async (sem stale closures) ────
  const batchesRef = useRef<Batch[]>(batches);
  const correctedFilesRef = useRef<CorrectedFile[]>(correctedFiles);
  const documentsRef = useRef<Document[]>(documents);
  const isSupplementalRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => { batchesRef.current = batches; }, [batches]);
  useEffect(() => { correctedFilesRef.current = correctedFiles; }, [correctedFiles]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);


  useEffect(() => {
    let progressInterval: number;
    let phraseInterval: number;
    if (isLoading) {
      setProgress(5);
      progressInterval = window.setInterval(() => {
        setProgress(p => p >= 95 ? 95 : p + Math.random() * (95 - p) * 0.15);
      }, 1500);
      phraseInterval = window.setInterval(() => {
        setLoadingPhraseIndex(idx => (idx + 1) % loadingPhrases.length);
      }, 3500);
    } else {
      setProgress(0);
    }
    return () => { clearInterval(progressInterval); clearInterval(phraseInterval); };
  }, [isLoading]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasApiKey = !!process.env.GEMINI_API_KEY;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const isTextFile = (name: string) => {
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.includes(ext) || name.toLowerCase().endsWith('.txt');
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const pathMap = new Map<string, Document>();
    documentsRef.current.forEach(d => pathMap.set(d.name, d));
    setError(null);

    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        setOriginalZipName(file.name.replace(/\.[^/.]+$/, ""));
        try {
          const zip = await JSZip.loadAsync(file);
          for (const zipFile of Object.values(zip.files)) {
            if (!zipFile.dir && isTextFile(zipFile.name) && !pathMap.has(zipFile.name)) {
              const content = await zipFile.async('string');
              pathMap.set(zipFile.name, {
                id: Math.random().toString(36).substr(2, 9),
                name: zipFile.name, content,
                size: content.length, type: zipFile.name.split('.').pop(),
                isRefactored: false
              });
            }
          }
        } catch { setError(`Erro ao processar ZIP: ${file.name}`); }
      } else if (isTextFile(file.name) && !pathMap.has(file.name)) {
        const text = await file.text();
        pathMap.set(file.name, {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name, content: text, size: file.size,
          type: file.name.split('.').pop(), isRefactored: false
        });
      }
    }

    const newDocs = Array.from(pathMap.values());
    setDocuments(newDocs);
    setSelectedDocIds(new Set(newDocs.map(d => d.id)));
    setParsedFilesCount(0);
    setIntegrityMessage('');
  }, []);

  // ─── PHASE PARSERS ──────────────────────────────────────────────────────────

  const parsePhase1Results = (text: string, totalUploaded: number) => {
    const data = extractJSON<Phase1ResponseJSON>(text);
    if (!data) {
      console.error('[PHASE1] JSON inválido');
      setIntegrityMessage('ERRO: Resposta da IA não é JSON válido. Tente novamente.');
      return;
    }
    if (!validatePhase1(data)) {
      console.error('[PHASE1] Schema inválido', JSON.stringify(data).slice(0, 200));
      setIntegrityMessage('ERRO: Schema JSON da Fase 1 inválido.');
      return;
    }

    const isSupplemental = isSupplementalRef.current;
    const existingBatches = isSupplemental ? batchesRef.current : [];
    const globalPathSet = new Set<string>(existingBatches.flatMap(b => b.files));

    // Continue numbering from max existing batch ID for supplemental — no visual difference
    const maxExistingId = isSupplemental
      ? Math.max(0, ...existingBatches.map(b => parseInt(b.id.replace(/\D/g, ''), 10) || 0))
      : 0;

    const newBatches: Batch[] = [];

    for (let i = 0; i < data.lotes.length; i++) {
      const lote = data.lotes[i];
      const dedupedFiles = lote.arquivos.filter(path => {
        if (globalPathSet.has(path)) { console.warn(`[PHASE1] Duplicata removida: "${path}"`); return false; }
        globalPathSet.add(path);
        return true;
      });

      const batchId = isSupplemental
        ? String(maxExistingId + i + 1).padStart(3, '0')
        : lote.id.padStart(3, '0');

      newBatches.push({
        id: batchId,
        name: `Lote ${batchId}`,
        description: lote.impacto,
        files: dedupedFiles,
        status: 'analyzed',
        severity: normalizeSeverity(lote.gravidade),
        isSupplemental,
        analysisMd: lote.analise
      });
    }

    const allBatches = isSupplemental
      ? [...existingBatches, ...newBatches.sort((a, b) => a.id.localeCompare(b.id))]
      : newBatches.sort((a, b) => a.id.localeCompare(b.id));

    setBatches(allBatches);

    const totalDetected = newBatches.reduce((acc, b) => acc + b.files.length, 0);
    setParsedFilesCount(prev => isSupplemental ? prev + totalDetected : totalDetected);

    const label = isSupplemental ? `[SUPLEMENTAR] ${newBatches.length} novos lotes adicionados.` : '';
    const integrity = validateBatchIntegrity(isSupplemental ? newBatches : allBatches, totalUploaded);
    setIntegrityMessage(label || integrity.message);
    console.log('[PHASE1]', isSupplemental ? 'SUPLEMENTAR' : 'NORMAL', integrity.message);

    isSupplementalRef.current = false;
  };

  const parsePhase2Results = (text: string, expectedOverride?: number) => {
    const data = extractJSON<Phase2ResponseJSON>(text);
    if (!data) {
      console.error('[PHASE2] JSON inválido');
      setIntegrityMessage('ERRO: Resposta da IA (Fase 2) não é JSON válido.');
      return;
    }
    if (!validatePhase2(data)) {
      console.error('[PHASE2] Schema inválido', JSON.stringify(data).slice(0, 200));
      setIntegrityMessage('ERRO: Schema JSON da Fase 2 inválido.');
      return;
    }

    // BUG 1 FIX: usa batchesRef.current — garante estado atual, não closure stale
    const currentBatches = batchesRef.current;
    const planMap = new Map(data.lotes.map(l => [l.id.padStart(3, '0'), l]));
    const receivedCount = data.lotes.length;
    const expectedCount = expectedOverride ?? currentBatches.length;

    const isSuperLote = receivedCount < expectedCount;
    if (isSuperLote) {
      console.warn(`[PHASE2] Super-lote: IA gerou ${receivedCount} plano(s) para ${expectedCount} esperados. Fallback ativado.`);
      setIntegrityMessage(`AVISO Fase 2: ${receivedCount} plano(s) para ${expectedCount} lotes. Distribuição automática aplicada.`);
    } else {
      console.log(`[PHASE2] Correto: ${receivedCount} plano(s) para ${expectedCount} lotes.`);
    }

    const availablePlans = data.lotes.slice();

    setBatches(prev => prev.map((batch, index) => {
      const planLote = planMap.get(batch.id);
      if (planLote) {
        return {
          ...batch,
          status: 'planned' as const,
          planMd: planLote.plano,
          severity: normalizeSeverity(planLote.gravidade),
          description: planLote.objetivo || batch.description
        };
      }
      if (isSuperLote && availablePlans.length > 0) {
        const fallbackPlan = availablePlans[index % availablePlans.length];
        return {
          ...batch,
          status: 'planned' as const,
          planMd: `> ⚠️ **Plano distribuído automaticamente** (IA consolidou ${receivedCount} plano(s) para ${expectedCount} lotes)\n\n` + fallbackPlan.plano,
          severity: normalizeSeverity(fallbackPlan.gravidade),
          description: fallbackPlan.objetivo || batch.description
        };
      }
      return batch;
    }));
  };

  const parsePhase3DecisionResults = (text: string) => {
    const data = extractJSON<Phase3DecisionResponseJSON>(text);
    if (!data) {
      console.error('[PHASE3-DEC] JSON inválido');
      setIntegrityMessage('ERRO: Resposta da IA (Fase 3 — Decisão) não é JSON válido. Tente novamente.');
      return;
    }
    if (!validatePhase3Decision(data)) {
      // Fallback: maybe AI returned Phase 4 execution format by mistake
      console.error('[PHASE3-DEC] Schema inválido, tentando fallback', JSON.stringify(data).slice(0, 200));
      setIntegrityMessage('AVISO: Schema da Fase 3 (Decisão) inesperado. Verifique os lotes.');
    }

    setBatches(prev => prev.map(batch => {
      const lote = data.lotes.find(l => l.id.padStart(3, '0') === batch.id || l.id === batch.id);
      if (!lote) return batch;

      const decisions: Decision[] = (lote.decisoes || []).map(d => ({
        id: d.id,
        descricao: d.descricao,
        rationale: d.rationale,
        requiresUser: d.requiresUser,
        agentChoice: d.agentChoice,
        userChoice: undefined,
        options: d.options || ['SIM', 'NÃO'],
        resolved: !d.requiresUser, // auto-resolved if agent decides
      }));

      return {
        ...batch,
        decisionsMd: lote.sumario,
        decisions,
        severity: normalizeSeverity(lote.gravidade),
      };
    }));

    const pendingCount = data.lotes.reduce((acc, l) =>
      acc + (l.decisoes || []).filter(d => d.requiresUser).length, 0);

    const allClear = pendingCount === 0;
    const msg = allClear
      ? `✔ Fase 3 — Decisão concluída. Agente tomou todas as decisões automaticamente. Pronto para Fase 4.`
      : `⚠ Fase 3 — Decisão concluída. **${pendingCount} decisão(ões)** precisam da sua revisão nos lotes antes de prosseguir para a Fase 4.`;

    setMessages(prev => [...prev, {
      role: 'model',
      content: msg,
      timestamp: new Date().toLocaleTimeString('pt-BR')
    }]);

    setIntegrityMessage(allClear
      ? `Fase 3 OK — ${data.lotes.length} lotes decididos automaticamente.`
      : `Fase 3 — ${pendingCount} decisão(ões) aguardando revisão.`);

    console.log('[PHASE3-DEC] pendingCount:', pendingCount);
  };

  const parsePhase4Results = (text: string, docsSnapshot: Document[]) => {
    const data = extractJSON<Phase3ResponseJSON>(text);
    if (!data) {
      const msg = 'ERRO Fase 4: JSON inválido — verifique se o modelo retornou JSON com edicoes[]. Tente novamente ou reduza a quantidade de lotes.';
      console.error('[PHASE4] JSON inválido');
      setIntegrityMessage(msg);
      setError(msg);
      return;
    }
    if (!validatePhase4(data)) {
      const msg = 'ERRO Fase 4: Schema JSON inválido. O modelo pode ter omitido campos obrigatórios (status, log, arquivosModificados).';
      console.error('[PHASE4] Schema inválido', JSON.stringify(data).slice(0, 200));
      setIntegrityMessage(msg);
      setError(msg);
      return;
    }

    const originalMap = new Map(docsSnapshot.map(d => [d.name, d]));

    // Usa correctedFilesRef.current — garante estado atual sem closure stale
    const newCorrectedFiles = new Map<string, CorrectedFile>(
      correctedFilesRef.current.map(f => [f.name, f])
    );
    const modifiedPaths = new Set<string>();

    for (const lote of data.lotes) {
      for (const arquivo of lote.arquivosModificados) {
        if (!arquivo.path) continue;
        const original = originalMap.get(arquivo.path);

        // Remoção total (DESCARTÁVEL / ÓRFÃO)
        if (arquivo.removerArquivo) {
          const originalSize = original?.size || original?.content.length || 0;
          newCorrectedFiles.set(arquivo.path, {
            name: arquivo.path, content: '',
            sizeChange: -originalSize, originalSize, removed: true
          });
          modifiedPaths.add(arquivo.path);
          console.log(`[PHASE4] Arquivo marcado para remoção: ${arquivo.path}`);
          continue;
        }

        // Edição cirúrgica — aplica edicoes[] no arquivo original
        if (!arquivo.edicoes || arquivo.edicoes.length === 0) {
          console.warn(`[PHASE4] Sem edicoes para ${arquivo.path} — ignorado`);
          continue;
        }
        if (!original) {
          console.warn(`[PHASE4] Arquivo original não encontrado: ${arquivo.path}`);
          continue;
        }

        const correctedContent = applyEdits(original.content, arquivo.edicoes);
        const originalSize = original.size || original.content.length;
        const sizeChange = correctedContent.length - originalSize;
        newCorrectedFiles.set(arquivo.path, {
          name: arquivo.path, content: correctedContent,
          sizeChange, originalSize,
          tokensSaved: Math.abs(Math.floor(sizeChange / 4))
        });
        modifiedPaths.add(arquivo.path);
        console.log(`[PHASE4] ${arquivo.path}: ${arquivo.edicoes.length} edição(ões) aplicada(s)`);
      }
    }

    setCorrectedFiles(Array.from(newCorrectedFiles.values()));
    setDocuments(prev => prev.map(doc => ({
      ...doc, isRefactored: modifiedPaths.has(doc.name) ? true : doc.isRefactored
    })));

    const execMap = new Map(data.lotes.map(l => [l.id.padStart(3, '0'), l]));
    setBatches(prev => prev.map(batch => {
      const execLote = execMap.get(batch.id);
      if (!execLote) return batch;

      let linesRemoved = 0, sizeDelta = 0, tokensReduced = 0;
      for (const arquivo of execLote.arquivosModificados) {
        const corrected = newCorrectedFiles.get(arquivo.path);
        const original = originalMap.get(arquivo.path);
        if (original && corrected && !corrected.removed) {
          linesRemoved += original.content.split('\n').length - corrected.content.split('\n').length;
          const delta = corrected.content.length - original.content.length;
          sizeDelta += delta;
          tokensReduced += Math.abs(Math.floor(delta / 4));
        } else if (corrected?.removed && original) {
          linesRemoved += original.content.split('\n').length;
          sizeDelta += corrected.sizeChange;
          tokensReduced += Math.abs(Math.floor(corrected.sizeChange / 4));
        }
      }

      return {
        ...batch, status: 'completed' as const,
        executionMd: execLote.log,
        severity: normalizeSeverity(execLote.gravidade),
        description: execLote.impacto || batch.description,
        executionStats: { tokensReduced, linesRemoved, sizeDelta }
      };
    }));

    console.log(`[PHASE4] ${modifiedPaths.size} arquivo(s) processado(s) com edição cirúrgica.`);
  };

  // ─── ABORT ───────────────────────────────────────────────────────────────────

  const handleAbort = useCallback(() => {
    cancelledRef.current = true;
    setIsLoading(false);
    setProgress(0);
    setStatusMessage("Operação interrompida pelo usuário.");
    setMessages(prev => [...prev, {
      role: 'model',
      content: "⛔ Operação interrompida. Os dados gerados até aqui foram mantidos. Você pode reiniciar esta fase quando quiser.",
      timestamp: new Date().toLocaleTimeString('pt-BR')
    }]);
  }, []);

  // ─── RELOAD SINGLE BATCH (Phase 2) ──────────────────────────────────────────

  const handleReloadBatch = useCallback((batchId: string) => {
    const currentBatches = batchesRef.current;
    const batch = currentBatches.find(b => b.id === batchId);
    if (!batch) return;

    const phase1Data = {
      phase: 1,
      totalArquivos: batch.files.length,
      lotes: [{
        id: batch.id,
        gravidade: batch.severity,
        impacto: batch.description,
        arquivos: batch.files,
        analise: batch.analysisMd || ''
      }]
    };
    const extraContext = "\n\n[FASE_1_JSON]\n" + JSON.stringify(phase1Data, null, 2) + "\n[/FASE_1_JSON]";

    const prompt = `INICIE_FASE_2_LOTE_INDIVIDUAL

Replanejar APENAS o lote "${batchId}".

═══════════════════════════════════════════
LOTE A REPLANAR
═══════════════════════════════════════════
ID obrigatório: "${batchId}"
Arquivos: ${batch.files.length}

REGRAS ABSOLUTAS:
1. Leia o [FASE_1_JSON] injetado — é a fonte de verdade deste lote
2. Gere EXATAMENTE 1 lote no output JSON com ID "${batchId}"
3. Cada ação com ID único: AÇÃO-${batchId}-[ARQUIVO]-[NÚMERO]

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

    // Run phase 2 for just this batch and merge result
    const runReload = async () => {
      setIsLoading(true);
      setError(null);
      cancelledRef.current = false;
      setStatusMessage(`Replaneando lote ${batchId}...`);
      setMessages(prev => [...prev, {
        role: 'user',
        content: `> Replaneando lote ${batchId}...`,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      }]);

      try {
        const resultText = await generateDeepAnalysis(
          documentsRef.current, prompt, config, "02", extraContext, undefined, undefined, cancelledRef
        );

        if (cancelledRef.current) return;

        // Parse inline
        const fenceMatch = resultText.match(/```json\s*([\s\S]*?)```/i);
        const jsonStr = fenceMatch ? fenceMatch[1].trim() : resultText.trim();
        let data: any = null;
        try { data = JSON.parse(jsonStr); } catch { }
        if (!data) {
          const start = jsonStr.indexOf('{');
          if (start !== -1) { try { data = JSON.parse(jsonStr.slice(start)); } catch {} }
        }

        if (data && data.lotes && data.lotes.length > 0) {
          const lote = data.lotes.find((l: any) => l.id.padStart(3, '0') === batchId || l.id === batchId) || data.lotes[0];
          setBatches(prev => prev.map(b => b.id === batchId ? {
            ...b,
            status: 'planned' as const,
            planMd: lote.plano || lote.plan || b.planMd,
            severity: normalizeSeverity(lote.gravidade || b.severity),
            description: lote.objetivo || b.description
          } : b));
          setMessages(prev => [...prev, {
            role: 'model',
            content: `✔ Lote **${batchId}** replaneado com sucesso.`,
            timestamp: new Date().toLocaleTimeString('pt-BR')
          }]);
        } else {
          setError(`Não foi possível parsear o plano do lote ${batchId}.`);
        }
      } catch (err: any) {
        if (err?.message === '__CANCELLED__') return;
        setError(err?.message || 'Erro ao replanar lote.');
      } finally {
        setIsLoading(false);
        setStatusMessage("Operação concluída.");
        setProgress(0);
      }
    };

    runReload();
  }, [config]);

  // ─── REDECIDE BATCH (Phase 3 per-batch) ──────────────────────────────────────

  const handleRedecideBatch = useCallback((batchId: string) => {
    const batch = batchesRef.current.find(b => b.id === batchId);
    if (!batch) return;

    const phase2Data = {
      phase: 2,
      lotes: [{ id: batch.id, gravidade: batch.severity, objetivo: batch.description, plano: batch.planMd || '' }]
    };
    const extraContext = "\n\n[FASE_2_JSON]\n" + JSON.stringify(phase2Data, null, 2) + "\n[/FASE_2_JSON]";

    const prompt = `INICIE_FASE_3_LOTE_INDIVIDUAL
Redecida APENAS o lote "${batchId}".

═══════════════════════════════════════════
LOTE A REDECIDA
═══════════════════════════════════════════
ID obrigatório: "${batchId}"

REGRAS ABSOLUTAS:
1. Leia o [FASE_2_JSON] injetado — é a fonte de verdade deste lote
2. Gere EXATAMENTE 1 lote de decisão com ID "${batchId}"
3. Mínimo 1 decisão no lote
4. Decida autonomamente quando possível (requiresUser: false)

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

    const runRedecide = async () => {
      setIsLoading(true);
      setError(null);
      cancelledRef.current = false;
      setStatusMessage(`Redecidindo lote ${batchId}...`);
      setMessages(prev => [...prev, {
        role: 'user',
        content: `> Redecidindo lote ${batchId}...`,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      }]);

      try {
        const resultText = await generateDeepAnalysis(
          documentsRef.current, prompt, config, "03", extraContext, undefined, undefined, cancelledRef
        );
        if (cancelledRef.current) return;

        const fenceMatch = resultText.match(/```json\s*([\s\S]*?)```/i);
        const jsonStr = fenceMatch ? fenceMatch[1].trim() : resultText.trim();
        let data: any = null;
        try { data = JSON.parse(jsonStr); } catch {}
        if (!data) {
          const start = jsonStr.indexOf('{');
          if (start !== -1) { try { data = JSON.parse(jsonStr.slice(start)); } catch {} }
        }

        if (data && data.lotes && data.lotes.length > 0) {
          const lote = data.lotes.find((l: any) => l.id.padStart(3, '0') === batchId || l.id === batchId) || data.lotes[0];
          const decisions: Decision[] = (lote.decisoes || []).map((d: any) => ({
            id: d.id, descricao: d.descricao, rationale: d.rationale,
            requiresUser: d.requiresUser, agentChoice: d.agentChoice,
            userChoice: undefined, options: d.options || ['SIM', 'NÃO'],
            resolved: !d.requiresUser,
          }));
          setBatches(prev => prev.map(b => b.id === batchId ? {
            ...b, decisionsMd: lote.sumario || b.decisionsMd, decisions,
            severity: normalizeSeverity(lote.gravidade || b.severity),
          } : b));
          setMessages(prev => [...prev, {
            role: 'model',
            content: `✔ Lote **${batchId}** redecidido com sucesso.`,
            timestamp: new Date().toLocaleTimeString('pt-BR')
          }]);
        } else {
          setError(`Não foi possível parsear as decisões do lote ${batchId}.`);
        }
      } catch (err: any) {
        if (err?.message === '__CANCELLED__') return;
        setError(err?.message || 'Erro ao redecida lote.');
      } finally {
        setIsLoading(false);
        setStatusMessage("Operação concluída.");
        setProgress(0);
      }
    };

    runRedecide();
  }, [config]);

  // ─── DECISION CHOICE ─────────────────────────────────────────────────────────

  const handleDecisionChoice = (batchId: string, decisionId: string, choice: string) => {
    setBatches(prev => prev.map(batch => {
      if (batch.id !== batchId) return batch;
      const decisions = (batch.decisions || []).map(d => {
        if (d.id !== decisionId) return d;
        return { ...d, userChoice: choice, resolved: true };
      });
      return { ...batch, decisions };
    }));
  };

  // ─── CLEAR PHASE DATA ────────────────────────────────────────────────────────

  // ─── CASCADE CLEAR ───────────────────────────────────────────────────────────
  // Clearing a phase cascades to ALL downstream phases to prevent stale data conflicts.
  // Example: re-running Phase 2 also clears F3 decisions + F4 execution for those batches.
  const clearPhaseData = useCallback((step: string, batchIds: string[]) => {
    const batchIdSet = new Set(batchIds);
    setBatches(prev => prev.map(b => {
      if (!batchIdSet.has(b.id)) return b;
      if (step === "02") return {
        ...b, status: 'analyzed' as const,
        planMd: undefined,
        decisionsMd: undefined, decisions: undefined,   // F3 cascade
        executionMd: undefined, executionStats: undefined, // F4 cascade
      };
      if (step === "03") return {
        ...b,
        decisionsMd: undefined, decisions: undefined,
        executionMd: undefined, executionStats: undefined, // F4 cascade
      };
      if (step === "04") return { ...b, executionMd: undefined, executionStats: undefined };
      return b;
    }));
    // Always clean up correctedFiles for any batch that's losing F4 data
    if (step === "02" || step === "03" || step === "04") {
      const batchFiles = new Set(batchesRef.current.filter(b => batchIdSet.has(b.id)).flatMap(b => b.files));
      if (batchFiles.size > 0) setCorrectedFiles(prev => prev.filter(f => !batchFiles.has(f.name)));
    }
    console.log(`[HARMONIZE] clearPhaseData step=${step} cascade aplicado a ${batchIds.length} lote(s)`);
  }, []);

  // ─── SEND MESSAGE ────────────────────────────────────────────────────────────

  const handleSendMessage = async (customInput?: string, overrideStep?: string, overrideDocs?: Document[], overrideBatches?: Batch[]) => {
    const messageText = customInput || userInput;
    if (!messageText.trim() && documents.length === 0) return;

    const currentStep = overrideStep || activeStep;

    const isSystemCommand =
      messageText.includes('INICIE_FASE_1') ||
      messageText.includes('INICIE_FASE_2') ||
      messageText.includes('INICIE_FASE_3') ||
      messageText.includes('INICIE_FASE_4');

    let displayMessageText = messageText;
    if (isSystemCommand) {
      if (currentStep === "01") displayMessageText = "> Iniciando Análise e Reconhecimento — Fase 1...";
      if (currentStep === "02") displayMessageText = "> Gerando Plano de Refatoração — Fase 2...";
      if (currentStep === "03") displayMessageText = "> Analisando Decisões Estratégicas — Fase 3...";
      if (currentStep === "04") displayMessageText = "> Executando Refatoração — Fase 4...";
    }

    setMessages(prev => [...prev, { role: 'user', content: displayMessageText, timestamp: new Date().toLocaleTimeString('pt-BR') }]);
    setUserInput('');
    setIsLoading(true);
    setError(null);
    setProgress(20);
    setParsedFilesCount(0);
    setIntegrityMessage('');

    const phaseLabels: Record<string, string> = {
      "01": "Fase 1 — Análise e Reconhecimento",
      "02": "Fase 2 — Planejamento Blueprint",
      "03": "Fase 3 — Decisão Estratégica",
      "04": "Fase 4 — Execução e Refatoração"
    };
    // Immediately show connecting status for responsiveness
    setStatusMessage(`⬡ Conectando engine: ${phaseLabels[currentStep] || 'processando'}...`);
    // Small defer so the UI paints before heavy work
    await new Promise(r => setTimeout(r, 0));

    const totalUploaded = overrideDocs ? overrideDocs.length : documents.length;
    const docsSnapshot = overrideDocs ? [...overrideDocs] : [...documentsRef.current];

    try {
      let extraContext = "";

      // BUG 2 FIX: Para Fase 3, calcula quais arquivos são relevantes para o plano
      // Apenas esses serão enviados ao modelo — elimina context bloat dos outros N arquivos
      let relevantFilePaths: Set<string> | undefined;

      if (currentStep === "02") {
        const currentBatches = overrideBatches || batchesRef.current;
        const phase1Data = {
          phase: 1,
          totalArquivos: currentBatches.reduce((acc, b) => acc + b.files.length, 0),
          lotes: currentBatches.map(b => ({
            id: b.id, gravidade: b.severity, impacto: b.description,
            arquivos: b.files, analise: b.analysisMd || ''
          }))
        };
        extraContext = "\n\n[FASE_1_JSON]\n" + JSON.stringify(phase1Data, null, 2) + "\n[/FASE_1_JSON]";

      } else if (currentStep === "03") {
        // Fase 3 (Decisão): envia apenas o plano da Fase 2 — sem arquivos originais
        const currentBatches = overrideBatches || batchesRef.current;
        const phase2Data = {
          phase: 2,
          lotes: currentBatches.map(b => ({
            id: b.id, gravidade: b.severity, objetivo: b.description,
            plano: b.planMd || ''
          }))
        };
        extraContext = "\n\n[FASE_2_JSON]\n" + JSON.stringify(phase2Data, null, 2) + "\n[/FASE_2_JSON]";
        console.log('[PHASE3-DEC] Contexto: apenas JSON da Fase 2 (sem arquivos). Lotes:', currentBatches.length);

      } else if (currentStep === "04") {
        // Fase 4 (Execução): F2+F3 JSON + arquivos originais relevantes para edição cirúrgica
        const currentBatches = overrideBatches || batchesRef.current;

        // F2 — planos gerados na Fase 2 (o que foi decidido)
        const phase2PlansData = {
          phase: 2,
          lotes: currentBatches.map(b => ({
            id: b.id, gravidade: b.severity, objetivo: b.description,
            plano: b.planMd || ''
          }))
        };

        // F3 — decisões tomadas na Fase 3 (o que deve ser feito)
        const phase3DecisionData = {
          phase: 3,
          lotes: currentBatches.map(b => ({
            id: b.id, gravidade: b.severity,
            decisoes: (b.decisions || []).map(d => ({
              id: d.id,
              descricao: d.descricao,
              decisaoFinal: d.userChoice || d.agentChoice || 'SIM'
            }))
          }))
        };

        // Arquivos originais dos lotes selecionados — necessários para que a IA
        // produza o arquivo COMPLETO com apenas a correção cirúrgica aplicada.
        const relevantFilePathsF4 = new Set<string>(
          currentBatches.flatMap(b => b.files || [])
        );
        const relevantDocsF4 = docsSnapshot.filter(d => relevantFilePathsF4.has(d.name));
        const originalFilesSection = relevantDocsF4.length > 0
          ? "\n\n[ARQUIVOS_ORIGINAIS — CONTEÚDO COMPLETO PARA REFERÊNCIA DE EDIÇÃO]\n" +
            relevantDocsF4.map(d => `[FILE: ${d.name}]\n${d.content}\n[/FILE]`).join('\n\n') +
            "\n[/ARQUIVOS_ORIGINAIS]"
          : "";

        extraContext =
          "\n\n[FASE_2_JSON — O QUE FOI PLANEJADO]\n" + JSON.stringify(phase2PlansData, null, 2) + "\n[/FASE_2_JSON]" +
          "\n\n[FASE_3_JSON — O QUE FOI DECIDIDO]\n" + JSON.stringify(phase3DecisionData, null, 2) + "\n[/FASE_3_JSON]" +
          originalFilesSection;

        console.log(`[PHASE4] Contexto F2+F3 + ${relevantDocsF4.length} arquivo(s) original(is) incluídos para edição cirúrgica.`);
      }

      const onChunk = (loteCountStr: string) => {
        const count = parseInt(loteCountStr, 10);
        if (!isNaN(count) && count > 0) {
          setStatusMessage(`${phaseLabels[currentStep] || 'Processando'} — ${count} lote(s) recebidos...`);
          // Gentle progress nudge per received lot
          setProgress(p => Math.min(88, p + 2));
        }
      };

      // Throttled streaming update — batches rapid deltas to avoid excessive re-renders
      let pendingDelta = '';
      let streamingRafId: number | null = null;
      let firstChunkReceived = false;
      const onRawChunk = (delta: string) => {
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          setStatusMessage(`${phaseLabels[currentStep] || 'Processando'} — streaming ativo...`);
          setProgress(35);
        }
        pendingDelta += delta;
        if (streamingRafId === null) {
          streamingRafId = window.requestAnimationFrame(() => {
            const captured = pendingDelta;
            pendingDelta = '';
            streamingRafId = null;
            setStreamingText(prev => {
              const next = prev + captured;
              return next.length > 6000 ? next.slice(-6000) : next;
            });
          });
        }
      };

      setStreamingText('');
      cancelledRef.current = false;
      const resultText = await generateDeepAnalysis(
        docsSnapshot, messageText, config, currentStep, extraContext, onChunk, relevantFilePaths, cancelledRef, onRawChunk
      );
      setProgress(90);
      setStatusMessage("Processando telemetria e segmentação...");

      const timestamp = new Date().toLocaleTimeString('pt-BR');

      let finalChatOutput = "";
      if (isSystemCommand) {
        const parsed = extractJSON<any>(resultText);
        const loteCount = parsed?.lotes?.length || 0;
        const filesCount = parsed?.lotes?.reduce((acc: number, l: any) =>
          acc + (l.arquivosModificados?.length || 0), 0) || 0;
        if (currentStep === "04") {
          finalChatOutput = `✔ Fase 4 concluída. **${loteCount} lote(s)** executados, **${filesCount} arquivo(s)** modificados.`;
        } else if (currentStep === "03") {
          // Phase 3 chat output is handled inside parsePhase3DecisionResults (has decision summary)
          finalChatOutput = "";
        } else {
          finalChatOutput = `✔ Fase ${parseInt(currentStep)} concluída. **${loteCount} lote(s)** processados e disponíveis na interface gráfica.`;
        }
      } else {
        finalChatOutput = resultText.replace(/```json[\s\S]*?```/gi, '').trim() || "*(Processamento concluído.)*";
      }

      if (finalChatOutput) {
        setMessages(prev => [...prev, { role: 'model', content: finalChatOutput, timestamp }]);
      }

      if (currentStep === "01") parsePhase1Results(resultText, totalUploaded);
      if (currentStep === "02") parsePhase2Results(resultText, overrideBatches?.length);
      if (currentStep === "03") parsePhase3DecisionResults(resultText);
      if (currentStep === "04") parsePhase4Results(resultText, docsSnapshot);

      setProgress(100);
      setStatusMessage("Operação concluída com sucesso.");
      setTimeout(() => setProgress(0), 2000);

    } catch (err: any) {
      if (err?.message === '__CANCELLED__' || cancelledRef.current) {
        // Silent — handleAbort already showed the message
        return;
      }
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

  // ─── PARALLEL PHASE 1 ANALYSIS ──────────────────────────────────────────────
  // Splits large doc sets into parallel chunks — each chunk processed concurrently.
  // Tradeoff: faster for large codebases but reduces cross-file context awareness.
  // Use when files > PARALLEL_THRESHOLD and user opts in.
  const PARALLEL_CHUNK_SIZE = 18; // files per chunk
  const PARALLEL_THRESHOLD  = 35; // auto-suggest parallel above this count

  const handleParallelPhase1 = useCallback(async (docs: Document[]) => {
    const chunkSize = PARALLEL_CHUNK_SIZE;
    const chunks: Document[][] = [];
    for (let i = 0; i < docs.length; i += chunkSize) chunks.push(docs.slice(i, i + chunkSize));

    setIsLoading(true);
    setError(null);
    setStreamingText('');
    cancelledRef.current = false;
    setStatusMessage(`Análise paralela — ${chunks.length} chunks de ~${chunkSize} arquivos cada...`);
    setMessages(prev => [...prev, {
      role: 'user',
      content: `> Análise paralela: ${docs.length} arquivos em ${chunks.length} chunks concorrentes`,
      timestamp: new Date().toLocaleTimeString('pt-BR')
    }]);
    setProgress(5);

    try {
      // Run all chunks concurrently
      const chunkPromises = chunks.map((chunk, idx) => {
        const n = chunk.length;
        const prompt = `INICIE_FASE_1

Execute a Fase 1 de forma determinística e completa. Este é o CHUNK ${idx + 1} de ${chunks.length} numa análise paralela.

DADOS DO CONTEXTO:
- Total de arquivos NESTE CHUNK: ${n}
- Você DEVE processar TODOS os ${n} arquivos sem exceção
- ATENÇÃO: processe apenas os arquivos [FILE: path] recebidos — NÃO invente arquivos

REGRAS ABSOLUTAS:
1. Gere múltiplos lotes (quantidade DINÂMICA — sem limite máximo)
2. Distribua 100% dos ${n} arquivos nos lotes
3. O campo "arquivos" deve conter APENAS paths reais recebidos como [FILE: path]
4. VALIDE: soma(lotes[i].arquivos.length) === ${n}
5. Se a soma divergir, corrija internamente ANTES de gerar o JSON

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

        return generateDeepAnalysis(chunk, prompt, config, "01", "", undefined, undefined, cancelledRef);
      });

      const results = await Promise.allSettled(chunkPromises);
      if (cancelledRef.current) return;

      setProgress(75);
      setStatusMessage("Mergeando resultados dos chunks...");

      // Parse + merge all results
      const allBatches: Batch[] = [];
      let batchCounter = 0;
      let totalMapped = 0;

      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn('[PARALLEL-P1] Chunk falhou:', result.reason);
          continue;
        }
        const data = extractJSON<Phase1ResponseJSON>(result.value);
        if (!data || !validatePhase1(data)) {
          console.warn('[PARALLEL-P1] Chunk com JSON inválido');
          continue;
        }
        for (const lote of data.lotes) {
          batchCounter += 1;
          const batchId = String(batchCounter).padStart(3, '0');
          allBatches.push({
            id: batchId, name: `Lote ${batchId}`,
            description: lote.impacto,
            files: lote.arquivos,
            status: 'analyzed',
            severity: normalizeSeverity(lote.gravidade),
            isSupplemental: false,
            analysisMd: lote.analise,
          });
          totalMapped += lote.arquivos.length;
        }
      }

      const sorted = allBatches.sort((a, b) => a.id.localeCompare(b.id));
      batchesRef.current = sorted;
      setBatches(sorted);

      const integrity = validateBatchIntegrity(sorted, docs.length);
      setIntegrityMessage(integrity.message);
      setParsedFilesCount(totalMapped);
      setProgress(100);
      setStatusMessage(`Análise paralela concluída — ${sorted.length} lotes · ${totalMapped} arquivos mapeados`);
      setMessages(prev => [...prev, {
        role: 'model',
        content: `✔ Análise paralela concluída. **${chunks.length} chunks** processados → **${sorted.length} lotes** · ${totalMapped}/${docs.length} arquivos mapeados.`,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      }]);
      setTimeout(() => setProgress(0), 2000);
    } catch (err: any) {
      if (err?.message !== '__CANCELLED__') setError(err?.message || 'Erro na análise paralela');
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // ─── STEP CLICK ──────────────────────────────────────────────────────────────

  const onStepClick = (stepId: string, batchesToProcess?: Batch[]) => {
    if (isLoading) return;
    setActiveStep(stepId);
    let prompt = "";

    if (stepId === "01") {
      // If batches already exist, show re-analysis modal instead of running immediately
      if (batchesRef.current.length > 0) {
        setReAnalysisModalOpen(true);
        return;
      }

      // Use selected documents from file tree; fall back to all if nothing selected
      const selectedDocs = selectedDocuments.length > 0 ? selectedDocuments : documentsRef.current;
      setStatusMessage("Iniciando Análise e Reconhecimento — Fase 1...");
      const totalFiles = selectedDocs.length;

      // Auto-parallel for large codebases
      if (totalFiles >= PARALLEL_THRESHOLD) {
        console.log(`[PARALLEL-P1] ${totalFiles} arquivos >= threshold ${PARALLEL_THRESHOLD} — usando análise paralela`);
        handleParallelPhase1(selectedDocs);
        return;
      }

      prompt = `INICIE_FASE_1

Execute a Fase 1 de forma determinística e completa.

DADOS DO CONTEXTO:
- Total de arquivos enviados: ${totalFiles}
- Você DEVE processar TODOS os ${totalFiles} arquivos sem exceção

REGRAS ABSOLUTAS:
1. Gere múltiplos lotes (quantidade DINÂMICA — sem limite máximo)
2. Distribua 100% dos ${totalFiles} arquivos nos lotes
3. O campo "arquivos" deve conter APENAS paths reais recebidos como [FILE: path]
4. VALIDE: soma(lotes[i].arquivos.length) === ${totalFiles}
5. Se a soma divergir, corrija internamente ANTES de gerar o JSON

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

      handleSendMessage(prompt, "01", selectedDocs);
      return;

    } else if (stepId === "02") {
      // Show batch selection modal if batchesToProcess not yet provided
      if (!batchesToProcess) {
        if (batchesRef.current.length === 0) {
          setError("Execute a Fase 1 primeiro.");
          setStatusMessage("Fase 1 necessária antes de prosseguir.");
          return;
        }
        // "All OK" popup — when ALL batches are verde/low severity (projeto perfeito)
        const allBatchesForCheck = batchesRef.current;
        const allGreen = allBatchesForCheck.length > 0 && allBatchesForCheck.every(b => {
          const sev = (b.severity || '').toLowerCase();
          return sev === 'verde' || sev === 'low' || sev.includes('baixo') || sev.includes('arquivo ok') || sev === 'cinza';
        });
        if (allGreen) {
          setAllOkPopup(true);
          return;
        }
        setBatchSelModal("02");
        return;
      }

      setStatusMessage("Gerando Plano de Refatoração — Fase 2...");
      const currentBatchesList = batchesToProcess;
      const batchCount = currentBatchesList.length;
      if (batchCount === 0) { setError("Nenhum lote selecionado."); return; }

      const requiredIds = currentBatchesList.map(b => `"${b.id}"`).join(', ');
      const batchSummary = currentBatchesList.map(b =>
        `  - ID "${b.id}": ${b.files.length} arquivos (${b.severity}) — ${b.description}`
      ).join('\n');

      prompt = `INICIE_FASE_2

Execute a Fase 2 de forma determinística e completa.

═══════════════════════════════════════════
LISTA OBRIGATÓRIA — LOTES DA FASE 1
═══════════════════════════════════════════
Total: ${batchCount} lotes
IDs obrigatórios: [${requiredIds}]

Resumo dos lotes:
${batchSummary}

═══════════════════════════════════════════
PROIBIDO ABSOLUTO (PENALIDADE MÁXIMA):
═══════════════════════════════════════════
❌ Criar um "super-lote único" que engloba todos os lotes em um só
❌ Gerar menos de ${batchCount} lotes no array "lotes"
❌ Usar IDs diferentes dos listados: [${requiredIds}]
❌ Omitir qualquer lote da lista acima
❌ Agrupar múltiplos lotes da Fase 1 em um único lote do plano

═══════════════════════════════════════════
REGRAS ABSOLUTAS:
═══════════════════════════════════════════
1. Leia o [FASE_1_JSON] injetado — ele é a fonte de verdade
2. Gere EXATAMENTE ${batchCount} lotes no output JSON
3. O array "lotes" DEVE conter EXATAMENTE ${batchCount} objetos
4. Cada lote usa o ID EXATO da lista: [${requiredIds}]
5. Cada ação com ID único: AÇÃO-[LOTE]-[ARQUIVO]-[NÚMERO]

VERIFICAÇÃO INTERNA antes de responder:
→ Contar objetos em "lotes": deve ser exatamente ${batchCount}
→ Verificar que todos os IDs [${requiredIds}] estão presentes
→ Se contar < ${batchCount} → ERRO CRÍTICO → refazer

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

    } else if (stepId === "03") {
      // Show batch selection modal if batchesToProcess not yet provided
      if (!batchesToProcess) {
        const allBatches = batchesRef.current;
        if (allBatches.length === 0) {
          setError("Execute as Fases 1 e 2 antes de iniciar a Fase 3.");
          setStatusMessage("Fases anteriores necessárias.");
          return;
        }
        const hasPlans = allBatches.some(b => b.planMd && b.planMd.trim().length > 0);
        if (!hasPlans) {
          setError("Nenhum plano encontrado. Execute a Fase 2 antes de iniciar a Fase 3.");
          setStatusMessage("Fase 2 necessária — sem planos detectados.");
          return;
        }
        setBatchSelModal("03");
        return;
      }

      setStatusMessage("Iniciando Decisão Estratégica — Fase 3...");
      const currentBatchesList = batchesToProcess;
      const batchCount = currentBatchesList.length;
      if (batchCount === 0) { setError("Nenhum lote selecionado."); return; }

      const requiredIds = currentBatchesList.map(b => `"${b.id}"`).join(', ');
      const batchSummary = currentBatchesList.map(b =>
        `  - ID "${b.id}": (${b.severity}) — ${b.description}`
      ).join('\n');

      prompt = `INICIE_FASE_3

Execute a Fase 3 (Decisão Estratégica) de forma completa.

═══════════════════════════════════════════
LOTES DO PLANO (FASE 2)
═══════════════════════════════════════════
Total: ${batchCount} lotes
IDs obrigatórios: [${requiredIds}]

${batchSummary}

═══════════════════════════════════════════
REGRAS ABSOLUTAS:
═══════════════════════════════════════════
1. Leia o [FASE_2_JSON] injetado — é a fonte de verdade
2. Gere EXATAMENTE ${batchCount} lotes de decisão: [${requiredIds}]
3. Mínimo 1 decisão por lote
4. Decida autonomamente quando possível (requiresUser: false)
5. Marque requiresUser: true apenas para ações ambíguas ou destrutivas

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

    } else if (stepId === "04") {
      // Show batch selection modal if batchesToProcess not yet provided
      if (!batchesToProcess) {
        const allBatches = batchesRef.current;
        if (allBatches.length === 0) {
          setError("Execute as Fases 1, 2 e 3 antes de iniciar a Fase 4.");
          setStatusMessage("Fases anteriores necessárias.");
          return;
        }
        const hasPlans = allBatches.some(b => b.planMd && b.planMd.trim().length > 0);
        if (!hasPlans) {
          setError("Nenhum plano encontrado. Execute a Fase 2 antes de iniciar a Fase 4.");
          setStatusMessage("Fase 2 necessária — sem planos detectados.");
          return;
        }
        const batchesWithPending = allBatches.filter(b => (b.decisions || []).some(d => !d.resolved));
        if (batchesWithPending.length > 0) {
          const pendingCount = batchesWithPending.reduce((acc, b) => acc + (b.decisions || []).filter(d => !d.resolved).length, 0);
          const batchList = batchesWithPending.map(b => `Lote ${b.id}`).join(', ');
          setError(`${pendingCount} decisão(ões) pendentes nos lotes: ${batchList}. Abra cada lote na aba Decisões (F3) e escolha uma opção.`);
          setStatusMessage(`Decisões pendentes — revise: ${batchList}`);
          return;
        }
        setBatchSelModal("04");
        return;
      }

      setStatusMessage("Executando Refatoração — Fase 4...");
      const currentBatchesList = batchesToProcess;
      const batchCount = currentBatchesList.length;
      if (batchCount === 0) { setError("Nenhum lote selecionado."); return; }

      const requiredIds = currentBatchesList.map(b => `"${b.id}"`).join(', ');
      const batchSummary = currentBatchesList.map(b => {
        const fileList = b.files.slice(0, 5).join(', ') + (b.files.length > 5 ? ` ...+${b.files.length - 5}` : '');
        return `  - ID "${b.id}": ${b.files.length} arquivo(s) — ${b.description} | Arquivos: [${fileList}]`;
      }).join('\n');

      prompt = `INICIE_FASE_4

Execute a Fase 4 de forma determinística e completa.

═══════════════════════════════════════════
LISTA OBRIGATÓRIA — LOTES (FASE 3 — DECISÃO)
═══════════════════════════════════════════
Total: ${batchCount} lotes
IDs obrigatórios: [${requiredIds}]

Resumo dos lotes a executar:
${batchSummary}

═══════════════════════════════════════════
PROIBIDO ABSOLUTO:
═══════════════════════════════════════════
❌ Omitir lotes da execução
❌ Truncar conteúdo de arquivos (NUNCA use "// resto do código igual")
❌ Gerar arquivos parciais
❌ Criar ações não previstas nas decisões

═══════════════════════════════════════════
REGRAS ABSOLUTAS:
═══════════════════════════════════════════
1. Leia o [FASE_3_JSON] injetado — é a fonte de verdade (decisões já tomadas)
2. Execute EXATAMENTE ${batchCount} lotes: [${requiredIds}]
3. Respeite cada "decisaoFinal" de cada decisão do lote
4. Para cada arquivo modificado: campo "conteudo" SEMPRE completo
5. "log" de cada lote com telemetria: ações executadas, status, impacto

ATENÇÃO — JSON VÁLIDO:
→ Strings com newlines: use \\n (nunca quebra de linha literal)
→ Strings com aspas: use \\" (nunca aspas literais)
→ Backslashes: use \\\\ (nunca backslash literal)

VERIFICAÇÃO antes de responder:
→ Todos os ${batchCount} lotes [${requiredIds}] estão presentes?
→ Todos os arquivos modificados têm conteúdo COMPLETO?
→ O JSON é sintaticamente válido?

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;
    }

    handleSendMessage(prompt, stepId, undefined, batchesToProcess);
  };

  // ─── BATCH SELECTION CONFIRM ─────────────────────────────────────────────────

  const handleBatchSelectionConfirm = (step: string, batchIds: string[]) => {
    setBatchSelModal(null);
    clearPhaseData(step, batchIds);
    const filteredBatches = batchesRef.current.filter(b => batchIds.includes(b.id));
    onStepClick(step, filteredBatches);
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
    setStatusMessage("Standby. Inicie Phase 1 para Reconhecimento.");
    setConfig(prev => ({ ...prev, skillDocuments: [] }));
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
            newSkillDocs.push({ id: Math.random().toString(36).substr(2, 9), name: zipFile.name, content, size: content.length, type: zipFile.name.split('.').pop(), isRefactored: false });
          }
        }
      } else {
        const text = await file.text();
        newSkillDocs.push({ id: Math.random().toString(36).substr(2, 9), name: file.name, content: text, size: file.size, type: file.name.split('.').pop(), isRefactored: false });
      }
    }
    setConfig(prev => ({ ...prev, skillDocuments: [...prev.skillDocuments, ...newSkillDocs] }));
  }, []);

  // ─── SUPPLEMENTAL / FULL RE-ANALYSIS HANDLERS ───────────────────────────────

  const handleSupplementalAnalysis = useCallback((selectedFiles: Document[]) => {
    setReAnalysisModalOpen(false);
    isSupplementalRef.current = true;

    const totalFiles = selectedFiles.length;
    const prompt = `INICIE_FASE_1

Você está realizando uma ANÁLISE SUPLEMENTAR de arquivos que ficaram fora da análise principal.

DADOS:
- Total de arquivos neste lote suplementar: ${totalFiles}
- Você DEVE processar TODOS os ${totalFiles} arquivos

CLASSIFICAÇÃO ESPECIAL PARA ANÁLISE SUPLEMENTAR:
- Use gravidade "CINZA" para arquivos sem nexo técnico (lock files, gerados automaticamente, documentação vazia, configs triviais)
- Use gravidade "VERDE" para arquivos que estão OK e não precisam de alterações
- Use as gravidades normais (high/medium/low/critical) se detectar problemas reais

REGRAS:
1. Gere lotes com todos os ${totalFiles} arquivos
2. O campo "arquivos" deve conter APENAS paths reais recebidos como [FILE: path]
3. VALIDE: soma(lotes[i].arquivos.length) === ${totalFiles}

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

    handleSendMessage(prompt, "01", selectedFiles);
  }, []);

  const handleFullReanalysis = useCallback(() => {
    setReAnalysisModalOpen(false);
    setBatches([]);
    setCorrectedFiles([]);
    batchesRef.current = [];
    correctedFilesRef.current = [];
    isSupplementalRef.current = false;

    // Use selected docs from the file tree, not ALL uploaded docs
    const allDocs = documentsRef.current;
    const selectedDocs = selectedDocIds.size > 0
      ? allDocs.filter(d => selectedDocIds.has(d.id))
      : allDocs;
    const totalFiles = selectedDocs.length;

    const prompt = `INICIE_FASE_1

Execute a Fase 1 de forma determinística e completa.

DADOS DO CONTEXTO:
- Total de arquivos enviados: ${totalFiles}
- Você DEVE processar TODOS os ${totalFiles} arquivos sem exceção

REGRAS ABSOLUTAS:
1. Gere múltiplos lotes (quantidade DINÂMICA — sem limite máximo)
2. Distribua 100% dos ${totalFiles} arquivos nos lotes
3. O campo "arquivos" deve conter APENAS paths reais recebidos como [FILE: path]
4. VALIDE: soma(lotes[i].arquivos.length) === ${totalFiles}
5. Se a soma divergir, corrija internamente ANTES de gerar o JSON

FORMATO: JSON puro dentro de \`\`\`json ... \`\`\`
PROIBIDO texto fora do bloco JSON.`;

    setTimeout(() => handleSendMessage(prompt, "01", selectedDocs), 50);
  }, [selectedDocIds]);

  // ─── DERIVED VALUES ──────────────────────────────────────────────────────────

  const selectedDocuments = useMemo(() =>
    documents.filter(d => selectedDocIds.has(d.id)), [documents, selectedDocIds]);

  const totalChars = useMemo(() =>
    documents.reduce((acc, doc) => acc + doc.content.length, 0), [documents]);
  const estimatedTokens = (totalChars / 4 / 1000).toFixed(1);
  const totalBatchFiles = useMemo(() =>
    batches.reduce((acc, b) => acc + b.files.length, 0), [batches]);

  // Cache covered paths as a stable Set — avoids flatMap on every render
  const coveredPathsSet = useMemo(() => new Set(batches.flatMap(b => b.files)), [batches]);
  const uncoveredFiles  = useMemo(() =>
    documents.filter(d => !coveredPathsSet.has(d.name)), [documents, coveredPathsSet]);

  const handleToggleDocSelection = useCallback((ids: string[], selected: boolean) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => selected ? next.add(id) : next.delete(id));
      return next;
    });
  }, []);

  const steps = [
    { id: "01", label: "01 — Análise", shortLabel: "Análise" },
    { id: "02", label: "02 — Plano", shortLabel: "Plano" },
    { id: "03", label: "03 — Decisão", shortLabel: "Decisão" },
    { id: "04", label: "04 — Execução", shortLabel: "Execução" }
  ];

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div id="app-root" className="w-full h-screen bg-[#02040a] text-slate-200 font-sans overflow-hidden flex flex-col relative">
      <div className="fixed top-[-200px] left-[-200px] w-[600px] h-[600px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-200px] right-[-200px] w-[700px] h-[700px] bg-purple-900/10 rounded-full blur-[150px] pointer-events-none" />

      {!hasApiKey && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#02040a]/95 backdrop-blur-xl p-6">
          <div className="max-w-md w-full bg-white/[0.03] border border-white/10 p-10 rounded-[2.5rem] text-center space-y-8">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20">
              <ShieldAlert className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">System Lock</h2>
              <p className="text-sm text-slate-400">Chave GEMINI_API_KEY não detectada.</p>
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
          isLoading={isLoading}
          config={config}
          onConfigChange={setConfig}
          onSkillUpload={handleSkillUpload}
          selectedDocIds={selectedDocIds}
          onToggleDocSelection={handleToggleDocSelection}
        />

        <Messenger
          messages={messages}
          inputValue={userInput}
          onInputChange={(e) => setUserInput(e.target.value)}
          onSend={() => handleSendMessage()}
          onAbort={handleAbort}
          isLoading={isLoading}
          messagesEndRef={chatEndRef}
          statusMessage={statusMessage}
          steps={steps}
          activeStep={activeStep}
          onStepClick={onStepClick}
          hasDocuments={documents.length > 0}
          documents={documents}
          selectedDocuments={selectedDocuments}
          batches={batches}
          modelName={config.model}
        />

        <Registry
          lotes={batches}
          correctedFiles={correctedFiles}
          originalFiles={documents}
          activeStep={activeStep}
          uncoveredFiles={uncoveredFiles}
          totalDocuments={documents.length}
          onDecisionChoice={handleDecisionChoice}
          onReloadBatch={handleReloadBatch}
          onRedecideBatch={handleRedecideBatch}
          streamingText={streamingText}
          isStreaming={isLoading}
          provider={config.provider}
          model={config.model}
        />
      </main>

      {reAnalysisModalOpen && (
        <ReAnalysisModal
          uncoveredFiles={uncoveredFiles}
          allDocuments={documents}
          onFullReanalysis={handleFullReanalysis}
          onSupplementalAnalysis={handleSupplementalAnalysis}
          onCancel={() => setReAnalysisModalOpen(false)}
        />
      )}

      {batchSelModal && (
        <BatchSelectionModal
          targetStep={batchSelModal}
          batches={batches.filter(b => {
            if (batchSelModal === '03') return !!b.planMd;
            if (batchSelModal === '04') return !!(b.decisions && b.decisions.length > 0) || !!b.decisionsMd;
            return true;
          })}
          onConfirm={(batchIds) => handleBatchSelectionConfirm(batchSelModal, batchIds)}
          onCancel={() => setBatchSelModal(null)}
        />
      )}

      {allOkPopup && createPortal(
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-[#02040a]/90 backdrop-blur-md">
          <div className="bg-[#0b0e14] border border-emerald-500/30 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-7 flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-emerald-300 mb-2">
                  Projeto Sem Problemas!
                </h2>
                <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                  Todos os lotes foram analisados com gravidade <strong className="text-emerald-400">OK / BAIXA</strong>.
                  Seu projeto não apresenta problemas críticos detectáveis pela análise.
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setAllOkPopup(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
                >
                  Fechar
                </button>
                <button
                  onClick={() => { setAllOkPopup(false); setBatchSelModal("02"); }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20 transition-all"
                >
                  Gerar Plano Mesmo Assim
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

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
                <button onClick={() => setShowDebug(!showDebug)} className={`p-1.5 rounded-lg transition-colors ${showDebug ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/50'}`}>
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
                  [ENGINE_EXCEPTION]: {error}<br /><br />
                  [PROVIDER]: {config.provider.toUpperCase()}<br />
                  [MODEL]: {config.model}<br />
                  [TEMP]: {config.temperature}<br />
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
        onDownload={() => {
          setSelectedDownloadFiles(new Set(correctedFiles.map(f => f.name)));
          setShowDownloadModal(true);
        }}
        canDownload={correctedFiles.length > 0}
      />

      {/* ── DOWNLOAD MODAL ─────────────────────────────────────────────── */}
      {showDownloadModal && createPortal(
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-[#02040a]/95 backdrop-blur-md">
          <div className="bg-[#0b0e14] border border-cyan-500/20 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-cyan-500/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Download className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Download de Arquivos</h2>
                  <p className="text-[8px] font-mono text-slate-500">{correctedFiles.length} arquivo(s) disponível(is) · {selectedDownloadFiles.size} selecionado(s)</p>
                </div>
              </div>
              <button onClick={() => setShowDownloadModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all border border-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2 custom-scrollbar">
              {/* Select all / none */}
              <div className="flex justify-between items-center pb-2 mb-2 border-b border-white/5">
                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">Selecionar</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedDownloadFiles(new Set(correctedFiles.map(f => f.name)))}
                    className="text-[8px] font-bold text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
                    Todos
                  </button>
                  <button onClick={() => setSelectedDownloadFiles(new Set())}
                    className="text-[8px] font-bold text-slate-500 hover:text-slate-300 px-2 py-1 rounded border border-white/10 hover:border-white/20 transition-all">
                    Nenhum
                  </button>
                </div>
              </div>
              {correctedFiles.map(f => {
                const isSelected = selectedDownloadFiles.has(f.name);
                const delta = f.sizeChange || (f.content.length - f.originalSize);
                return (
                  <button key={f.name} onClick={() => setSelectedDownloadFiles(prev => {
                    const next = new Set(prev);
                    isSelected ? next.delete(f.name) : next.add(f.name);
                    return next;
                  })} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isSelected ? 'bg-cyan-500/8 border-cyan-500/25' : 'bg-white/[0.02] border-white/5 hover:border-white/15'}`}>
                    {isSelected
                      ? <CheckSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      : <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    }
                    <span className="text-[9px] font-mono text-slate-200 truncate flex-1">{f.name}</span>
                    <span className={`text-[8px] font-mono shrink-0 ${delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {delta > 0 ? '+' : ''}{(delta / 1024).toFixed(1)}KB
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Download actions */}
            <div className="px-5 py-4 border-t border-white/5 bg-black/20 shrink-0 space-y-2">
              {/* ZIP COMPLETO — all originals + fixed files merged in FIXED/ folder (default download) */}
              <button
                onClick={async () => {
                  const zip = new JSZip();
                  const fixedMap = new Map(correctedFiles.map(f => [f.name, f]));
                  // All uploaded documents: use fixed version if available, otherwise original; skip removed files
                  documents.forEach(doc => {
                    const fixedFile = fixedMap.get(doc.name);
                    if (fixedFile?.removed) return;
                    zip.file(doc.name, fixedFile?.content ?? doc.content);
                  });
                  const blob = await zip.generateAsync({ type: 'blob' });
                  const base = originalZipName ? `${originalZipName}_FIXED` : 'contextron_FIXED';
                  saveAs(blob, `${base}.zip`);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-all text-[9px] font-black uppercase tracking-widest"
              >
                <Archive className="w-3.5 h-3.5" />
                ZIP COMPLETO — {documents.length} arq. ({correctedFiles.length} corrigido(s) + {documents.length - correctedFiles.length} original(is))
              </button>

              {/* ZIP selected modified only */}
              <button
                disabled={selectedDownloadFiles.size === 0}
                onClick={async () => {
                  const zip = new JSZip();
                  correctedFiles.filter(f => selectedDownloadFiles.has(f.name) && !f.removed).forEach(f => zip.file(f.name, f.content));
                  const blob = await zip.generateAsync({ type: 'blob' });
                  const base = originalZipName ? `${originalZipName}_FIXED` : 'contextron_fixed';
                  saveAs(blob, `${base}_selecionados.zip`);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[9px] font-black uppercase tracking-widest"
              >
                <Archive className="w-3.5 h-3.5" />
                ZIP — Só Modificados ({selectedDownloadFiles.size} selecionado(s))
              </button>

              {/* Individual files */}
              <button
                disabled={selectedDownloadFiles.size === 0}
                onClick={() => {
                  const files = correctedFiles.filter(f => selectedDownloadFiles.has(f.name) && !f.removed);
                  files.forEach(f => {
                    const blob = new Blob([f.content], { type: 'text/plain;charset=utf-8' });
                    saveAs(blob, f.name.split('/').pop() || f.name);
                  });
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-300 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[9px] font-black uppercase tracking-widest"
              >
                <FileDown className="w-3.5 h-3.5" />
                Arquivos Individuais ({selectedDownloadFiles.size})
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
