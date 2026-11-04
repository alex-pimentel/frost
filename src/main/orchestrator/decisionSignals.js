/**
 * Decision signals: the narrow interface between Frost's rule engine and any
 * statistical decision model (Laya today, something else tomorrow).
 *
 * Rules stay authoritative by default. A model can only *override* the rule verdict
 * inside a bounded confidence window, and any failure degrades silently back to the
 * rules — the product must never wait on a classifier to answer.
 *
 * Reference: docs/DECISION-MODEL.md
 */

const SIGNAL = Object.freeze({
  IS_QUESTION: "isQuestion",
  INTENT: "intent",
  TOPIC_SHIFT: "topicShift",
});

/** Confidence at or above which the deterministic rules are not questioned. */
const RULE_CERTAINTY = 0.95;
/** Below this the model is not consulted for intent: the rule already abstains. */
const RULE_AMBIGUOUS_MIN = 0.4;
const RULE_AMBIGUOUS_MAX = 0.8;
/** Model must be at least this sure, and this far ahead of the runner-up. */
const MODEL_MIN_CONFIDENCE = 0.7;
const MODEL_MIN_MARGIN = 0.15;
/** Model must be at least this sure to flip the is-question verdict. */
const IS_QUESTION_MIN_CONFIDENCE = 0.75;
/** Consecutive agreeing signals required before a topic shift is accepted. */
const TOPIC_SHIFT_HITS = 2;

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function marginOf(intentSignal) {
  const distribution = intentSignal?.distribution;
  if (!distribution || typeof distribution !== "object") return null;
  const sorted = Object.values(distribution)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (sorted.length < 2) return null;
  return sorted[0] - sorted[1];
}

/**
 * Hysteresis for topic changes: one noisy positive must not cut a conversation in
 * half, so we require consecutive agreeing verdicts.
 */
class TopicShiftTracker {
  constructor(hits = TOPIC_SHIFT_HITS) {
    this.hits = hits;
    this.positiveStreak = 0;
  }

  observe(signal) {
    if (!signal || typeof signal.value !== "boolean") {
      return { value: false, confidence: 0, accepted: false, streak: this.positiveStreak };
    }
    if (signal.value) this.positiveStreak += 1;
    else this.positiveStreak = 0;

    const accepted = this.positiveStreak >= this.hits;
    if (accepted) this.positiveStreak = 0;

    return {
      value: accepted,
      confidence: normalizeConfidence(signal.confidence),
      accepted,
      streak: this.positiveStreak,
    };
  }

  reset() {
    this.positiveStreak = 0;
  }
}

/**
 * Combines the deterministic decision with whatever signals the model produced.
 *
 * @param {{
 *   ruleDecision: { intent: string, confidence: number, signals?: { isQuestion?: boolean } },
 *   modelSignals?: { isQuestion?: object, intent?: object, topicShift?: object } | null,
 *   topicTracker?: TopicShiftTracker,
 *   modelError?: string | null,
 *   modelLatencyMs?: number,
 * }} input
 */
function fuseDecisions({ ruleDecision, modelSignals, topicTracker, modelError, modelLatencyMs }) {
  const ruleConfidence = normalizeConfidence(ruleDecision?.confidence);
  const intentSignal = modelSignals?.intent ?? null;
  const isQuestionSignal = modelSignals?.isQuestion ?? null;
  const topicSignal = modelSignals?.topicShift ?? null;

  const audit = [];
  const degraded = Boolean(modelError) || !modelSignals;

  let intent = ruleDecision?.intent;
  let intentSource = "rules";

  const modelConfidence = normalizeConfidence(intentSignal?.confidence);
  const margin = marginOf(intentSignal);
  const modelIntent = intentSignal?.value;

  if (ruleConfidence >= RULE_CERTAINTY) {
    audit.push({ signal: SIGNAL.INTENT, outcome: "rules_certain", ruleConfidence, modelConfidence });
  } else if (modelIntent && modelConfidence >= MODEL_MIN_CONFIDENCE) {
    const ruleAmbiguous =
      ruleConfidence >= RULE_AMBIGUOUS_MIN && ruleConfidence <= RULE_AMBIGUOUS_MAX;
    const marginOk = margin === null || margin >= MODEL_MIN_MARGIN;
    if (ruleAmbiguous && marginOk) {
      intent = modelIntent;
      intentSource = "model";
      audit.push({ signal: SIGNAL.INTENT, outcome: "model_override", ruleConfidence, modelConfidence, margin });
    } else {
      audit.push({
        signal: SIGNAL.INTENT,
        outcome: ruleAmbiguous ? "model_margin_too_small" : "rules_outside_window",
        ruleConfidence,
        modelConfidence,
        margin,
      });
    }
  } else {
    audit.push({ signal: SIGNAL.INTENT, outcome: "rules_default", ruleConfidence, modelConfidence });
  }

  // is-question: the rule is a regex heuristic with no confidence, so a confident
  // model verdict wins; otherwise the rule stands.
  const ruleIsQuestion = ruleDecision?.signals?.isQuestion === true;
  let isQuestion = ruleIsQuestion;
  if (isQuestionSignal && normalizeConfidence(isQuestionSignal.confidence) >= IS_QUESTION_MIN_CONFIDENCE) {
    isQuestion = Boolean(isQuestionSignal.value);
    audit.push({
      signal: SIGNAL.IS_QUESTION,
      outcome: "model",
      value: isQuestion,
      confidence: normalizeConfidence(isQuestionSignal.confidence),
    });
  } else {
    audit.push({ signal: SIGNAL.IS_QUESTION, outcome: "rules", value: ruleIsQuestion });
  }

  const topicShift = topicTracker
    ? topicTracker.observe(topicSignal)
    : { value: false, confidence: 0, accepted: false, streak: 0 };
  audit.push({ signal: SIGNAL.TOPIC_SHIFT, outcome: topicShift.accepted ? "accepted" : "held", ...topicShift });

  return {
    intent,
    isQuestion,
    topicShift: topicShift.value,
    topicShiftConfidence: topicShift.confidence,
    confidence: intentSource === "model" ? modelConfidence : ruleConfidence,
    source: intentSource,
    degraded,
    modelLatencyMs: modelLatencyMs ?? null,
    audit,
  };
}

module.exports = {
  SIGNAL,
  TopicShiftTracker,
  fuseDecisions,
  normalizeConfidence,
  marginOf,
  RULE_CERTAINTY,
  RULE_AMBIGUOUS_MIN,
  RULE_AMBIGUOUS_MAX,
  MODEL_MIN_CONFIDENCE,
  MODEL_MIN_MARGIN,
  IS_QUESTION_MIN_CONFIDENCE,
  TOPIC_SHIFT_HITS,
};
