const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSystemPrompt,
  formatKnowledgeBlocks,
} = require("../../src/main/orchestrator/systemPrompt");
const { INTENTS } = require("../../src/main/orchestrator/decisionEngine");

test("base prompt makes code the exception, not the default", () => {
  const prompt = buildSystemPrompt({ decision: { intent: INTENTS.GENERATE } });

  assert.match(prompt, /Never start producing code/);
  assert.match(prompt, /A conversation is the default; writing code is the exception/);
});

test("base prompt forbids inventing personal facts", () => {
  const prompt = buildSystemPrompt({ decision: { intent: INTENTS.KNOWLEDGE } });

  assert.match(prompt, /Never invent facts about the user/);
});

test("code intent explicitly allows tools", () => {
  const prompt = buildSystemPrompt({ decision: { intent: INTENTS.CODE } });

  assert.match(prompt, /tools are allowed/);
  assert.match(prompt, /Ask before any destructive/);
});

test("small talk guidance keeps the answer short", () => {
  const prompt = buildSystemPrompt({ decision: { intent: INTENTS.SMALLTALK } });

  assert.match(prompt, /one or two sentences/);
});

test("knowledge blocks are rendered with citable ids", () => {
  const prompt = buildSystemPrompt({
    decision: { intent: INTENTS.KNOWLEDGE },
    knowledgeBlocks: [
      { id: "nota:12", text: "Reunião de 2026-03-01: prazo do projeto X é maio." },
      { id: "nota:13", content: "Cliente Y pediu relatório semanal." },
    ],
  });

  assert.match(prompt, /\[nota:12\]/);
  assert.match(prompt, /\[nota:13\]/);
  assert.match(prompt, /cite its id/);
});

test("empty knowledge does not produce an empty section", () => {
  const prompt = buildSystemPrompt({ decision: { intent: INTENTS.GENERATE }, knowledgeBlocks: [] });

  assert.doesNotMatch(prompt, /Saved knowledge for this turn/);
  assert.equal(formatKnowledgeBlocks([]), "");
});

test("persona is injected when provided", () => {
  const prompt = buildSystemPrompt({
    decision: { intent: INTENTS.GENERATE },
    persona: "Alex, arquiteto de soluções.",
  });

  assert.match(prompt, /About the user: Alex, arquiteto de soluções\./);
});
