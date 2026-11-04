/**
 * Form-field matching: the deterministic core of form filling.
 *
 * A page sends the fields it detected (accessible name, input type, options); Frost
 * answers from the saved answer bank. No model is involved, so the same question
 * always gets the same answer — and anything the bank does not know comes back as
 * `needsReview` instead of a guess.
 *
 * Reference: docs/FORMS.md
 */

/** Field kinds that must never be filled from the bank, only flagged for the human. */
const NEVER_AUTO_FILL = new Set(["file", "hidden", "password", "submit", "button", "image"]);

function normalizeLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldLabel(field) {
  return (
    field?.label ||
    field?.ariaLabel ||
    field?.placeholder ||
    field?.name ||
    field?.id ||
    ""
  );
}

/**
 * @param {{
 *   fields: Array<{ label?: string, ariaLabel?: string, placeholder?: string, name?: string, id?: string, type?: string, options?: string[] }>,
 *   bank: { find: (question: string) => ({ entry: object, confidence: number } | null) },
 *   threshold?: number,
 * }} input
 */
function matchFields({ fields, bank, threshold = 0.72 }) {
  const list = Array.isArray(fields) ? fields : [];
  const matches = [];

  for (let index = 0; index < list.length; index += 1) {
    const field = list[index] ?? {};
    const label = fieldLabel(field);
    const type = String(field.type ?? "text").toLowerCase();

    const base = { index, label, type };

    if (!label.trim()) {
      matches.push({ ...base, answer: null, confidence: 0, source: "none", needsReview: true, reason: "no_label" });
      continue;
    }

    if (NEVER_AUTO_FILL.has(type)) {
      matches.push({ ...base, answer: null, confidence: 0, source: "none", needsReview: true, reason: "never_auto_fill" });
      continue;
    }

    let hit = null;
    try {
      hit = bank?.find ? bank.find(label) : null;
    } catch {
      hit = null;
    }

    if (hit && hit.confidence >= threshold) {
      matches.push({
        ...base,
        answer: hit.entry?.answer ?? null,
        answerId: hit.entry?.id ?? null,
        confidence: hit.confidence,
        source: "bank",
        needsReview: false,
        reason: "matched",
      });
      continue;
    }

    matches.push({
      ...base,
      answer: null,
      answerId: null,
      confidence: hit?.confidence ?? 0,
      source: "none",
      needsReview: true,
      reason: hit ? "below_threshold" : "unknown_question",
    });
  }

  const filled = matches.filter((match) => match.answer !== null).length;
  return {
    matches,
    stats: {
      total: matches.length,
      filled,
      needsReview: matches.length - filled,
    },
  };
}

module.exports = { matchFields, normalizeLabel, fieldLabel, NEVER_AUTO_FILL };
