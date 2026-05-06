
import type { MutableRefObject } from "react";
import { GoogleGenAI } from "@google/genai";
import { Document, AppConfig } from "../types";
import { PHASE1_SYSTEM_PROMPT, PHASE2_SYSTEM_PROMPT, PHASE3_SYSTEM_PROMPT, PHASE4_SYSTEM_PROMPT } from "../constants";

let aiInstance: GoogleGenAI | null = null;

export function getAi() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please check AI Studio Secrets.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

function getContextLabel(phase: string): string {
  if (phase === "01") return "ARQUIVOS_DO_PROJETO (CÓDIGO-FONTE COMPLETO — ANALISE TODOS)";
  if (phase === "02") return "FASE_1_JSON (ANÁLISE COMPLETA — ÚNICA FONTE DE VERDADE)";
  if (phase === "03") return "FASE_2_JSON (PLANO COMPLETO — ÚNICA FONTE DE VERDADE)";
  if (phase === "04") return "CONTEXTO_EXECUCAO (PLANO F2 + DECISÕES F3 — FONTE DE VERDADE ABSOLUTA)";
  return "PROJECT CONTEXT";
}

function buildContext(
  phase: string,
  documents: Document[],
  extraContext: string,
  relevantFilePaths?: Set<string>
): { mainContext: string; contextSizeChars: number; description: string } {

  const formatDoc = (doc: Document) =>
    `[FILE: ${doc.name}]\n[SIZE: ${doc.size}B]\n[REFACTORED: ${doc.isRefactored ? 'YES' : 'NO'}]\nContent:\n${doc.content}\n---`;

  if (phase === "01") {
    const ctx = documents.map(formatDoc).join('\n\n');
    return {
      mainContext: ctx,
      contextSizeChars: ctx.length,
      description: `Fase 1 | ${documents.length} arquivos | ${(ctx.length / 1024).toFixed(0)}KB`
    };
  }

  if (phase === "02") {
    const ctx = extraContext.trim();
    if (!ctx) console.warn('[CONTEXTRON] AVISO: extraContext vazio para Fase 2!');
    return {
      mainContext: ctx,
      contextSizeChars: ctx.length,
      description: `Fase 2 | JSON F1 apenas | ${(ctx.length / 1024).toFixed(0)}KB`
    };
  }

  if (phase === "03") {
    const ctx = extraContext.trim();
    if (!ctx) console.warn('[CONTEXTRON] AVISO: extraContext vazio para Fase 3!');
    console.log(`[CONTEXTRON] Fase 3 — contexto isolado: ${(ctx.length / 1024).toFixed(0)}KB (arquivos originais: EXCLUÍDOS)`);
    return {
      mainContext: ctx,
      contextSizeChars: ctx.length,
      description: `Fase 3 (Decisão) | JSON F2 apenas | ${(ctx.length / 1024).toFixed(0)}KB | arquivos originais OMITIDOS`
    };
  }

  if (phase === "04") {
    // Fase 4: F2+F3 JSON + arquivos originais relevantes para edição cirúrgica completa.
    const ctx = extraContext.trim();
    console.log(`[CONTEXTRON] Fase 4 — contexto completo: ${(ctx.length / 1024).toFixed(0)}KB (F2+F3+arquivos originais)`);
    return {
      mainContext: ctx,
      contextSizeChars: ctx.length,
      description: `Fase 4 (Execução) | F2+F3 JSON + arquivos originais | ${(ctx.length / 1024).toFixed(0)}KB`
    };
  }

  const ctx = documents.map(formatDoc).join('\n\n') + extraContext;
  return { mainContext: ctx, contextSizeChars: ctx.length, description: `Fase ${phase} | fallback` };
}

export async function generateDeepAnalysis(
  documents: Document[],
  prompt: string,
  config: AppConfig,
  phase: string = "01",
  extraContext: string = "",
  onChunk?: (text: string) => void,
  relevantFilePaths?: Set<string>,
  cancelledRef?: MutableRefObject<boolean>,
  onRawChunk?: (delta: string) => void
) {
  const { mainContext, contextSizeChars, description } = buildContext(
    phase, documents, extraContext, relevantFilePaths
  );

  console.log(`[CONTEXTRON] ${description}`);
  console.log(`[CONTEXTRON] Tokens estimados: ~${Math.round(contextSizeChars / 4).toLocaleString()}`);

  const skillsText = config.skills ? `\n\nMANUAL SKILLS/TECHNIQUES:\n${config.skills}` : "";
  const skillsDocsContext = config.skillDocuments.length > 0
    ? `\n\nKNOWLEDGE BASE (SKILLS):\n${config.skillDocuments.map(d => `[SKILL: ${d.name}]\n${d.content}`).join('\n\n')}`
    : "";

  let baseSystemPrompt = PHASE1_SYSTEM_PROMPT;
  if (phase === "02") baseSystemPrompt = PHASE2_SYSTEM_PROMPT;
  if (phase === "03") baseSystemPrompt = PHASE3_SYSTEM_PROMPT;
  if (phase === "04") baseSystemPrompt = PHASE4_SYSTEM_PROMPT;

  const systemInstructions = `SYSTEM PROTOCOL:\n${baseSystemPrompt}${skillsText}${skillsDocsContext}`;
  const contextLabel = getContextLabel(phase);

  if (config.provider === 'google') {
    const ai = getAi();
    try {
      const modelId = config.model.startsWith('models/') ? config.model : `models/${config.model}`;
      console.log(`[CONTEXTRON] → Google AI | model: ${modelId} | phase: ${phase} | temp: ${config.temperature}`);

      const stream = await ai.models.generateContentStream({
        model: modelId,
        contents: {
          parts: [
            { text: `${contextLabel}:\n\n${mainContext}` },
            { text: `COMMAND: ${prompt}` }
          ]
        },
        config: {
          systemInstruction: systemInstructions,
          temperature: config.temperature,
        }
      });

      let fullText = '';
      let loteCount = 0;
      let lastChunkCall = 0;
      for await (const chunk of stream) {
        if (cancelledRef?.current) {
          console.log('[CONTEXTRON] ⛔ Operação cancelada pelo usuário.');
          throw new Error('__CANCELLED__');
        }
        const delta = chunk.text ?? '';
        fullText += delta;

        if (onRawChunk && delta) {
          onRawChunk(delta);
        }

        if (onChunk && delta) {
          const newIds = (delta.match(/"id"\s*:\s*"\d+"/g) || []).length;
          if (newIds > 0) {
            loteCount += newIds;
            const now = Date.now();
            if (now - lastChunkCall > 250) {
              onChunk(String(loteCount));
              lastChunkCall = now;
            }
          }
        }
      }

      console.log(`[CONTEXTRON] ✓ Fase ${phase} concluída | resposta: ${(fullText.length / 1024).toFixed(1)}KB`);
      return fullText;

    } catch (err: any) {
      if (err.message === '__CANCELLED__') throw err;
      console.error("[CONTEXTRON] Google AI Error:", err);
      throw new Error(`[Google AI] ${err.message || 'Erro desconhecido na geração'}`);
    }

  } else {
    const baseUrl = config.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : (config.baseUrl || 'http://localhost:11434/v1');

    const apiKey = config.apiKey || (config.provider === 'openrouter' ? '' : 'no-key');

    const abortController = new AbortController();
    let cancelCheckInterval: ReturnType<typeof setInterval> | null = null;

    if (cancelledRef) {
      cancelCheckInterval = setInterval(() => {
        if (cancelledRef.current) {
          abortController.abort();
        }
      }, 200);
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Contextron - Mega Context Engine'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: `${contextLabel}:\n\n${mainContext}\n\nCOMMAND: ${prompt}` }
          ],
          temperature: config.temperature,
          stream: true,
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error: ${response.status}`);
      }

      // Try streaming for OpenRouter/custom
      const reader = response.body?.getReader();
      if (!reader) {
        const data = await response.json();
        return data.choices[0].message.content;
      }

      let fullText = '';
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cancelledRef?.current) throw new Error('__CANCELLED__');
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');
        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            fullText += delta;
            if (onRawChunk && delta) onRawChunk(delta);
          } catch {}
        }
      }
      return fullText || '';

    } catch (err: any) {
      if (err.name === 'AbortError' || cancelledRef?.current) throw new Error('__CANCELLED__');
      throw err;
    } finally {
      if (cancelCheckInterval) clearInterval(cancelCheckInterval);
    }
  }
}
