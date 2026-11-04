# Frost Forms

Extensão MV3 que preenche formulários com as respostas salvas no **Frost local**.
Ela preenche; **quem envia é você**.

## Instalar (modo desenvolvedor)

1. `chrome://extensions` (ou `edge://extensions`) → ative **Modo do desenvolvedor**
2. **Carregar sem compactação** → selecione `extensions/frost-forms`
3. Clique no ícone da extensão → **Configurar conexão**

## Conectar ao Frost

**Atalho:** clique com o botão direito no ícone do Frost na bandeja → **Copiar
credenciais da extensão**. Porta e token vão para a área de transferência.

Alternativa manual — o bridge local escreve os dois valores em:

```
%USERPROFILE%\.openwhispr\cli-bridge.json
```

```json
{ "version": 1, "port": 8200, "token": "…" }
```

Copie os dois valores para a tela de configuração e use **Testar conexão**.

> O token é gerado a cada inicialização do app. Se o Frost reiniciar, use o item do
> tray novamente.

## Usar

1. Abra o formulário da vaga
2. No painel do canto inferior direito, clique em **Buscar respostas**
3. O painel mostra o que casou (com confiança) e o que precisa de revisão
4. **Preencher** aplica só as respostas encontradas
5. Nos campos marcados **revisar**, escreva a resposta e clique em **Salvar no banco** —
   ela fica disponível para as próximas vagas
6. Revise e envie você mesmo

## O que ela nunca faz

| Regra | Motivo |
|---|---|
| Não envia formulário (`submit`) nem clica em botão de envio | candidatura é decisão sua |
| Não preenche `file`, `password`, `hidden` | risco de anexar/alterar coisa errada |
| Não inventa resposta | o que o banco não sabe volta como **revisar** |
| Não fala com a internet | só `127.0.0.1`, com token no header |

## Arquitetura

```
content.js  (por frame, Shadow DOM)
   │ chrome.runtime.sendMessage
   ▼
background.js (service worker — único com host_permissions)
   │ Authorization: Bearer <token>
   ▼
Frost cliBridge 127.0.0.1:8200+  →  POST /v1/forms/match
                                     GET  /v1/forms/answers
                                     POST /v1/forms/answers
```

Detecção de campo por **nome acessível** (`label[for]` → `aria-labelledby` →
`aria-label` → label envolvente → placeholder → `name`/`id`). Preenchimento com
setter nativo + eventos `input`/`change`/`blur`, porque React/Vue ignoram
`element.value = x`.

`all_frames: true` porque vários ATS montam o formulário em iframes encadeados.

## Estado

| Peça | Estado |
|---|---|
| Detecção de campos + painel + preenchimento | implementado |
| Configuração (porta/token) + teste de conexão | implementado |
| Salvar resposta nova direto da página | implementado (textarea + "Salvar no banco") |
| Teste automatizado no navegador | **não existe** — validado por revisão e uso |

O contrato completo está em `docs/FORMS.md`.
