# Frost — Formulários

O núcleo determinístico do preenchimento assistido. Nenhum modelo participa: a resposta
vem do **banco de respostas** local, e o que o banco não sabe volta como `needsReview`
em vez de chute.

Premissa que não se negocia: **o envio é sempre humano**. Nada aqui clica em "candidatar".

## Contrato (bridge local, `127.0.0.1:8200+`)

O `cliBridge` já existia para notas e transcrições; os formulários usam as mesmas
garantias (loopback, token bearer, body limitado).

### `POST /v1/forms/match`

```json
{
  "fields": [
    { "label": "Qual a sua pretensão salarial?", "type": "text" },
    { "label": "Currículo", "type": "file" }
  ]
}
```

```json
{
  "data": [
    {
      "index": 0,
      "label": "Qual a sua pretensão salarial?",
      "type": "text",
      "answer": "R$ 18.000 a R$ 22.000 (PJ)",
      "answerId": "pretensao_salarial",
      "confidence": 1,
      "source": "bank",
      "needsReview": false,
      "reason": "matched"
    },
    { "index": 1, "label": "Currículo", "type": "file", "answer": null,
      "needsReview": true, "reason": "never_auto_fill" }
  ],
  "stats": { "total": 2, "filled": 1, "needsReview": 1 }
}
```

`reason` ∈ `matched | below_threshold | unknown_question | never_auto_fill | no_label`.

### `GET /v1/forms/answers`

Lista o banco (para a UI da extensão mostrar o que já sabe).

### `POST /v1/forms/answers`

```json
{ "id": "pretensao_salarial", "question": "Pretensão salarial",
  "aliases": ["expectativa salarial"], "answer": "R$ 18.000 a R$ 22.000 (PJ)" }
```

Grava e persiste em `userData/frost-answers.json` (`persistAnswerBank`).

## Regras de segurança

| Regra | Motivo |
|---|---|
| `file`, `password`, `hidden`, `submit`, `button`, `image` nunca são preenchidos | risco de submeter arquivo errado ou sobrescrever campo sensível |
| Confiança abaixo do corte → `needsReview` | evita "respondi sim para a pergunta errada" |
| Campo sem rótulo → `no_label` | sem nome acessível não há como casar |
| Falha do banco → `unknown_question` | o formulário continua preenchível à mão |

## Detecção de campo (extensão, próxima fatia)

- Nome acessível na ordem: `label[for]` → `aria-labelledby` → `aria-label` →
  `placeholder` → `name` → `id`. Nunca por seletor CSS.
- iframes: `all_frames: true` (Workday e Gupy usam iframes encadeados).
- Preencher com **setter nativo** + eventos `input`/`change`/`blur`, senão React/Vue
  não atualizam o estado e o campo volta vazio no envio.
- Nunca disparar `form.submit()` nem clicar em botão de envio.

## Estado

| Peça | Estado |
|---|---|
| `src/main/forms/formMatcher.js` | pronto, 9 testes |
| Rotas `/v1/forms/*` no bridge | prontas |
| Persistência das respostas | pronta |
| Extensão MV3 (content script + painel) | **não iniciada** |
| Integração com o orquestrador (pergunta aberta → LLM com evidência) | não iniciada |
