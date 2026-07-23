# Frost

Fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr) — a privacy-first
voice-to-text dictation app.

Frost adds:
- Orchestrator: routes voice through a Think Agent before TTS response
- Cactus: dedicated tool-calling agent (via Needle 26M model)
- RAG engine: SQLite + sqlite-vec for session/document retrieval
- Multi-agent dispatcher for parallel agent execution
- Loop/tool-call abuse control

## Build

npm run dev    # development
npm run build  # production build

## Tech

Electron 41, React 19, TypeScript, Tailwind v4, shadcn/ui,
better-sqlite3, whisper.cpp, sherpa-onnx, ONNX runtime
