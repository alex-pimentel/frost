const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { AnswerBank } = require("../../src/main/orchestrator/answerBank");
const { loadAnswerBank, saveAnswerBank } = require("../../src/main/orchestrator/answerBankStore");

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "frost-bank-")), name);
}

test("loading a missing file yields an empty bank", () => {
  const bank = loadAnswerBank(tmpFile("answers.json"));

  assert.equal(bank.size, 0);
  assert.equal(bank.find("qualquer coisa"), null);
});

test("loading a corrupt file yields an empty bank instead of throwing", () => {
  const filePath = tmpFile("answers.json");
  fs.writeFileSync(filePath, "{ not json", "utf-8");

  const bank = loadAnswerBank(filePath);

  assert.equal(bank.size, 0);
});

test("saving and loading round-trips the entries", () => {
  const filePath = tmpFile("nested/answers.json");
  const bank = new AnswerBank({
    entries: [{ id: "disponibilidade", question: "Disponibilidade", answer: "Imediata" }],
  });

  saveAnswerBank(filePath, bank);
  const restored = loadAnswerBank(filePath);

  assert.equal(restored.size, 1);
  assert.equal(restored.find("disponibilidade").entry.answer, "Imediata");
});

test("saving writes readable JSON with no leftover temp file", () => {
  const filePath = tmpFile("answers.json");
  saveAnswerBank(filePath, new AnswerBank());

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const siblings = fs.readdirSync(path.dirname(filePath));

  assert.equal(parsed.version, 1);
  assert.deepEqual(siblings, ["answers.json"]);
});

test("saving without a path fails loudly", () => {
  assert.throws(() => saveAnswerBank("", new AnswerBank()), /file path is required/);
});
