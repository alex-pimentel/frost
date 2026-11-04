/**
 * Local answer bank: the deterministic half of "use saved knowledge".
 *
 * Repeated questions ("qual sua pretensão salarial?", "quando pode começar?")
 * must always get the same answer, without an LLM call and without variation.
 * Matching is accent/punctuation insensitive and tolerant to phrasing, but never
 * guesses below the confidence threshold: a miss falls through to the model.
 */

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "ou",
  "que",
  "qual",
  "quais",
  "seu",
  "sua",
  "seus",
  "suas",
  "para",
  "pra",
  "com",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "favor",
  "você",
  "voce",
  "me",
  "dizer",
  "informar",
  "por favor",
  "the",
  "of",
  "your",
  "you",
  "is",
  "are",
  "to",
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized = normalize(value);
  if (!normalized) return [];
  return normalized.split(" ").filter((token) => token && !STOPWORDS.has(token));
}

function diceCoefficient(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  const dice = (2 * intersection) / (setA.size + setB.size);
  const containment = intersection / Math.min(setA.size, setB.size);
  return Math.max(dice, containment * 0.95);
}

function entryQuestions(entry) {
  const questions = [];
  if (entry.question) questions.push(entry.question);
  if (Array.isArray(entry.aliases)) questions.push(...entry.aliases.filter(Boolean));
  return questions;
}

class AnswerBank {
  /**
   * @param {{ entries?: Array<object>, threshold?: number }} [options]
   */
  constructor({ entries = [], threshold = 0.72 } = {}) {
    this.threshold = threshold;
    this.entries = [];
    for (const entry of entries) this.add(entry);
  }

  add(entry) {
    if (!entry || !entry.id || !entry.answer) {
      throw new Error("Answer bank entries require both `id` and `answer`");
    }
    const normalized = {
      id: String(entry.id),
      question: entry.question ?? "",
      aliases: Array.isArray(entry.aliases) ? entry.aliases.slice() : [],
      answer: String(entry.answer),
      tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
    };
    const existingIndex = this.entries.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) this.entries[existingIndex] = normalized;
    else this.entries.push(normalized);
    return normalized;
  }

  remove(id) {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== String(id));
    return this.entries.length !== before;
  }

  get size() {
    return this.entries.length;
  }

  /**
   * Finds the best stored answer for a question.
   *
   * @param {string} question
   * @returns {{ entry: object, confidence: number, matchType: "exact"|"normalized"|"fuzzy" } | null}
   */
  find(question) {
    const normalizedQuestion = normalize(question);
    if (!normalizedQuestion) return null;

    const exact = this.entries.find((entry) =>
      entryQuestions(entry).some(
        (candidate) => String(candidate).trim() === String(question).trim()
      )
    );
    if (exact) return { entry: exact, confidence: 1, matchType: "exact" };

    const normalized = this.entries.find((entry) =>
      entryQuestions(entry).some((candidate) => normalize(candidate) === normalizedQuestion)
    );
    if (normalized) return { entry: normalized, confidence: 1, matchType: "normalized" };

    const questionTokens = tokenize(question);
    const questionKey = [...new Set(questionTokens)].sort().join(" ");

    // "Qual é a sua pretensão salarial?" and "Pretensão salarial" are the same
    // question once stopwords are gone, even though the normalized strings differ.
    const sameTokens = this.entries.find((entry) =>
      entryQuestions(entry).some((candidate) => {
        const candidateKey = [...new Set(tokenize(candidate))].sort().join(" ");
        return candidateKey.length > 0 && candidateKey === questionKey;
      })
    );
    if (sameTokens) return { entry: sameTokens, confidence: 0.99, matchType: "normalized" };

    let best = null;
    for (const entry of this.entries) {
      for (const candidate of entryQuestions(entry)) {
        const score = diceCoefficient(questionTokens, tokenize(candidate));
        if (!best || score > best.confidence)
          best = { entry, confidence: score, matchType: "fuzzy" };
      }
    }

    if (best && best.confidence >= this.threshold) {
      return { ...best, confidence: Number(best.confidence.toFixed(3)) };
    }
    return null;
  }

  toJSON() {
    return { version: 1, threshold: this.threshold, entries: this.entries };
  }

  static fromJSON(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Answer bank payload must be an object");
    }
    return new AnswerBank({
      entries: Array.isArray(data.entries) ? data.entries : [],
      threshold: typeof data.threshold === "number" ? data.threshold : 0.72,
    });
  }
}

module.exports = { AnswerBank, normalize, tokenize, diceCoefficient };
