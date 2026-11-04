/**
 * Wake word parsing for Frost.
 *
 * This module only *detects and strips* a wake phrase from an already transcribed
 * text. Always-on keyword spotting is a separate concern (see docs/ORCHESTRATOR.md).
 */

const DEFAULT_WAKE_WORDS = Object.freeze([
  "hey frost",
  "ok frost",
  "oi frost",
  "olá frost",
  "ola frost",
  "frost",
]);

const BOUNDARY = "[\\s,.:;!?\\-]";
const SEPARATOR = "[\\s,.:;!?\\-]+";

function stripDiacritics(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "hey frost" becomes /^hey[\s,.:;!?-]+frost(?=boundary|$)/ so that punctuation
 * between the words ("Hey, Frost!") still matches.
 */
function buildPhrasePattern(phrase, flags) {
  const parts = String(phrase).trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return null;
  return new RegExp(`^${parts.join(SEPARATOR)}(?=${BOUNDARY}|$)`, flags);
}

function trimLeadingSeparators(value) {
  return value.replace(new RegExp(`^${SEPARATOR}`), "").trim();
}

/**
 * Removes a leading wake phrase from `text`.
 *
 * @param {string} text transcribed or typed input
 * @param {string[]} [wakeWords] configurable wake phrases
 * @returns {{ text: string, detected: boolean, matched: string|null }}
 */
function stripWakeWord(text, wakeWords = DEFAULT_WAKE_WORDS) {
  const raw = typeof text === "string" ? text : "";
  const trimmed = raw.trim();
  if (!trimmed) return { text: "", detected: false, matched: null };

  const candidates = (Array.isArray(wakeWords) ? wakeWords : DEFAULT_WAKE_WORDS)
    .filter((word) => typeof word === "string" && word.trim())
    .sort((a, b) => b.trim().length - a.trim().length);

  for (const candidate of candidates) {
    const pattern = buildPhrasePattern(candidate, "iu");
    if (!pattern) continue;
    const match = pattern.exec(trimmed);
    if (!match) continue;
    return {
      text: trimLeadingSeparators(trimmed.slice(match[0].length)),
      detected: true,
      matched: candidate.trim(),
    };
  }

  // Accent-insensitive fallback: "Ola, Frost" vs "Olá Frost". Latin diacritics are
  // one-to-one after NFD normalization, so the raw slice keeps the original casing.
  const normalizedTrimmed = stripDiacritics(trimmed).toLowerCase();
  for (const candidate of candidates) {
    const pattern = buildPhrasePattern(stripDiacritics(candidate).toLowerCase(), "i");
    if (!pattern) continue;
    const match = pattern.exec(normalizedTrimmed);
    if (!match) continue;
    return {
      text: trimLeadingSeparators(trimmed.slice(match[0].length)),
      detected: true,
      matched: candidate.trim(),
    };
  }

  return { text: trimmed, detected: false, matched: null };
}

module.exports = { DEFAULT_WAKE_WORDS, stripWakeWord, stripDiacritics };
