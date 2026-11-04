const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/config/agentDetection.ts");

test("matches the name when it starts the dictation", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("Frost, summarize this note", "Frost"), true);
  assert.equal(detectAgentName("Max take a note", "Max"), true);
});

test("matches the name after a greeting cue", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("hey Frost make this formal", "Frost"), true);
  assert.equal(detectAgentName("okay Max stop recording", "Max"), true);
});

test("matches the name opening a new sentence", async () => {
  const { detectAgentName } = await load();

  assert.equal(
    detectAgentName("That's everything. Frost, format this as bullets", "Frost"),
    true
  );
});

test("ignores mentions that are dictated content, not commands", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("I showed Frost to a friend yesterday", "Frost"), false);
  assert.equal(detectAgentName("we shipped the Frost update today", "Frost"), false);
  assert.equal(detectAgentName("the max value is ten", "Max"), false);
});

test("handles STT splitting or misspelling the name, with the same gating", async () => {
  const { detectAgentName } = await load();

  // Addressed by name at the start of the utterance, with a misheard ending...
  assert.equal(detectAgentName("hey frost translate this", "Frost"), true);
  assert.equal(detectAgentName("Frost, take a note", "Frost"), true);
  // ...but not as a mid-sentence mention.
  assert.equal(detectAgentName("people keep calling frost a dictation app", "Frost"), false);
});

test("short names never fuzzy-match other words", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("Sam, what time is it", "Max"), false);
  assert.equal(detectAgentName("the maximum value is ten", "Max"), false);
});

test("rejects empty or single-character names", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("hey there", ""), false);
  assert.equal(detectAgentName("a quick note", "a"), false);
});
