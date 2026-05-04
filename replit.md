# MegaContext Engine v8.0 — Auditoria e Refatoração de Projetos por IA

## Visão Geral

Engine automatizado de auditoria e refatoração de projetos de software baseado em IA. Recebe um conjunto de arquivos (código, documentação técnica, auditorias), faz análise profunda em 3 fases e gera diagnósticos, planos de correção e execução das melhorias com validação e telemetria.

## Stack Técnica

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **IA**: Google Gemini via `@google/genai` (streaming) + suporte a OpenRouter / modelos custom (OpenAI-compatible)
- **UI**: Lucide React, React Markdown, React Diff Viewer
- **Export**: JSZip + file-saver

## Arquitetura

```
src/
├── App.tsx                  # Orquestrador principal + parsers + estado global
├── types.ts                 # Interfaces: Document, Batch, CorrectedFile, AppConfig
├── constants.ts             # Extensões suportadas + re-exports dos prompts
├── services/
│   └── geminiService.ts     # Chamadas streaming ao Gemini e OpenRouter
├── prompts/
│   ├── phase1.ts            # System prompt da Fase 1 (Análise)
│   ├── phase2.ts            # System prompt da Fase 2 (Planejamento)
│   └── phase3.ts            # System prompt da Fase 3 (Execução)
└── components/
    ├── Header.tsx            # Barra superior: stats, config, integridade
    ├── Sidebar.tsx           # Upload de arquivos, skill injector, fluxo
    ├── Messenger.tsx         # Chat terminal com streaming
    ├── Registry.tsx          # Navegação de lotes, diff viewer, telemetria
    └── Footer.tsx            # Progress bar, status, download ZIP
```

## Fluxo das 3 Fases

### Fase 1 — Análise e Reconhecimento
- Lê 100% dos arquivos carregados
- Cria múltiplos lotes (quantidade **dinâmica, sem limite máximo**)
- Cada lote gera um `[FILE: /analysis/lote-XXX.md][END_FILE]`
- Parser extrai arquivos listados com 6 padrões de regex diferentes
- Validação de integridade: `soma(lotes[i].files.length) === totalArquivos`

### Fase 2 — Blueprint e Planejamento M2M
- Consome os lotes da Fase 1 como contexto
- Gera plano de ações por lote: `[FILE: /plan/lote-XXX.md][END_FILE]`
- Cada ação tem ID único: `AÇÃO-[LOTE]-[ARQUIVO]-[NÚMERO]`

### Fase 3 — Execução e Refatoração
- Consome o plano da Fase 2 como contexto
- Gera arquivos corrigidos COMPLETOS: `[FILE: caminho/arquivo.ext][END_FILE]`
- Gera logs de execução: `[FILE: /execution/lote-XXX-log.md][END_FILE]`
- UI exibe diff lado a lado (antes vs depois)

## Configurações

- **Provider**: Google AI (Gemini), OpenRouter, ou modelo local custom
- **API Key**: Configurada via variável de ambiente `GEMINI_API_KEY`
- **Temperature**: 0.0–1.0 (padrão 0.2 para análise determinística)
- **Skills**: Injeção de técnicas manuais ou documentos .md/.zip como regras do agente

## Variáveis de Ambiente

- `GEMINI_API_KEY` — chave da Google AI Studio (obrigatória para provider Google)

## Correções Aplicadas na v8.0

1. **Parser abrangente**: 6 padrões de regex para capturar arquivos em bullets, code spans, tabelas, cabeçalhos, labels nomeados e pipes
2. **Remoção do limite de 3 lotes**: loteamento agora é dinâmico e ilimitado
3. **Contador global corrigido**: atualiza após parsing real dos lotes (não apenas streaming)
4. **Integridade de lotes**: badge visual ✓/⚠ no header com verificação `soma === totalArquivos`
5. **`executionMd` tipado**: campo adicionado ao interface `Batch` — eliminado cast `as any`
6. **Severity mapping normalizado**: converte PT→EN internamente, sem conflito no `getSeverity()`
7. **Prompts determinísticos**: penalidade explícita por omissão, fórmula dinâmica de loteamento, OUTPUT minimalista no chat
8. **Triggers de fase reescritos**: injetam `totalArquivos` no prompt, removem limite "2 a 4"
9. **Fallback sem dados hardcoded**: removido `['App.tsx', 'index.tsx', 'utils.ts']` como fallback de arquivos
10. **Mensagem de integridade**: exibida no header com estado OK/AVISO/VERIFICANDO

## Execução Local

```bash
npm install
npm run dev  # porta 5000
```
