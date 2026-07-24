# Changelog

## Phase 1 — 2026-07-23

### Fork and Rename
- Forked OpenWhispr → Frost
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
