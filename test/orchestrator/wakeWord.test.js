const test = require("node:test");
const assert = require("node:assert/strict");

const { stripWakeWord, DEFAULT_WAKE_WORDS } = require("../../src/main/orchestrator/wakeWord");

test("strips a leading wake phrase and keeps the rest intact", () => {
  const result = stripWakeWord("Hey Frost, qual a capital da França?");

  assert.equal(result.detected, true);
  assert.equal(result.matched.toLowerCase(), "hey frost");
  assert.equal(result.text, "qual a capital da França?");
});

test("strips accent variants of the wake word", () => {
  const result = stripWakeWord("Olá, Frost! me resume a reunião de ontem");

  assert.equal(result.detected, true);
  assert.equal(result.text, "me resume a reunião de ontem");
});

test("handles a bare wake word with no request", () => {
  const result = stripWakeWord("frost");

  assert.equal(result.detected, true);
  assert.equal(result.text, "");
});

test("does not match a wake word glued into a longer word", () => {
  const result = stripWakeWord("frosty weather today");

  assert.equal(result.detected, false);
  assert.equal(result.text, "frosty weather today");
});

test("leaves text without a wake word untouched", () => {
  const result = stripWakeWord("  preciso de ajuda com o currículo  ");

  assert.equal(result.detected, false);
  assert.equal(result.text, "preciso de ajuda com o currículo");
});

test("accepts a custom wake word list", () => {
  const result = stripWakeWord("ei jarvis, toca música", ["ei jarvis"]);

  assert.equal(result.detected, true);
  assert.equal(result.text, "toca música");
});

test("exposes the default wake words", () => {
  assert.ok(DEFAULT_WAKE_WORDS.includes("hey frost"));
});
