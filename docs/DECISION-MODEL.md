# Frost — Decision model

O orquestrador decide com regras determinísticas (`decisionEngine.js`). Este documento
define como um **modelo estatístico de decisão** entra como *sinal*, nunca como
autoridade, e como ele é promovido — ou descartado — com base em medição.

Referência de produto: modelos de decisão tipada (Laya, Jev). Em vez de gerar texto,
eles respondem perguntas de três formas:

| Primitiva | Uso no Frost |
|---|---|
| `Noul` (sim/não com probabilidade) | "isso é uma pergunta?", "mudou de assunto?" |
| `Choice` (opção + distribuição) | intenção entre as 6 do `decisionEngine` |
| `Score` (escala ordinal) | urgência, confiança, prioridade |

## Arquitetura

```
input
  │
  ├─ decisionEngine.decide()                    regras, ~0 ms, autoridade padrão
  │
  ├─ DecisionModel.classify()                   opcional, timeout 150 ms
  │     POST /decide → { state, questions }
  │
  ├─ fuseDecisions()                            janelas de confiança + histerese
  │
  └─ pipeline (answer bank → knowledge → LLM)
```

Arquivos:

| Arquivo | Papel |
|---|---|
| `src/main/orchestrator/decisionSignals.js` | contrato dos sinais e a fusão com as regras |
| `src/main/orchestrator/decisionModel.js` | monta as perguntas tipadas, mapeia respostas, modo sombra |
| `src/main/orchestrator/decisionModelClient.js` | cliente HTTP local, com timeout e degradação |
| `sidecar/decision/main.py` | serviço local (Laya) com modo `--mock` |
| `scripts/eval-decision.js` | harness de avaliação (regras vs. baseline vs. sidecar) |

## Regras de fusão

As regras não são substituídas — são **arbitradas**:

| Situação | Quem decide |
|---|---|
| Confiança da regra ≥ 0,95 | regra (modelo só registra) |
| Regra ambígua (0,40–0,80) e modelo ≥ 0,70 com margem ≥ 0,15 | modelo |
| Confiança do modelo < 0,70 ou margem pequena | regra |
| Timeout / erro / resposta vazia | regra, `degraded: true` |
| `isQuestion` | modelo ≥ 0,75; senão a heurística de regex |
| `topicShift` | exige **2 sinais positivos consecutivos** (histerese) |

Toda decisão carrega `audit[]` explicando cada sinal — sem isso não há como depurar
por que o assistente escolheu um caminho.

## Modo sombra (padrão)

O modelo roda, é medido e registrado, mas **não altera o turno**:

```js
const model = new DecisionModel({ baseUrl, shadow: true });
// result.model = { shadow, latencyMs, error, signals, fused }
```

No app, é ativado por variável de ambiente (desligado por padrão):

```bash
FROST_DECISION_MODEL_URL=http://127.0.0.1:8765   # liga o modelo em sombra
FROST_DECISION_MODEL_SHADOW=0                    # promove para decisão ativa
```

## Avaliação

```bash
node scripts/eval-decision.js                                  # regras vs. kNN char-3gram
node scripts/eval-decision.js --sidecar http://127.0.0.1:8765  # inclui o modelo
```

Dataset: `test/fixtures/decision-dataset.jsonl` (JSONL com `text`, `intent`,
`isQuestion`, `topicShift?`). Métricas: acurácia por intenção, acurácia de
pergunta/mudança de assunto, p50/p95 de latência, taxa de degradação e concordância
com as regras.

**Critério de promoção** (todas precisam valer):

1. Ganho ≥ 5 p.p. de intenção **no subconjunto ambíguo**, não na média.
2. p95 < 300 ms com o modelo quente, no hardware alvo.
3. Taxa de degradação < 1%.
4. Concordância com as regras < 95% (acima disso o modelo não agrega).
5. Nenhuma classe com regressão > 3 p.p.

## Sidecar

```bash
python3 sidecar/decision/main.py --port 8765 --mock   # valida o encanamento
pip install laya
python3 sidecar/decision/main.py --port 8765          # modelo real
```

O sidecar força o checkpoint **multilíngue**: o router do Laya escolhe por script
Unicode, e português é latino — sem forçar, cairia no checkpoint inglês.

**Não verificado ainda:** a API Python exata do Laya. O adaptador está isolado em
`LayaAdapter.answer`; ajuste só ele, o contrato HTTP permanece.

## Riscos conhecidos

- **Zero-shot fraco:** o checkpoint base do Laya pontua ~0,362 contra baseline 0,318.
  Fine-tune com milhares de exemplos é requisito, não opcional.
- **Calibração é trabalho:** ECE cru ~0,466 → ~0,081 depois de ajustar temperatura por
  pergunta no seu tráfego. Threshold sem calibração é chute.
- **Contexto curto:** 512 tokens (EN) / 1024 (multilíngue). Truncar para as últimas falas.
- **CPU:** 193–464 ms documentados, pior caso medido de 49 s. Em hardware sem GPU o
  modelo é ferramenta de lote, não de caminho de requisição.
- **Custo de manutenção:** dois processos, um venv e um checkpoint de ~800 MB.
