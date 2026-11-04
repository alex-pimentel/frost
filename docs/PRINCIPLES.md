# Frost — Premissas do produto

Registro do que foi decidido. Se uma mudança contrariar um item daqui, a mudança
precisa vir acompanhada da atualização deste arquivo.

## 1. Local e offline

- Roda 100% na máquina do usuário após a configuração inicial (download de modelos).
- **Sem conta, sem login, sem sessão.** `lib/auth` é uma fachada local; `useAuth`
  devolve sempre "não autenticado" e `useUsage` não tem limites.
- **Sem sincronização em nuvem.** `cloudApi` falha antes de qualquer I/O: nenhuma
  chamada de rede é possível, mesmo em código legado não removido.
- **Sem auto-update.** `electron-updater`, `UpdateManager` e a UI de atualização
  foram removidos; `get-app-version` lê `app.getVersion()`.
- Rede só é usada para baixar modelos e para as integrações explicitamente
  escolhidas pelo usuário (ex.: Google Calendar).

## 2. Escopo funcional

| Recurso | Estado |
|---|---|
| Ditado (STT local: whisper.cpp / sherpa-onnx) | mantido |
| Chat por voz/texto com LLM local | mantido |
| Notas, histórico, dicionário, snippets | mantido |
| **Workspaces locais** (criar, renomear, excluir, trocar) | mantido — sem membros, convites, times ou cobrança |
| Google Calendar | mantido |
| Conta, planos, billing, referral, times, convites, compartilhamento | removido |
| Idiomas | **pt, es, en** apenas |

## 3. Decisão: regras primeiro, modelo como sinal

- `decisionEngine` é determinístico, ~0 ms, e mantém **autoridade e veto**.
- Um modelo estatístico (Laya ou equivalente) entra como **sinal tipado**
  (`isQuestion`, `intent`, `topicShift`), nunca como autoridade.
- **Modo sombra por padrão**: o modelo roda e é medido, mas não altera o turno até
  passar pelo gate de promoção (`docs/DECISION-MODEL.md`).
- Timeout curto e degradação silenciosa: se o modelo falhar, as regras respondem.
- Nada com efeito colateral (enviar, deletar, publicar) é decidido por modelo.

## 4. Modelos: compartilhar infraestrutura, não pesos

- STT e LLM são famílias distintas: o modelo de transcrição **não** faz decisão nem
  geração. O que se compartilha é download, cache, verificação, ciclo de vida e
  registro de modelos.
- LLM roda em **GGUF via llama-server** (já existente), com desligamento por
  ociosidade para liberar VRAM.
- Um modelo pequeno serve várias tarefas por prompt; **embeddings (MiniLM) servem
  duas**: RAG e classificação de intenção.
- Hardware de referência não é o alvo final: latência deve ser medida no alvo, não
  extrapolada de outra máquina.

## 5. Empacotamento

- Build Windows é feito no WSL por `scripts/cross-build-windows.sh`, que troca os
  binários nativos por builds win32/Electron.
- **Todo binário empacotado precisa ser PE32+**; o script falha se não for. Esse gate
  existe porque `@electron/rebuild` baixa o prebuild da plataforma do host e reporta
  sucesso.
- Assinatura de código não está disponível nesta fork: os artefatos são não assinados.

## 6. Marca

- Nome: **Frost**. Mascote: raposa das neves, paleta azul claro.
- Ícones derivados de `src/assets/mascot.png` via `scripts/build-icons.js`
  (com recorte fechado no rosto para tamanhos ≤ 48px).
- **Caminhos de dados preservados** (`~/.cache/openwhispr`, `OPENWHISPR_*`): renomear
  orfanaria modelos já baixados. URLs de upstream permanecem intactas.

## 7. Pendências conhecidas

| Item | Observação |
|---|---|
| Wake word contínua | hoje só há parsing de prefixo ("hey frost") |
| RAG no pipeline | contrato pronto (`knowledgeProvider`), falta ligar ao índice |
| Modelo de decisão real | harness e sidecar prontos; falta instalar o modelo e rotular dados |
| Automação de navegador | não iniciada — extensão + decisão/humano no envio |
| Ícone 16px | silhueta; precisaria arte dedicada para tamanhos mínimos |
