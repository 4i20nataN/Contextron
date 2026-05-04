
import { GoogleGenAI } from "@google/genai";
import { Document, AppConfig } from "../types";
import { PHASE1_SYSTEM_PROMPT, PHASE2_SYSTEM_PROMPT, PHASE3_SYSTEM_PROMPT } from "../constants";

let aiInstance: GoogleGenAI | null = null;

export function getAi() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Note: According to skill, we shouldn't show UI for this, 
      // but an error message for developers in console or a graceful catch is okay.
      throw new Error("GEMINI_API_KEY is not defined. Please check AI Studio Secrets.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function generateDeepAnalysis(documents: Document[], prompt: string, config: AppConfig, phase: string = "01", extraContext: string = "", onChunk?: (text: string) => void) {
  const fullContext = documents.map(doc => 
    `[FILE: ${doc.name}]\n[SIZE: ${doc.size}B]\n[REFACTORED: ${doc.isRefactored ? 'YES' : 'NO'}]\nContent:\n${doc.content}\n---`
  ).join('\n\n') + extraContext;

  const skillsText = config.skills ? `\n\nMANUAL SKILLS/TECHNIQUES:\n${config.skills}` : "";
  const skillsDocsContext = config.skillDocuments.length > 0 
    ? `\n\nKNOWLEDGE BASE (SKILLS):\n${config.skillDocuments.map(d => `[SKILL: ${d.name}]\n${d.content}`).join('\n\n')}`
    : "";

  let baseSystemPrompt = PHASE1_SYSTEM_PROMPT;
  if (phase === "02") baseSystemPrompt = PHASE2_SYSTEM_PROMPT;
  if (phase === "03") baseSystemPrompt = PHASE3_SYSTEM_PROMPT;

  const systemInstructions = `SYSTEM PROTOCOL:\n${baseSystemPrompt}${skillsText}${skillsDocsContext}`;
  
  if (config.provider === 'google') {
    const ai = getAi();
    
    try {
      const modelId = config.model.startsWith('models/') ? config.model : `models/${config.model}`;
      console.log(`[Google AI] Calling model: ${modelId}`);

      const stream = await ai.models.generateContentStream({
        model: modelId,
        contents: {
          parts: [
            { text: `PROJECT CONTEXT:\n\n${fullContext}` },
            { text: `COMMAND: ${prompt}` }
          ]
        },
        config: {
          systemInstruction: systemInstructions,
          temperature: config.temperature,
        }
      });

      let fullText = '';
      for await (const chunk of stream) {
        fullText += chunk.text;
        if (onChunk) onChunk(fullText);
      }

      return fullText;
    } catch (err: any) {
      console.error("Google AI Detailed Error:", err);
      // The error might contain 404 if the model name is incorrect or restricted.
      throw new Error(`[Google AI] ${err.message || 'Erro deconhecido na geração'}`);
    }
  } else {
    // OpenRouter or Custom (OpenAI compatible) remains the same as it uses standard fetch
    const baseUrl = config.provider === 'openrouter' 
      ? 'https://openrouter.ai/api/v1' 
      : (config.baseUrl || 'http://localhost:11434/v1');
    
    const apiKey = config.apiKey || (config.provider === 'openrouter' ? '' : 'no-key');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin, // Required by OpenRouter
        'X-Title': 'Mega Context Analyzer'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemInstructions },
          { role: 'user', content: `PROJECT CONTEXT:\n\n${fullContext}\n\nCOMMAND: ${prompt}` }
        ],
        temperature: config.temperature,
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}
