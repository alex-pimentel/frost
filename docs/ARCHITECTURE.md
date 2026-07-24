# Frost — Architecture Guide

## Overview

Frost é um aplicativo desktop (Electron) que combina **ditado por voz** com **agente AI conversacional**.

```
 ┌─────────────────────────────────────────────────────┐
 │                     Frost App                       │
 │                      (Electron)                     │
 ├─────────────────┬───────────────────┬───────────────┤
 │   Dictation     │      Chat         │   Settings    │
 │   (voz → texto) │ (voz/type → IA)   │   (config)    │
 └─────────────────┴───────────────────┴───────────────┘
```

---

## Dois Modos de Operação

### 1. Modo Dictation (padrão)
**Herança direta do OpenWhispr.** Nada mudou.

```
Falar → Microfone → Whisper.cpp (STT) → texto aparece onde o cursor está
```

- Aperte o hotkey, fale, o texto é transcrito e colado
- Sem IA, sem agente, sem processamento extra
- Funciona exatamente como o OpenWhispr original

### 2. Modo Chat
**Novo no Frost.** Adiciona um agente AI entre a voz e a resposta.

```
Falar → STT → Orchestrator → Think Agent (modelo) → TTS → você escuta
                                             ou
Digitar → Chat UI → Orchestrator → Think Agent (modelo) → resposta na tela
```

- Você pode falar OU digitar
- O Think Agent processa e responde
- Se configurado com LM Studio, usa seu modelo local

---

## Process Architecture (Dois Processos)

### Processo Principal (Main Process)
`main.js` + módulos em `src/helpers/` e `src/main/`

```
main.js (1800 linhas) — entry point do Electron
  │
  ├── initializeCoreManagers() — sobe os serviços na inicialização
  │     ├── whisperManager — STT local (whisper.cpp)
  │     ├── parakeetManager — STT local alternativo
  │     ├── windowManager — janelas da UI
  │     ├── databaseManager — SQLite (better-sqlite3)
  │     ├── trayManager — ícone na bandeja do sistema
  │     └── ipcHandlers — pontes entre main e renderer
  │
  ├── initializeDeferredManagers() — serviços secundários
  │     ├── frostIntegration ← NOVO: nosso código Frost
  │     │     ├── OmpBridge — conexão com modelo (LM Studio)
  │     │     └── IPC handlers — frost:chat, frost:getSettings, etc.
  │     └── qdrantManager — vetores (NÃO usado pelo Frost ainda)
  │
  └── performSyncTeardown() — limpeza ao fechar
        └── frostIntegration.destroy()
```

### Processo Renderer (UI)
React em `src/components/` + `src/App.jsx`

```
App.jsx — roteia entre Dictation e Chat baseado no modo
  │
  ├── Modo Dictation: mostra a UI original do OpenWhispr
  │     (floating icon, overlay de gravação, etc.)
  │
  └── Modo Chat: mostra ChatModeView
        │
        ├── MessageBubble — bolha de mensagem (usuário/assistente)
        ├── SettingsDialog — configurar modelo (URL + API key + modelo)
        └── ChatModeView — lista de mensagens + input

A comunicação entre Renderer e Main Process é via IPC:
  window.electronAPI.frostChat("texto")  →  frost:chat  →  main process
  window.electronAPI.frostGetSettings()  →  frost:getSettings  →  main process
```

---

## Fluxo Detalhado: Chat Mode

```
Você digita "Olá, quem é você?"
        │
        ▼
  ChatModeView.sendMessage()
        │
        ▼
  IPC: window.electronAPI.frostChat("Olá, quem é você?")
        │
        ▼
  main process: ipcMain.handle("frost:chat")
        │
        ▼
  FrostIntegration.orchestrator.processVoiceInput("Olá, quem é você?")
        │
        ├── Modo Dictation? → retorna o texto sem mudar (passthrough)
        │
        └── Modo Chat?
              │
              ▼
        OmpBridge.prompt("Olá, quem é você?")
              │
              ├── Tem modelo configurado? (providerUrl + modelId)
              │     │
              │     └── SIM → HTTP POST para LM Studio:
              │             POST http://localhost:1234/v1/chat/completions
              │             Body: { model: "seu-modelo", messages: [...] }
              │             Resposta: texto do modelo
              │
              └── Não tem modelo configurado?
                    │
                    └── Mensagem: "No model configured. Open Settings."
        │
        ▼
  Resposta volta pelo IPC
        │
        ▼
  ChatModeView mostra a resposta numa MessageBubble
```

---

## Onde está cada parte

```
C:\Users\alex_\projects\tauri_calc\
│
├── main.js                        ★ Processo principal (Electron entry)
├── preload.js                     ★ Pontes IPC entre main e renderer
│
├── src/
│   ├── main/
│   │   ├── ompBridge.cjs          ★ Ponte para o modelo (LM Studio)
│   │   ├── omp-bridge.ts          (type docs — não compilado)
│   │   └── orchestrator/
│   │       ├── index.ts           Orchestrator (type docs)
│   │       ├── pipeline.ts        Pipeline (type docs)
│   │       └── thinkAgent.ts      ThinkAgent (type docs)
│   │
│   ├── helpers/
│   │   ├── frostIntegration.js    ★ Nosso código: init, IPC, lifecycle
│   │   ├── tray.js                ★ Menu da bandeja com toggle modo
│   │   └── ... (OpenWhispr original)
│   │
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatModeView.jsx   ★ UI do chat (mensagens + input)
│   │   │   └── MessageBubble.jsx  ★ Bolha de mensagem
│   │   └── settings/
│   │       └── SettingsDialog.jsx  ★ Tela de configurar modelo
│   │
│   ├── shared/
│   │   └── types.ts               ★ Tipos compartilhados
│   │
│   └── ... (OpenWhispr original)
│
├── AGENTS.md                       ★ Memória do projeto para agentes AI
├── CHANGELOG.md                    ★ Histórico de mudanças
└── docs/
    ├── ARCHITECTURE.md             ★ Este arquivo
    └── superpowers/
        ├── specs/                   ★ Design completo do sistema
        └── plans/                   ★ Planos de implementação
```

★ = criado ou modificado pelo Frost

---

## Dependências Externas

| Dependência | O que faz | Origem |
|------------|-----------|--------|
| **Electron 41** | Roda o app desktop | OpenWhispr |
| **React 19** | UI | OpenWhispr |
| **whisper.cpp** | STT local (voz → texto) | OpenWhispr |
| **sherpa-onnx** | STT local alternativo | OpenWhispr |
| **better-sqlite3** | Banco de dados | OpenWhispr |
| **@oh-my-pi/pi-coding-agent** | Engine de agente (não usado ainda — preparado pra Phase 2) | Frost |
| **LM Studio** | Modelo local pra chat (você já tem) | Seu setup |

---

## Fluxo de Configuração

```
SettingsDialog
  │
  ├── Provider URL: http://localhost:1234/v1  (LM Studio)
  ├── API Key: (opcional)
  ├── [List Models] → HTTP GET /v1/models → lista modelos disponíveis
  └── [Save] → salva em ~/.config/frost/frost-settings.json
       │
       ▼
  OmpBridge.updateSettings()
       │
       ▼
  Próximo chat usa o modelo selecionado
```

---

## O que é OpenWhispr vs Frost

### OpenWhispr (herdado)
- Ditado por voz (whisper.cpp, sherpa-onnx)
- Transcrição de reuniões
- Notes com busca semântica
- Sistema de hotkeys, floating icon, tray
- STT cloud e local
- Qdrant (banco vetorial) — lado a lado

### Frost (nossas adições)
- Modo Chat com agente AI
- Orchestrator (Think Agent pipeline)
- Tela de Settings (URL + modelo)
- Toggle Dictation/Chat no tray
- OmpBridge (conexão com LM Studio / modelos locais)
- **Phase 2**: Cactus (Needle) + Loop Control
- **Phase 3**: RAG + sqlite-vec

---

## Por que NÃO usamos Qdrant ainda

O Qdrant é do OpenWhispr original — usado pra busca semântica nas Notes e speaker embeddings. Como não estamos usando esses recursos no Frost agora, o Qdrant baixa mas fica ocioso.

Na Phase 3 (RAG), vamos substituir Qdrant por **sqlite-vec** (extensão do SQLite):
- Sem servidor extra
- Mesmo banco de dados
- Menos memória
- Mais simples
