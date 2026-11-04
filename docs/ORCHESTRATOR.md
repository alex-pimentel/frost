# Frost — Orchestrator

O orquestrador decide **o que** fazer antes de chamar o modelo. Ele existe para que
Frost seja um assistente pessoal: conversa é o padrão, código é a exceção.

Runtime: **CommonJS**, em `src/main/orchestrator/`. O esqueleto TypeScript em
`index.ts` / `pipeline.ts` / `thinkAgent.ts` está **inerte** (não é importado por
ninguém) e serve apenas como referência de tipos.

## Pipeline

```
input (texto ou transcrição)
  │
  ├─ 1. decide .............. regras determinísticas, sem modelo
  ├─ 2. answer bank ......... resposta salva com match exato/fuzzy
  ├─ 3. knowledge ........... blocos salvos injetados no prompt (RAG)
  ├─ 4. generate ............ chamada ao modelo com system prompt por intenção
  └─ 5. validate ............ resposta vazia, erro e fallback
```

Arquivos:

| Arquivo                      | Papel                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| `wakeWord.js`                | Detecta e remove a frase de ativação (`hey frost`, `oi frost`, …) |
| `decisionEngine.js`          | Classifica a intenção e decide se tools/knowledge entram          |
| `answerBank.js`              | Banco de respostas canônicas com match por normalização e fuzzy   |
| `answerBankStore.js`         | Persistência JSON atômica do banco                                |
| `systemPrompt.js`            | Composição do system prompt por intenção                          |
| `frostOrchestrator.js`       | Pipeline e contrato de dependências                               |
| `../chatCompletionClient.js` | Cliente OpenAI-compatible (http e https)                          |

## Intenções

| Intenção    | Quando                                    | Tools   | Modelo          |
| ----------- | ----------------------------------------- | ------- | --------------- |
| `dictation` | modo ditado                               | não     | não             |
| `smalltalk` | saudação, agradecimento, "quem é você"    | não     | sim             |
| `knowledge` | "o que eu anotei…", "minha experiência…"  | não     | sim, com blocos |
| `generate`  | pergunta aberta ou pedido de texto        | não     | sim             |
| `code`      | verbo de código ou 2+ sinais de código    | **sim** | sim             |
| `clarify`   | vazio, confirmação solta, fragmento curto | não     | não             |

Regras que evitam o comportamento antigo de "só escrever código":

- Um substantivo técnico isolado ("api", "endpoint") **não** abre tools. Precisa de verbo
  imperativo ("implemente", "corrija", "rode") ou de dois sinais independentes.
- `clarify` responde sem chamar o modelo — evita alucinação em entrada vazia.
- O system prompt proíbe código não solicitado e proíbe inventar fatos sobre o usuário.

## Banco de respostas

Persistido em `app.getPath("userData")/frost-answers.json`.

```json
{
  "version": 1,
  "threshold": 0.72,
  "entries": [
    {
      "id": "pretensao_salarial",
      "question": "Pretensão salarial",
      "aliases": ["expectativa salarial", "faixa de remuneração"],
      "answer": "R$ 18.000 a R$ 22.000 (PJ)",
      "tags": ["vaga"]
    }
  ]
}
```

- Match: exato → normalizado (sem acento/pontuação) → mesmo conjunto de tokens → fuzzy
  (Dice + containment, corte em `threshold`).
- Abaixo do corte, **não chuta**: cai para o modelo.
- IPC: `frost:answers:list`, `frost:answers:upsert`, `frost:answers:delete`
  (expostos em `preload.js` como `frostListAnswers`, `frostUpsertAnswer`, `frostDeleteAnswer`).

## Contrato do provedor de conhecimento

Para ligar o RAG vetorial (fase seguinte), basta injetar:

```js
const knowledgeProvider = {
  async search(query, { limit = 5 }) {
    return [{ id: "nota:12", text: "…", source: "nota" }];
  },
};
```

O `id` é renderizado no prompt como `[nota:12]` e o modelo é instruído a citá-lo.
Sem provedor, a intenção `knowledge` ainda chega ao modelo — com instrução explícita
de admitir que não tem a informação salva, em vez de inventar.

## Wake word

Hoje: **parsing de prefixo**. `wakeWord.js` remove `hey frost`, `oi frost`, `ok frost`,
`frost` (com variantes de acento e pontuação: `Olá, Frost!`) antes da decisão.

Ainda não existe: escuta contínua com keyword spotting sempre ligado. O caminho natural
é sherpa-onnx KWS (já presente no projeto) ou VAD + transcrição curta, com histerese
para não acordar com ruído. Isso é uma fatia separada.

## Testes

```bash
node --test "test/orchestrator/*.test.js"
```

Cobrem decisão, banco de respostas, persistência, montagem de prompt, pipeline
(incluindo ausência de modelo e erro do modelo) e o cliente HTTP contra um servidor local.

## Empacotamento

O runtime vive em `src/main/orchestrator/`, então `electron-builder.json` **precisa**
listar `src/main/**/*` em `files`. Sem isso o app empacotado não contém o orquestrador:
`frostIntegration` cai no `catch` do `initialize()` e o chat responde
"Frost is not initialized yet." — era exatamente o estado do fork antes desta correção.

## Não implementado (de propósito)

- Automação de navegador (extensão/CDP) — fase posterior.
- Busca vetorial no pipeline — só o contrato existe.
- Streaming de resposta e TTS por sentença.
- UI para curar o banco de respostas (o IPC já existe).
