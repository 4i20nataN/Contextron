
export type ModelType = 
  | 'gemini-2.5-pro-preview-05-06'
  | 'gemini-2.5-flash-preview-05-20'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-exp'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  | 'custom';
export type ProviderType = 'google' | 'openrouter' | 'custom';

export interface Document {
  id: string;
  name: string;
  content: string;
  size: number;
  type?: string;
  isRefactored?: boolean;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp?: string;
}

export interface CorrectedFile {
  name: string;
  content: string;
  sizeChange: number;
  originalSize: number;
  tokensSaved?: number;
  removed?: boolean;
}

export interface Decision {
  id: string;
  descricao: string;
  rationale: string;
  requiresUser: boolean;
  agentChoice?: string;
  userChoice?: string;
  options: string[];
  resolved: boolean;
}

export interface Batch {
  id: string;
  name: string;
  description: string;
  symptoms?: string;
  files: string[];
  status: 'pending' | 'planned' | 'completed' | 'analyzed';
  severity: 'low' | 'medium' | 'high' | 'critical' | 'cinza' | 'verde' | string;
  isSupplemental?: boolean;
  analysisMd?: string;
  planMd?: string;
  decisionsMd?: string;
  decisions?: Decision[];
  executionMd?: string;
  executionStats?: {
    tokensReduced: number;
    linesRemoved: number;
    sizeDelta: number;
  };
}

export interface AppConfig {
  provider: ProviderType;
  model: ModelType | string;
  apiKey?: string;
  baseUrl?: string;
  skills: string;
  skillDocuments: Document[];
  temperature: number;
}

// ─── JSON RESPONSE TYPES ──────────────────────────────────────────────────────

export interface Phase1LoteJSON {
  id: string;
  gravidade: string;
  impacto: string;
  arquivos: string[];
  analise: string;
}

export interface Phase1ResponseJSON {
  phase: 1;
  totalArquivos: number;
  lotes: Phase1LoteJSON[];
}

export interface Phase2LoteJSON {
  id: string;
  gravidade: string;
  objetivo: string;
  plano: string;
}

export interface Phase2ResponseJSON {
  phase: 2;
  lotes: Phase2LoteJSON[];
}

// ─── PHASE 3 — DECISION ──────────────────────────────────────────────────────

export interface Phase3DecisionItemJSON {
  id: string;
  descricao: string;
  rationale: string;
  requiresUser: boolean;
  agentChoice?: string;
  options: string[];
}

export interface Phase3DecisionLoteJSON {
  id: string;
  gravidade: string;
  sumario: string;
  podeProsseguir: boolean;
  decisoes: Phase3DecisionItemJSON[];
}

export interface Phase3DecisionResponseJSON {
  phase: 3;
  lotes: Phase3DecisionLoteJSON[];
}

// ─── PHASE 4 — EXECUTION ─────────────────────────────────────────────────────

export interface Edicao {
  tipo: 'SUBSTITUIR' | 'INSERIR' | 'REMOVER';
  linhaInicio: number;
  linhaFim?: number;
  conteudoNovo?: string;
}

export interface Phase3ArquivoModificadoJSON {
  path: string;
  edicoes: Edicao[];
  removerArquivo?: boolean;
}

export interface Phase3LoteJSON {
  id: string;
  gravidade: string;
  status: string;
  impacto: string;
  log: string;
  arquivosModificados: Phase3ArquivoModificadoJSON[];
}

export interface Phase3ResponseJSON {
  phase: 3 | 4;
  lotes: Phase3LoteJSON[];
}
