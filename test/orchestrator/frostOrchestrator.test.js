const test = require("node:test");
const assert = require("node:assert/strict");

const { FrostOrchestrator } = require("../../src/main/orchestrator/frostOrchestrator");
const { AnswerBank } = require("../../src/main/orchestrator/answerBank");
const { INTENTS } = require("../../src/main/orchestrator/decisionEngine");

function createBridge(responder = { text: "resposta do modelo" }) {
  const calls = [];
  return {
    calls,
    async prompt(text, options) {
      calls.push({ text, options });
      return typeof responder === "function" ? responder(text, options) : responder;
    },
  };
}

const BANK = new AnswerBank({
  entries: [
    {
      id: "pretensao_salarial",
      question: "Pretensão salarial",
      aliases: ["expectativa salarial"],
      answer: "R$ 18.000 a R$ 22.000 (PJ)",
    },
  ],
});

test("dictation mode returns the text and never calls the model", async () => {
  const bridge = createBridge();
  const orchestrator = new FrostOrchestrator({ bridge, mode: "dictation" });

  const result = await orchestrator.process("texto qualquer");

  assert.equal(result.text, "texto qualquer");
  assert.equal(result.source, "dictation_passthrough");
  assert.equal(bridge.calls.length, 0);
});

test("empty input is clarified without a model call", async () => {
  const bridge = createBridge();
  const orchestrator = new FrostOrchestrator({ bridge });

  const result = await orchestrator.process("   ");

  assert.equal(result.source, "clarify_rule");
  assert.equal(bridge.calls.length, 0);
  assert.ok(result.text.length > 0);
});

test("a stored answer short-circuits the model", async () => {
  const bridge = createBridge();
  const orchestrator = new FrostOrchestrator({ bridge, answerBank: BANK });

  const result = await orchestrator.process("qual a sua pretensão salarial?");

  assert.equal(result.source, "answer_bank");
  assert.equal(result.text, "R$ 18.000 a R$ 22.000 (PJ)");
  assert.equal(bridge.calls.length, 0);
});

test("an unmatched saved-knowledge question goes to the model with retrieved blocks", async () => {
  const bridge = createBridge({ text: "O prazo é maio [nota:1]." });
  const knowledgeProvider = {
    searched: [],
    async search(query, options) {
      this.searched.push({ query, options });
      return [{ id: "nota:1", text: "Prazo do projeto X é maio." }];
    },
  };
  const orchestrator = new FrostOrchestrator({ bridge, knowledgeProvider });

  const result = await orchestrator.process("o que eu anotei sobre o prazo do projeto X?");

  assert.equal(result.decision.intent, INTENTS.KNOWLEDGE);
  assert.equal(result.source, "model");
  assert.equal(knowledgeProvider.searched.length, 1);
  assert.match(bridge.calls[0].options.systemPrompt, /\[nota:1\]/);
  assert.ok(result.knowledgeBlocks.length === 1);
});

test("a knowledge miss still reaches the model, with instructions to admit the gap", async () => {
  const bridge = createBridge({ text: "Não tenho isso salvo." });
  const orchestrator = new FrostOrchestrator({ bridge });

  const result = await orchestrator.process("o que eu anotei sobre a reunião de ontem?");

  assert.equal(result.decision.intent, INTENTS.KNOWLEDGE);
  assert.deepEqual(result.knowledgeBlocks, []);
  assert.match(bridge.calls[0].options.systemPrompt, /do not have that saved/);
});

test("a coding request opens the tool surface and strips the wake word", async () => {
  const bridge = createBridge();
  const orchestrator = new FrostOrchestrator({ bridge });

  const result = await orchestrator.process(
    "Hey Frost, implemente um endpoint de login em src/api.php"
  );

  assert.equal(result.decision.intent, INTENTS.CODE);
  assert.equal(result.decision.shouldUseTools, true);
  assert.equal(bridge.calls[0].text, "implemente um endpoint de login em src/api.php");
  assert.match(bridge.calls[0].options.systemPrompt, /tools are allowed/);
});

test("a plain question never advertises tools to the model", async () => {
  const bridge = createBridge();
  const orchestrator = new FrostOrchestrator({ bridge });

  await orchestrator.process("qual a diferença entre HTTP e HTTP/2?");

  assert.doesNotMatch(bridge.calls[0].options.systemPrompt, /tools are allowed/);
});

test("the wake word is stripped before the model sees the text", async () => {
  const bridge = createBridge();
  const orchestrator = new FrostOrchestrator({ bridge });

  await orchestrator.process("Hey Frost, como funciona o protocolo QUIC?");

  assert.equal(bridge.calls[0].text, "como funciona o protocolo QUIC?");
});

test("an empty model answer falls back to a usable message", async () => {
  const bridge = createBridge({ text: "   " });
  const orchestrator = new FrostOrchestrator({ bridge });

  const result = await orchestrator.process("me explica o que é um vetor de embedding?");

  assert.equal(result.source, "model_empty");
  assert.ok(result.text.length > 0);
});

test("a model error is surfaced instead of swallowed", async () => {
  const bridge = createBridge({ text: "", error: "connection refused" });
  const orchestrator = new FrostOrchestrator({ bridge });

  const result = await orchestrator.process("me explica o que é um vetor de embedding?");

  assert.match(result.text, /connection refused/);
});

test("a thrown model error rejects the promise so the caller can log it", async () => {
  const bridge = {
    async prompt() {
      throw new Error("boom");
    },
  };
  const orchestrator = new FrostOrchestrator({ bridge });

  await assert.rejects(() => orchestrator.process("como funciona o DNS?"), /boom/);
});

test("a missing bridge reports the missing configuration instead of crashing", async () => {
  const orchestrator = new FrostOrchestrator({});

  const result = await orchestrator.process("como funciona o DNS?");

  assert.equal(result.source, "no_model");
  assert.match(result.text, /Nenhum modelo configurado/);
});

test("the last decision is exposed for UI and debugging", async () => {
  const orchestrator = new FrostOrchestrator({ bridge: createBridge() });

  await orchestrator.process("oi");
  const decision = orchestrator.getLastDecision();

  assert.equal(decision.intent, INTENTS.SMALLTALK);
  assert.equal(decision.signals.wakeWord, false);
});

test("processText keeps the plain string contract used by IPC", async () => {
  const orchestrator = new FrostOrchestrator({ bridge: createBridge({ text: "ok" }) });

  assert.equal(await orchestrator.processText("tudo bem?"), "ok");
});

function fakeDecisionModel({ signals, error = null, shadow = true, latencyMs = 12 }) {
  return {
    remembered: [],
    async classify() {
      return { signals, error, latencyMs, shadow };
    },
    remember(text) {
      this.remembered.push(text);
    },
  };
}

const AMBIGUOUS_QUESTION = "me fala sobre a api do banco que eu uso";

test("shadow mode records the model verdict without changing the turn", async () => {
  const bridge = createBridge();
  const model = fakeDecisionModel({
    signals: { intent: { value: "knowledge", confidence: 0.92 } },
    shadow: true,
  });
  const orchestrator = new FrostOrchestrator({ bridge, decisionModel: model });

  const result = await orchestrator.process(AMBIGUOUS_QUESTION);

  assert.equal(result.decision.intent, INTENTS.GENERATE);
  assert.equal(result.model.shadow, true);
  assert.equal(result.model.fused.intent, "knowledge");
  assert.equal(result.model.fused.source, "model");
});

test("active mode applies the fused intent", async () => {
  const bridge = createBridge();
  const model = fakeDecisionModel({
    signals: {
      intent: {
        value: "knowledge",
        confidence: 0.9,
        distribution: { knowledge: 0.9, generate: 0.05 },
      },
    },
    shadow: false,
  });
  const orchestrator = new FrostOrchestrator({ bridge, decisionModel: model });

  const result = await orchestrator.process(AMBIGUOUS_QUESTION);

  assert.equal(result.decision.intent, INTENTS.KNOWLEDGE);
  assert.equal(result.model.fused.source, "model");
});

test("a model failure degrades back to the rules", async () => {
  const bridge = createBridge();
  const model = fakeDecisionModel({ signals: null, error: "timeout", shadow: false });
  const orchestrator = new FrostOrchestrator({ bridge, decisionModel: model });

  const result = await orchestrator.process("qual a capital da França?");

  assert.equal(result.decision.intent, INTENTS.GENERATE);
  assert.equal(result.model.fused.degraded, true);
  assert.equal(result.model.fused.source, "rules");
});

test("the model never runs in dictation mode", async () => {
  const bridge = createBridge();
  let called = false;
  const model = {
    async classify() {
      called = true;
      return { signals: null, error: null, latencyMs: 0, shadow: true };
    },
    remember() {},
  };
  const orchestrator = new FrostOrchestrator({ bridge, decisionModel: model, mode: "dictation" });

  await orchestrator.process("texto qualquer");

  assert.equal(called, false);
});

test("the turn text is remembered for the next topic-shift question", async () => {
  const bridge = createBridge();
  const model = fakeDecisionModel({ signals: null, error: "disabled" });
  const orchestrator = new FrostOrchestrator({ bridge, decisionModel: model });

  await orchestrator.process("Hey Frost, como funciona o DNS?");

  assert.deepEqual(model.remembered, ["como funciona o DNS?"]);
});
