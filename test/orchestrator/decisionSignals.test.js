const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fuseDecisions,
  TopicShiftTracker,
  marginOf,
} = require("../../src/main/orchestrator/decisionSignals");

const rule = (overrides = {}) => ({
  intent: "generate",
  confidence: 0.6,
  signals: { isQuestion: true },
  ...overrides,
});

test("certain rules are never overridden by the model", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ intent: "code", confidence: 0.95 }),
    modelSignals: { intent: { value: "generate", confidence: 0.99 } },
  });

  assert.equal(fused.intent, "code");
  assert.equal(fused.source, "rules");
});

test("an ambiguous rule yields to a confident model", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ confidence: 0.6 }),
    modelSignals: {
      intent: {
        value: "knowledge",
        confidence: 0.82,
        distribution: { knowledge: 0.82, generate: 0.1 },
      },
    },
  });

  assert.equal(fused.intent, "knowledge");
  assert.equal(fused.source, "model");
});

test("a model with a thin margin does not override", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ confidence: 0.6 }),
    modelSignals: {
      intent: {
        value: "knowledge",
        confidence: 0.72,
        distribution: { knowledge: 0.72, generate: 0.68 },
      },
    },
  });

  assert.equal(fused.intent, "generate");
  assert.equal(fused.source, "rules");
});

test("a low-confidence model does not override", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ confidence: 0.6 }),
    modelSignals: { intent: { value: "knowledge", confidence: 0.55 } },
  });

  assert.equal(fused.intent, "generate");
});

test("a rule outside the ambiguity window keeps authority", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ confidence: 0.85 }),
    modelSignals: { intent: { value: "knowledge", confidence: 0.99 } },
  });

  assert.equal(fused.intent, "generate");
});

test("missing model output marks the turn as degraded", () => {
  const fused = fuseDecisions({ ruleDecision: rule(), modelSignals: null, modelError: "timeout" });

  assert.equal(fused.degraded, true);
  assert.equal(fused.intent, "generate");
  assert.equal(fused.source, "rules");
});

test("a confident model can flip the is-question verdict", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ signals: { isQuestion: false } }),
    modelSignals: { isQuestion: { value: true, confidence: 0.9 } },
  });

  assert.equal(fused.isQuestion, true);
});

test("a hesitant model leaves the is-question verdict to the rules", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ signals: { isQuestion: false } }),
    modelSignals: { isQuestion: { value: true, confidence: 0.4 } },
  });

  assert.equal(fused.isQuestion, false);
});

test("topic shift requires consecutive agreeing signals", () => {
  const tracker = new TopicShiftTracker(2);
  const signal = { value: true, confidence: 0.8 };

  assert.equal(tracker.observe(signal).accepted, false);
  assert.equal(tracker.observe(signal).accepted, true);
  assert.equal(tracker.observe(signal).accepted, false);
});

test("a negative signal resets the topic shift streak", () => {
  const tracker = new TopicShiftTracker(2);

  tracker.observe({ value: true, confidence: 0.9 });
  tracker.observe({ value: false, confidence: 0.9 });
  assert.equal(tracker.observe({ value: true, confidence: 0.9 }).accepted, false);
});

test("the audit trail explains every signal decision", () => {
  const fused = fuseDecisions({
    ruleDecision: rule({ confidence: 0.6 }),
    modelSignals: { intent: { value: "knowledge", confidence: 0.9 } },
  });

  const kinds = fused.audit.map((entry) => entry.signal);
  assert.deepEqual(kinds, ["intent", "isQuestion", "topicShift"]);
});

test("marginOf handles a missing distribution", () => {
  assert.equal(marginOf({ confidence: 0.9 }), null);
  assert.equal(marginOf(null), null);
});
