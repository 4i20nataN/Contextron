
export type ModelType = 
  | 'gemini-3.1-pro-preview' 
  | 'gemini-3.1-flash-lite-preview' 
  | 'gemini-3-flash-preview' 
  | 'gemini-flash-latest' 
  | 'gemini-2.0-flash-exp' 
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
}

export interface Batch {
  id: string;
  name: string;
  description: string;
  symptoms?: string;
  files: string[];
  status: 'pending' | 'planned' | 'completed' | 'analyzed';
  severity: 'low' | 'medium' | 'high' | string;
  analysisMd?: string;
  planMd?: string;
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
