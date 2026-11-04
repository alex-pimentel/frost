const test = require("node:test");
const assert = require("node:assert/strict");

const { decide, INTENTS } = require("../../src/main/orchestrator/decisionEngine");

test("dictation mode passes the original text through", () => {
  const decision = decide("qualquer coisa dita", { mode: "dictation" });

  assert.equal(decision.intent, INTENTS.DICTATION);
  assert.equal(decision.text, "qualquer coisa dita");
  assert.equal(decision.needsModel, false);
});

test("an open question is answered by the model without tools", () => {
  const decision = decide("Hey Frost, qual a diferença entre HTTP e HTTP/2?");

  assert.equal(decision.intent, INTENTS.GENERATE);
  assert.equal(decision.shouldUseTools, false);
  assert.equal(decision.signals.wakeWord, true);
  assert.equal(decision.text, "qual a diferença entre HTTP e HTTP/2?");
});

test("an imperative coding request opens the tool surface", () => {
  const decision = decide("implemente um endpoint de login em src/api.php");

  assert.equal(decision.intent, INTENTS.CODE);
  assert.equal(decision.shouldUseTools, true);
});

test("a bug fix request opens the tool surface", () => {
  const decision = decide("como faço para corrigir o bug do login?");

  assert.equal(decision.intent, INTENTS.CODE);
  assert.equal(decision.shouldUseTools, true);
});

test("an accented code verb is recognized", () => {
  const decision = decide("crie a função de login no módulo de autenticação");

  assert.equal(decision.intent, INTENTS.CODE);
  assert.equal(decision.shouldUseTools, true);
});

test("a single incidental code noun does not open the tool surface", () => {
  const decision = decide("me fala sobre a api do banco que eu uso");

  assert.equal(decision.intent, INTENTS.GENERATE);
  assert.equal(decision.shouldUseTools, false);
});

test("a question about saved notes is routed to saved knowledge", () => {
  const decision = decide("o que eu anotei sobre a reunião de ontem?");

  assert.equal(decision.intent, INTENTS.KNOWLEDGE);
  assert.equal(decision.shouldUseKnowledge, true);
});

test("a greeting is small talk", () => {
  const decision = decide("oi");

  assert.equal(decision.intent, INTENTS.SMALLTALK);
  assert.equal(decision.shouldUseTools, false);
});

test("a bare confirmation without a pending question asks for context", () => {
  const decision = decide("sim");

  assert.equal(decision.intent, INTENTS.CLARIFY);
  assert.equal(decision.reason, "confirmation_without_context");
});

test("empty input is clarified instead of answered", () => {
  const decision = decide("   ");

  assert.equal(decision.intent, INTENTS.CLARIFY);
  assert.equal(decision.reason, "empty_input");
});

test("a wake word alone is clarified", () => {
  const decision = decide("hey frost");

  assert.equal(decision.intent, INTENTS.CLARIFY);
  assert.equal(decision.reason, "wake_word_without_request");
});

test("short fragments ask for context", () => {
  const decision = decide("aquilo lá");

  assert.equal(decision.intent, INTENTS.CLARIFY);
  assert.equal(decision.reason, "too_little_context");
});

test("decisions always carry signals for auditing", () => {
  const decision = decide("quando eu posso começar?");

  assert.equal(typeof decision.confidence, "number");
  assert.equal(decision.signals.isQuestion, true);
  assert.deepEqual(decision.signals.codeSignals, []);
});
