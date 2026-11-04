# Frost — Agent Memory

## Project Overview

Frost is a desktop AI agent platform: a fork of Frost (Electron + React voice dictation app) with the oh-my-pi coding agent engine embedded. Combines voice I/O with multi-agent orchestration, tool calling, and RAG.

## Tech Stack

Electron 41, React 19, TypeScript, Tailwind v4, shadcn/ui, better-sqlite3, whisper.cpp, sherpa-onnx, ONNX runtime, `@oh-my-pi/pi-coding-agent`

## Architecture (Monolith in Electron)

```
Voice (STT/TTS) → Orchestrator → Think Agent → Cactus (Needle) → omp tools → TTS
```

### Layers
- **Storage**: better-sqlite3 + sqlite-vec
- **Agent Engine**: `@oh-my-pi/pi-coding-agent` (omp SDK)
- **Cactus**: Needle 26M via ONNX runtime (tool calling)
- **Orchestrator**: TypeScript service — pipeline, multi-agent dispatcher, loop control
- **Voice**: whisper.cpp / sherpa-onnx (STT), Piper/Kokoro (TTS)
- **UI**: React 19 + Tailwind v4 + shadcn/ui

### Modes
- **Dictation**: Original Frost behavior — no agent
- **Chat**: Voice/type → Think Agent → Cactus → TTS
- **Code** (v2): Full omp tool surface (LSP, DAP, workspace)

## Live Orchestrator (decision layer)

Runtime is **CommonJS** in `src/main/orchestrator/`, wired by
`src/helpers/frostIntegration.js`. The TypeScript files (`index.ts`, `pipeline.ts`,
`thinkAgent.ts`) are **INERT** — not imported by the app. Do not add features there.
Full reference: `docs/ORCHESTRATOR.md`.

```
decide → answer bank → knowledge → generate → validate
```

- Intents: `dictation`, `smalltalk`, `knowledge`, `generate`, `code`, `clarify`.
- Only `code` opens the tool surface, and only with a code verb or 2+ independent signals.
- `clarify` answers without a model call (empty input, loose confirmation, short fragment).
- The answer bank (`userData/frost-answers.json`) wins over generation for repeated questions.
- `wakeWord.js` strips a leading wake phrase. Always-on keyword spotting does not exist yet.

## Phase 1 Status ✅ (11 commits)

### Files Created/Modified

**Main process (Electron):**
- `main.js` — FrostIntegration wired into startup (`initializeDeferredManagers`) and teardown (`performSyncTeardown`)
- `preload.js` — Added `frostChat`, `frostGetMode`, `frostSetMode`, `onFrostModeChanged` bridges
- `src/helpers/frostIntegration.js` — FrostIntegration class (init, IPC handlers, destroy)
- `src/helpers/tray.js` — Mode submenu (Dictation/Chat radio), tooltip suffix

**Orchestrator layer:**
- `src/main/ompBridge.cjs` — CJS OmpBridge wrapping omp SDK (init/prompt/destroy)
- `src/main/omp-bridge.ts` — TS version (type docs, needs compilation to be usable)
- `src/main/orchestrator/index.ts` — Orchestrator class
- `src/main/orchestrator/pipeline.ts` — Pipeline (Think step)
- `src/main/orchestrator/thinkAgent.ts` — ThinkAgent wrapping OmpBridge
- `src/shared/types.ts` — FrostMode, OrchestratorConfig, AgentResponse, ToolCallRecord, PipelineStep

**Renderer (React):**
- `src/components/chat/ChatModeView.jsx` — Chat conversation view (message list, text input, IPC send)
- `src/components/chat/MessageBubble.jsx` — Message bubble component
- `src/App.jsx` — Mode-based routing (dictation vs chat)

**Tests:**
- `test/omp-bridge.test.ts` — "throw before initialize" test
- `test/orchestrator.test.ts` — Dictation passthrough test

### IPC Channels
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `frost:setMode` | renderer → main | Switch mode (dictation/chat) |
| `frost:getMode` | renderer → main | Get current mode |
| `frost:chat` | renderer → main | Send chat text, get response |
| `frost:modeChanged` | main → renderer | Broadcast mode change |

### Completion Criteria
- [x] Fork builds and runs as "Frost"
- [x] omp SDK loads without error
- [x] Orchestrator initializes on app start
- [x] Dictation mode passes through without agent
- [x] Chat mode routes text through Think Agent (via IPC)
- [x] Chat UI shows conversation history
- [x] System tray shows current mode
- [x] Mode switching works from tray

### Pending
- [ ] Set up GitHub remote and push
- [ ] Voice pipeline integration (route STT through Orchestrator in chat mode)
- [ ] Better test coverage for chat mode

## Phase 2 Plan (Next)

1. **Cactus (Needle) integration** — Load Needle 26M via ONNX runtime, wire into Orchestrator as tool-calling agent
2. **Loop Control** — LoopDetector with configurable thresholds (dedup, burst, response similarity)
3. **Multi-Agent Dispatcher** — Parallel sub-agent fan-out via omp's task tool

## Phase 3 Plan (Future)

4. **RAG Engine** — SQLite + sqlite-vec, ingestion pipeline (text/PDF/images), local embeddings via ONNX
5. **Session archival** — Auto-index past conversations into vector DB

## v2 (Future)

- Split into Front-Hand (Electron UI + voice) and Back-Hand (server: Docker, PostgreSQL + pgvector)
- Code mode with full omp tool surface

## Local Model Strategy

Local models often fail at tool calling (loop on same call). Solution: Cactus (Needle) is a tiny 26M model dedicated ONLY to function calling — it converts Think Agent's intent into structured tool calls. Think Agent uses any model (local or cloud). This separates reasoning from tool calling, making local models viable.

## Key Files to Know

| File | Purpose |
|------|---------|
| `main.js` | Electron entry — 1811 lines, has `startApp()` with Phase 1/2 init |
| `src/helpers/frostIntegration.js` | Frost IPC handlers and lifecycle |
| `src/main/ompBridge.cjs` | omp SDK wrapper (CommonJS) |
| `src/main/orchestrator/` | ThinkAgent, Pipeline, Orchestrator (TypeScript) |
| `src/components/chat/ChatModeView.jsx` | Chat UI |
| `src/helpers/tray.js` | System tray with mode toggle |
| `preload.js` | IPC bridges exposed to renderer |

## Build Commands

```bash
npm run dev        # Development (renderer + Electron)
npm run build      # Production build
npx vitest run    # Run tests
cd src && npx vite build  # Just renderer build
```

### Windows build from WSL

`./scripts/cross-build-windows.sh` produces the Windows installers from Linux. It
exists because the naive path silently ships Linux native modules: `@electron/rebuild`
downloads the host-platform prebuild for `better-sqlite3`, and the NSIS step needs Wine.
The script swaps the three platform-specific binaries, downloads the win32 resources
with `TARGET_PLATFORM=win32`, compiles the key listener with mingw and runs
electron-builder inside `electronuserland/builder:wine`.
