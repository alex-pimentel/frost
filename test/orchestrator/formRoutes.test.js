const test = require("node:test");
const assert = require("node:assert/strict");

const CliBridge = require("../../src/helpers/cliBridge");
const { AnswerBank } = require("../../src/main/orchestrator/answerBank");

const bank = new AnswerBank({
  entries: [
    {
      id: "pretensao_salarial",
      question: "Pretensão salarial",
      answer: "R$ 18.000 a R$ 22.000 (PJ)",
    },
  ],
});

function buildBridge({ withBank = true } = {}) {
  const ipcHandlers = {
    databaseManager: { searchNotes: () => [] },
    frost: withBank
      ? { answerBank: bank, persistAnswerBank: () => true }
      : undefined,
  };
  return new CliBridge(ipcHandlers);
}

function routeFor(bridge, method, path) {
  const route = bridge.routes.find((entry) => entry.method === method && entry.match(path));
  assert.ok(route, `rota ${method} ${path} nao registrada`);
  return route;
}

test("POST /v1/forms/match fills what the bank knows", () => {
  const bridge = buildBridge();
  const route = routeFor(bridge, "POST", "/v1/forms/match");

  const result = route.handler({
    params: {},
    query: new URLSearchParams(),
    body: { fields: [{ label: "Pretensão salarial", type: "text" }] },
  });

  assert.equal(result.stats.filled, 1);
  assert.equal(result.data[0].answer, "R$ 18.000 a R$ 22.000 (PJ)");
});

test("POST /v1/forms/match flags unknown and forbidden fields", () => {
  const bridge = buildBridge();
  const route = routeFor(bridge, "POST", "/v1/forms/match");

  const result = route.handler({
    params: {},
    query: new URLSearchParams(),
    body: {
      fields: [
        { label: "Qual seu signo?", type: "text" },
        { label: "Currículo", type: "file" },
      ],
    },
  });

  assert.deepEqual(
    result.data.map((match) => match.reason),
    ["unknown_question", "never_auto_fill"]
  );
  assert.equal(result.stats.needsReview, 2);
});

test("POST /v1/forms/match rejects an empty body gracefully", () => {
  const bridge = buildBridge();
  const route = routeFor(bridge, "POST", "/v1/forms/match");

  const result = route.handler({ params: {}, query: new URLSearchParams(), body: {} });

  assert.deepEqual(result.stats, { total: 0, filled: 0, needsReview: 0 });
});

test("form routes report unavailable when the bank is not ready", () => {
  const bridge = buildBridge({ withBank: false });
  const route = routeFor(bridge, "POST", "/v1/forms/match");

  assert.throws(
    () => route.handler({ params: {}, query: new URLSearchParams(), body: { fields: [] } }),
    (error) => error.code === "UNAVAILABLE"
  );
});

test("GET /v1/forms/answers lists the bank", () => {
  const bridge = buildBridge();
  const route = routeFor(bridge, "GET", "/v1/forms/answers");

  const result = route.handler({ params: {}, query: new URLSearchParams() });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, "pretensao_salarial");
});

test("POST /v1/forms/answers saves and persists", () => {
  let persisted = 0;
  const ipcHandlers = {
    databaseManager: { searchNotes: () => [] },
    frost: {
      answerBank: new AnswerBank(),
      persistAnswerBank: () => {
        persisted += 1;
        return true;
      },
    },
  };
  const bridge = new CliBridge(ipcHandlers);
  const route = routeFor(bridge, "POST", "/v1/forms/answers");

  const result = route.handler({
    params: {},
    query: new URLSearchParams(),
    body: { id: "disponibilidade", question: "Disponibilidade", answer: "Imediata" },
  });

  assert.equal(result.data.answer, "Imediata");
  assert.equal(ipcHandlers.frost.answerBank.find("Disponibilidade").entry.answer, "Imediata");
  assert.equal(persisted, 1);
});

test("POST /v1/forms/answers requires id and answer", () => {
  const bridge = buildBridge();
  const route = routeFor(bridge, "POST", "/v1/forms/answers");

  assert.throws(
    () => route.handler({ params: {}, query: new URLSearchParams(), body: { id: "x" } }),
    (error) => error.code === "VALIDATION"
  );
});
