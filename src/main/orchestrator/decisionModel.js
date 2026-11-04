/**
 * Decision model adapter.
 *
 * Turns a conversation turn into *typed questions* (the Laya/Jev shape: choose an
 * option, or answer yes/no with a probability) and maps the answers back into the
 * signals consumed by `decisionSignals.fuseDecisions`.
 *
 * Shadow mode is the default: the model runs, is logged and measured, but its
 * verdicts do not steer the orchestrator until the evaluation harness says they beat
 * the rules.
 */

const { requestDecision } = require("./decisionModelClient");

const INTENT_OPTIONS = ["smalltalk", "knowledge", "generate", "code", "clarify"];

/** Keep the state short: the English checkpoint's window is 512 tokens. */
const MAX_STATE_CHARS = 1200;

function buildQuestions({ hasPrevious }) {
  const questions = [
    {
      id: "is_question",
      kind: "noul",
      prompt: "O texto do usuário é uma pergunta ou um pedido de informação?",
    },
    {
      id: "intent",
      kind: "choice",
      prompt: "Qual é a intenção do usuário?",
      options: INTENT_OPTIONS,
    },
  ];

  if (hasPrevious) {
    questions.push({
      id: "topic_shift",
      kind: "noul",
      prompt: "O usuário mudou de assunto em relação à fala anterior?",
    });
  }

  return questions;
}

function buildState({ text, previousText }) {
  const parts = [];
  if (previousText) parts.push(`anterior: ${String(previousText).trim()}`);
  parts.push(`agora: ${String(text ?? "").trim()}`);
  return parts.join("\n").slice(0, MAX_STATE_CHARS);
}

/**
 * Maps the sidecar payload into fusion signals. Unknown/absent answers are simply
 * omitted so the rules keep authority for that dimension.
 */
function mapAnswers(payload, { hasPrevious }) {
  const answers = payload?.answers;
  if (!answers || typeof answers !== "object") return null;

  const signals = {};

  const isQuestion = answers.is_question;
  if (isQuestion && typeof isQuestion.value === "boolean") {
    signals.isQuestion = {
      value: isQuestion.value,
      confidence: Number(isQuestion.confidence ?? 0),
    };
  }

  const intent = answers.intent;
  if (intent && typeof intent.value === "string" && INTENT_OPTIONS.includes(intent.value)) {
    signals.intent = {
      value: intent.value,
      confidence: Number(intent.confidence ?? 0),
      distribution:
        intent.distribution && typeof intent.distribution === "object"
          ? intent.distribution
          : undefined,
    };
  }

  if (hasPrevious) {
    const topicShift = answers.topic_shift;
    if (topicShift && typeof topicShift.value === "boolean") {
      signals.topicShift = {
        value: topicShift.value,
        confidence: Number(topicShift.confidence ?? 0),
      };
    }
  }

  return Object.keys(signals).length > 0 ? signals : null;
}

class DecisionModel {
  /**
   * @param {{
   *   baseUrl?: string,
   *   timeoutMs?: number,
   *   shadow?: boolean,
   *   enabled?: boolean,
   *   logger?: { debug?: Function, warn?: Function },
   * }} [options]
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? null;
    this.timeoutMs = options.timeoutMs ?? 150;
    this.shadow = options.shadow ?? true;
    this.enabled = options.enabled ?? Boolean(this.baseUrl);
    this.logger = options.logger ?? { debug: () => {}, warn: () => {} };
    this.previousText = null;
    this.stats = { calls: 0, errors: 0, timeouts: 0, totalLatencyMs: 0, overrides: 0 };
  }

  isEnabled() {
    return Boolean(this.enabled && this.baseUrl);
  }

  /** Records the turn as context for the next topic-shift question. */
  remember(text) {
    this.previousText = typeof text === "string" ? text : null;
  }

  getStats() {
    const { calls, totalLatencyMs } = this.stats;
    return {
      ...this.stats,
      avgLatencyMs: calls > 0 ? Math.round(totalLatencyMs / calls) : 0,
    };
  }

  /**
   * @param {{ text: string }} input
   * @returns {Promise<{ signals: object|null, error: string|null, latencyMs: number, shadow: boolean }>}
   */
  async classify({ text }) {
    const hasPrevious = Boolean(this.previousText);

    if (!this.isEnabled()) {
      return { signals: null, error: "decision model disabled", latencyMs: 0, shadow: this.shadow };
    }

    const payload = {
      state: buildState({ text, previousText: this.previousText }),
      questions: buildQuestions({ hasPrevious }),
    };

    const result = await requestDecision({
      baseUrl: this.baseUrl,
      payload,
      timeoutMs: this.timeoutMs,
    });

    this.stats.calls += 1;
    this.stats.totalLatencyMs += result.latencyMs;

    if (result.error) {
      this.stats.errors += 1;
      if (result.timedOut) this.stats.timeouts += 1;
      this.logger.warn?.("Decision model degraded", { error: result.error });
      return { signals: null, error: result.error, latencyMs: result.latencyMs, shadow: this.shadow };
    }

    const signals = mapAnswers(result.data, { hasPrevious });
    return { signals, error: signals ? null : "empty decision answers", latencyMs: result.latencyMs, shadow: this.shadow };
  }
}

module.exports = {
  DecisionModel,
  buildQuestions,
  buildState,
  mapAnswers,
  INTENT_OPTIONS,
  MAX_STATE_CHARS,
};
