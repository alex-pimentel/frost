const test = require("node:test");
const assert = require("node:assert/strict");

const { matchFields, normalizeLabel, fieldLabel } = require("../../src/main/forms/formMatcher");
const { AnswerBank } = require("../../src/main/orchestrator/answerBank");

const bank = new AnswerBank({
  entries: [
    {
      id: "pretensao_salarial",
      question: "Pretensão salarial",
      aliases: ["expectativa salarial"],
      answer: "R$ 18.000 a R$ 22.000 (PJ)",
    },
    {
      id: "disponibilidade",
      question: "Disponibilidade para início",
      answer: "Imediata a 30 dias",
    },
  ],
});

test("normalizeLabel drops accents, punctuation and case", () => {
  assert.equal(normalizeLabel("  PRETENSÃO,   salarial?! "), "pretensao salarial");
});

test("fieldLabel falls back through the accessible name chain", () => {
  assert.equal(fieldLabel({ ariaLabel: "aria" }), "aria");
  assert.equal(fieldLabel({ placeholder: "ph" }), "ph");
  assert.equal(fieldLabel({ name: "name" }), "name");
  assert.equal(fieldLabel({}), "");
});

test("fills the fields the bank knows", () => {
  const result = matchFields({
    fields: [{ label: "Qual a sua pretensão salarial?", type: "text" }],
    bank,
  });

  assert.equal(result.stats.filled, 1);
  assert.equal(result.matches[0].answer, "R$ 18.000 a R$ 22.000 (PJ)");
  assert.equal(result.matches[0].source, "bank");
  assert.equal(result.matches[0].needsReview, false);
});

test("unknown questions go to review instead of being guessed", () => {
  const result = matchFields({ fields: [{ label: "Qual seu signo?", type: "text" }], bank });

  assert.equal(result.stats.filled, 0);
  assert.equal(result.matches[0].needsReview, true);
  assert.equal(result.matches[0].reason, "unknown_question");
});

test("a weak match below the threshold is flagged, not filled", () => {
  const result = matchFields({
    fields: [{ label: "pretensão", type: "text" }],
    bank,
    threshold: 0.99,
  });

  assert.equal(result.stats.filled, 0);
  assert.equal(result.matches[0].reason, "below_threshold");
});

test("file and password inputs are never auto-filled", () => {
  const result = matchFields({
    fields: [
      { label: "Pretensão salarial", type: "file" },
      { label: "Senha", type: "password" },
    ],
    bank,
  });

  assert.equal(result.stats.filled, 0);
  assert.deepEqual(
    result.matches.map((match) => match.reason),
    ["never_auto_fill", "never_auto_fill"]
  );
});

test("fields without a label are reported, not skipped silently", () => {
  const result = matchFields({ fields: [{ type: "text" }], bank });

  assert.equal(result.matches[0].reason, "no_label");
  assert.equal(result.stats.needsReview, 1);
});

test("a bank failure does not break the whole form", () => {
  const result = matchFields({
    fields: [{ label: "Disponibilidade", type: "text" }],
    bank: {
      find() {
        throw new Error("boom");
      },
    },
  });

  assert.equal(result.matches[0].needsReview, true);
  assert.equal(result.matches[0].reason, "unknown_question");
});

test("stats count filled and review totals", () => {
  const result = matchFields({
    fields: [
      { label: "Pretensão salarial" },
      { label: "Disponibilidade para início" },
      { label: "Conte uma história" },
    ],
    bank,
  });

  assert.deepEqual(result.stats, { total: 3, filled: 2, needsReview: 1 });
});
