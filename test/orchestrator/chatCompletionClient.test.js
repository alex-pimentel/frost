const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createChatCompletion } = require("../../src/main/chatCompletionClient");

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1` });
    });
  });
}

test("sends the system prompt before the user message", async (t) => {
  const captured = {};
  const { server, baseUrl } = await startServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      captured.body = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "resposta" } }] }));
    });
  });
  t.after(() => server.close());

  const result = await createChatCompletion(
    { providerUrl: baseUrl, apiKey: "secret", modelId: "qwen3-8b" },
    { text: "qual a capital da França?", systemPrompt: "You are Frost." }
  );

  assert.equal(result.text, "resposta");
  assert.equal(result.error, null);
  assert.equal(captured.body.model, "qwen3-8b");
  assert.deepEqual(
    captured.body.messages.map((message) => message.role),
    ["system", "user"]
  );
  assert.equal(captured.body.messages[1].content, "qual a capital da França?");
  assert.equal(captured.body.stream, false);
});

test("omits the system message when no prompt is given", async (t) => {
  const captured = {};
  const { server, baseUrl } = await startServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      captured.body = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    });
  });
  t.after(() => server.close());

  await createChatCompletion({ providerUrl: baseUrl, modelId: "m" }, { text: "oi" });

  assert.deepEqual(
    captured.body.messages.map((message) => message.role),
    ["user"]
  );
});

test("surfaces an HTTP error instead of returning empty text", async (t) => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model not loaded" }));
  });
  t.after(() => server.close());

  const result = await createChatCompletion({ providerUrl: baseUrl, modelId: "m" }, { text: "oi" });

  assert.equal(result.text, "");
  assert.match(result.error, /HTTP 500/);
});

test("reports unparseable responses", async (t) => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("not json");
  });
  t.after(() => server.close());

  const result = await createChatCompletion({ providerUrl: baseUrl, modelId: "m" }, { text: "oi" });

  assert.equal(result.error, "Failed to parse response");
});

test("reports a missing provider or model before touching the network", async () => {
  const noProvider = await createChatCompletion({ modelId: "m" }, { text: "oi" });
  const noModel = await createChatCompletion({ providerUrl: "http://127.0.0.1:1" }, { text: "oi" });

  assert.match(noProvider.error, /No provider URL/);
  assert.match(noModel.error, /No model id/);
});

test("times out instead of hanging a conversation turn", async (t) => {
  const { server, baseUrl } = await startServer(() => {
    // never respond
  });
  t.after(() => server.close());

  const result = await createChatCompletion(
    { providerUrl: baseUrl, modelId: "m" },
    { text: "oi", timeoutMs: 60 }
  );

  assert.match(result.error, /timed out/);
});
