# Changelog

## Orchestrator de decisão — 2026-11-04

### Decision layer (live runtime, CommonJS)
- `src/main/orchestrator/decisionEngine.js`: intenções `dictation | smalltalk | knowledge | generate | code | clarify`
- Tools só com verbo de código ou 2+ sinais independentes — fim do "só escrever código"
- `clarify` responde sem chamar o modelo
- `src/main/orchestrator/wakeWord.js`: parsing de `hey frost` / `oi frost` / `frost`

### Saved knowledge
- `answerBank.js` + `answerBankStore.js`: respostas canônicas com match exato, normalizado e fuzzy
- Persistência atômica em `userData/frost-answers.json`
- IPC `frost:answers:list|upsert|delete` e `frost:getLastTurn`, expostos em `preload.js`

### Model integration
- `systemPrompt.js`: prompt por intenção, proíbe código não solicitado e fatos inventados
- `src/main/chatCompletionClient.js`: cliente OpenAI-compatible extraído, com suporte a https e timeout
- `ompBridge.prompt(text, options)` agora aceita system prompt, temperatura e timeout
- `FrostIntegration` passa a usar o `FrostOrchestrator` real (o esqueleto TS fica marcado como inerte)

### Tests
- 62 testes em `test/orchestrator/*.test.js` (`node --test`)

## Phase 1 — 2026-07-23

### Fork and Rename
- Forked Frost → Frost
- Renamed app in package.json, electron-builder.json, main.js
- Fixed remaining references (registerFrostProtocol, OPENWHISPR_AUTH_BRIDGE_PORT)

### omp SDK Integration
- Added `@oh-my-pi/pi-coding-agent` as dependency
- Created OmpBridge wrapper (CJS) with init/prompt/destroy lifecycle
- Created shared type definitions (FrostMode, OrchestratorConfig, AgentResponse)

### Orchestrator
- Created ThinkAgent class wrapping OmpBridge
- Created Pipeline for STT→Think→TTS flow
- Created Orchestrator service with mode management
- Added pipeline callback support for progress reporting

### App Lifecycle Integration
- Created FrostIntegration module wired into main.js startup
- Registered IPC handlers: frost:setMode, frost:getMode, frost:chat
- Added cleanup on app teardown
- Exposed IPC bridges in preload.js

### Chat Mode UI
- Created ChatModeView with message list, auto-scroll, text input
- Created MessageBubble component
- Wired ChatView to Orchestrator via IPC
- Added send-in-progress guard

### System Tray
- Added Dictation/Chat mode radio submenu
- Tooltip suffix shows current mode
- Mode changes broadcast to all windows

### Quality
- 2 new tests (omp-bridge, orchestrator)
- All syntax checks clean
- Final review with minor fixes applied
