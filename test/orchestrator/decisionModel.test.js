const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { DecisionModel, buildQuestions, buildState, mapAnswers } = require("../../src/main/orchestrator/decisionModel");
const { requestDecision } = require("../../src/main/orchestrator/decisionModelClient");

function startSidecar(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const answer = (body) => ({
  answers: {
    is_question: { value: true, confidence: 0.93 },
    intent: {
      value: "knowledge",
      confidence: 0.81,
      distribution: { knowledge: 0.81, generate: 0.12 },
    },
    ...(String(body?.state ?? "").includes("anterior:")
      ? { topic_shift: { value: true, confidence: 0.77 } }
      : {}),
  },
});

test("builds typed questions, including topic shift only with context", () => {
  const first = buildQuestions({ hasPrevious: false });
  const second = buildQuestions({ hasPrevious: true });

  assert.deepEqual(first.map((q) => q.id), ["is_question", "intent"]);
  assert.deepEqual(second.map((q) => q.id), ["is_question", "intent", "topic_shift"]);
  assert.equal(first[1].kind, "choice");
  assert.equal(first[0].kind, "noul");
});

test("state keeps the previous turn and stays bounded", () => {
  const state = buildState({ text: "e o prazo?", previousText: "o projeto X atrasou" });
  assert.match(state, /anterior: o projeto X atrasou/);
  assert.match(state, /agora: e o prazo\?/);

  const huge = buildState({ text: "a".repeat(5000), previousText: null });
  assert.ok(huge.length <= 1200);
});

test("maps sidecar answers into fusion signals", () => {
  const signals = mapAnswers(answer({ state: "anterior: x\nagora: y" }), { hasPrevious: true });

  assert.equal(signals.isQuestion.value, true);
  assert.equal(signals.intent.value, "knowledge");
  assert.equal(signals.topicShift.value, true);
});

test("drops unknown intents instead of trusting them", () => {
  const signals = mapAnswers({ answers: { intent: { value: "teleport", confidence: 0.99 } } }, {
    hasPrevious: false,
  });

  assert.equal(signals, null);
});

test("classify returns signals and latency from a live sidecar", async (t) => {
  const { server, baseUrl } = await startSidecar((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer(JSON.parse(raw))));
    });
  });
  t.after(() => server.close());

  const model = new DecisionModel({ baseUrl, shadow: true });
  const result = await model.classify({ text: "qual o prazo do projeto?" });

  assert.equal(result.error, null);
  assert.equal(result.signals.intent.value, "knowledge");
  assert.equal(result.shadow, true);
  assert.ok(result.latencyMs >= 0);
});

test("a slow sidecar degrades instead of blocking the turn", async (t) => {
  const { server, baseUrl } = await startSidecar(() => {
    // never answers
  });
  t.after(() => server.close());

  const model = new DecisionModel({ baseUrl, timeoutMs: 60 });
  const result = await model.classify({ text: "oi" });

  assert.equal(result.signals, null);
  assert.match(result.error, /timeout/);
  assert.equal(model.getStats().timeouts, 1);
});

test("a disabled model never touches the network", async () => {
  const model = new DecisionModel({ baseUrl: null });
  const result = await model.classify({ text: "oi" });

  assert.equal(result.signals, null);
  assert.match(result.error, /disabled/);
  assert.equal(model.getStats().calls, 0);
});

test("the client survives a malformed payload", async (t) => {
  const { server, baseUrl } = await startSidecar((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{not json");
  });
  t.after(() => server.close());

  const result = await requestDecision({ baseUrl, payload: {} });

  assert.equal(result.data, null);
  assert.match(result.error, /invalid sidecar payload/);
});
