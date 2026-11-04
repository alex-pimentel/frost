const test = require("node:test");
const assert = require("node:assert/strict");

const { AnswerBank, normalize, tokenize } = require("../../src/main/orchestrator/answerBank");

const ENTRIES = [
  {
    id: "pretensao_salarial",
    question: "Pretensão salarial",
    aliases: ["expectativa salarial", "faixa de remuneração"],
    answer: "R$ 18.000 a R$ 22.000 (PJ)",
    tags: ["vaga"],
  },
  {
    id: "experiencia_laravel",
    question: "Tempo de experiência com Laravel",
    answer: "8 anos, desde 2018",
    tags: ["skills"],
  },
];

test("normalize removes accents, punctuation and case", () => {
  assert.equal(normalize("Qual é a sua PRETENSÃO, salarial?!"), "qual e a sua pretensao salarial");
});

test("tokenize drops stopwords", () => {
  assert.deepEqual(tokenize("qual é a sua pretensão salarial"), ["pretensao", "salarial"]);
});

test("finds an exact question", () => {
  const bank = new AnswerBank({ entries: ENTRIES });
  const hit = bank.find("Pretensão salarial");

  assert.equal(hit.entry.id, "pretensao_salarial");
  assert.equal(hit.confidence, 1);
});

test("matches ignoring accent, case and punctuation", () => {
  const bank = new AnswerBank({ entries: ENTRIES });
  const hit = bank.find("QUAL E A SUA PRETENSAO SALARIAL?");

  assert.equal(hit.entry.id, "pretensao_salarial");
  assert.equal(hit.matchType, "normalized");
});

test("matches an alias", () => {
  const bank = new AnswerBank({ entries: ENTRIES });
  const hit = bank.find("expectativa salarial");

  assert.equal(hit.entry.id, "pretensao_salarial");
});

test("matches a longer phrasing through token containment", () => {
  const bank = new AnswerBank({ entries: ENTRIES });
  const hit = bank.find("quanto tempo de experiencia com laravel voce tem");

  assert.equal(hit.entry.id, "experiencia_laravel");
  assert.ok(hit.confidence >= 0.72);
});

test("returns null instead of guessing when nothing is close", () => {
  const bank = new AnswerBank({ entries: ENTRIES });

  assert.equal(bank.find("qual a capital da frança"), null);
});

test("upserts by id instead of duplicating", () => {
  const bank = new AnswerBank({ entries: ENTRIES });
  bank.add({ id: "pretensao_salarial", question: "Pretensão salarial", answer: "R$ 25.000 PJ" });

  assert.equal(bank.size, 2);
  assert.equal(bank.find("pretensão salarial").entry.answer, "R$ 25.000 PJ");
});

test("removes entries by id", () => {
  const bank = new AnswerBank({ entries: ENTRIES });

  assert.equal(bank.remove("experiencia_laravel"), true);
  assert.equal(bank.size, 1);
  assert.equal(bank.remove("experiencia_laravel"), false);
});

test("rejects entries without an answer", () => {
  const bank = new AnswerBank();

  assert.throws(() => bank.add({ id: "x", question: "y" }), /require both/);
});

test("round-trips through JSON", () => {
  const bank = new AnswerBank({ entries: ENTRIES });
  const restored = AnswerBank.fromJSON(JSON.parse(JSON.stringify(bank.toJSON())));

  assert.equal(restored.size, 2);
  assert.equal(restored.find("expectativa salarial").entry.answer, ENTRIES[0].answer);
});
