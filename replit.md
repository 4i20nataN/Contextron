# Contextron — Mega Context Engine

React + Vite + TypeScript app for AI-powered multi-phase code analysis and refactoring using Google Gemini / OpenRouter.

## Run & Operate
```
npm run dev
```
App served on port 5000. Required env var: `GEMINI_API_KEY` (Google Gemini provider).

## Stack
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **AI**: Google Gemini (via @google/genai) or OpenRouter / custom OpenAI-compatible endpoint
- **UI libs**: lucide-react, react-markdown, react-diff-viewer-continued
- **File handling**: JSZip, file-saver

## Where things live
- `src/App.tsx` — Main state machine: file upload, phase orchestration, parallel analysis, download modal, `applyEdits()`, `parsePhase4Results()`
- `src/services/geminiService.ts` — AI API wrapper: context building per-phase, streaming, cancellation
- `src/components/Registry.tsx` — Right sidebar: compact "NAVEGAÇÃO POR LOTES" button (portal popover), telemetry panel, detail modals
- `src/components/Messenger.tsx` — Chat panel with phase step buttons
- `src/components/Sidebar.tsx` — Left panel: file tree, skill injection, doc selection
- `src/components/Header.tsx` — Config (provider/model/temp/skills)
- `src/components/Footer.tsx` — Status bar + download button
- `src/components/BatchSelectionModal.tsx` — Phase batch selector dialog
- `src/components/ReAnalysisModal.tsx` — Full/supplemental re-analysis dialog
- `src/types.ts` — Shared types: Document, Batch, Decision, CorrectedFile, AppConfig, Edicao, JSON phase types
- `src/constants.ts` — System prompts (NEVER EDIT), supported extensions
- `src/prompts/phase1-4.ts` — Phase system prompts (NEVER EDIT)

## Architecture decisions
- **Context Isolation**: F1 gets all files; F2 gets only F1 JSON; F3 gets only F2 JSON; F4 gets F2+F3 JSON **plus the original files from the selected batches** — required so the AI can produce line-accurate surgical edits.
- **Surgical Edit System (F4)**: Phase 4 outputs `edicoes[]` patches (SUBSTITUIR/INSERIR/REMOVER with 1-indexed line numbers) instead of full file content. `applyEdits()` in App.tsx applies them bottom-to-top to preserve line number validity. Eliminated the "snippet instead of full file" bug entirely.
- **Phase Reset Cascade**: `clearPhaseData` cascades downstream — clearing F2 also clears F3+F4; clearing F3 also clears F4. Prevents stale data conflicts.
- **Parallel Phase 1**: For ≥35 files, Phase 1 splits docs into chunks of 18 and runs concurrent API calls. Tradeoff: faster but reduces cross-file context awareness per chunk.
- **F4 Error Surfacing**: `parsePhase4Results` calls both `setIntegrityMessage` AND `setError` on failure, showing the red error banner with an actionable message.
- **Registry Provider/Model props**: Registry receives `provider` and `model` from App.tsx for display in the telemetry panel connection status row.
- **File Removal Support**: `CorrectedFile.removed?: boolean` — files marked for removal are excluded from all ZIP downloads and individual file exports.

## Product
- Upload ZIP or individual files; filter by selected subset
- 4-phase analysis pipeline with batch selection at each phase
- **"NAVEGAÇÃO POR LOTES"**: compact button in right sidebar — click to open a floating portal drawer listing all batches grouped by phase; each batch card opens the detail modal
- **Telemetry panel**: full header row clickable → expanded modal; streaming verbose shown at TOP of panel when active; provider/model/connection status row; F1–F4 tabs; F4 tab activates when any batch has executionMd
- Detail modal for each lote: analysis/plan/decisions/execution tabs; modal size presets MD/LG/XL/Full
- F4 diff viewer: file navigator on left + single diff on right; F1 file viewer same styled viewer
- Download modal: ZIP COMPLETO (skips removed files), ZIP só modificados, individual files
- Phase 4 pending-decisions error lists specific batch IDs with unresolved decisions
- Per-batch replan (F2) and redecide (F3); "All OK" popup when all batches low/green
- Coverage tracking + supplemental analysis for uncovered files
- Skill injection: upload skill docs to enrich AI context

## User preferences
- NEVER edit agent system prompts in `src/prompts/` or `src/constants.ts` prompt constants.

## Gotchas
- F4 JSON parsing: `edicoes[].conteudoNovo` strings must have newlines escaped as `\n` — the AI occasionally forgets this on large outputs. `extractJSON` has 4 robustness levels.
- `DECISION_OPTION_COLORS` is exported from Registry.tsx causing Vite HMR "incompatible export" warnings — cosmetic, no runtime impact.
- `applyEdits` sorts edits descending by line; INSERIR uses `linhaInicio + 0.5` fractional key so insertions interleave correctly with same-line substitutions.
