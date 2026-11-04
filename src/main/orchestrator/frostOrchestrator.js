/**
 * Frost orchestration pipeline.
 *
 * Deterministic stages run before the model:
 *   decide → use saved knowledge → generate → validate
 *
 * The orchestrator never touches Electron or the network directly: the model is
 * reached through an injected bridge (`prompt(text, { systemPrompt })`) and saved
 * knowledge through an injected provider (`search(query)`). That keeps the whole
 * decision path unit-testable.
 */

const { decide, INTENTS } = require("./decisionEngine");
const { buildSystemPrompt } = require("./systemPrompt");

const CLARIFY_MESSAGES = {
  empty_input: "Estou aqui. O que você precisa?",
  wake_word_without_request: "Estou aqui. O que você precisa?",
  confirmation_without_context: "Não há nenhuma pergunta pendente. Confirmação sobre o quê?",
  too_little_context: "Pode me dar um pouco mais de contexto?",
};

const EMPTY_RESPONSE_MESSAGE =
  "Não consegui montar uma resposta agora. Pode reformular ou dar mais contexto?";
const NO_MODEL_MESSAGE =
  "Nenhum modelo configurado. Abra as configurações e defina o provedor do Chat.";

class FrostOrchestrator {
  /**
   * @param {{
   *   bridge?: { prompt: (text: string, options?: object) => Promise<{ text: string, error?: string }> },
   *   answerBank?: { find: (question: string) => ({ entry: object, confidence: number } | null) },
   *   knowledgeProvider?: { search: (query: string, options?: object) => Promise<Array<object>> },
   *   logger?: { debug?: Function, info?: Function, warn?: Function },
   *   wakeWords?: string[],
   *   persona?: string,
   *   mode?: string,
   * }} [deps]
   */
  constructor(deps = {}) {
    this.bridge = deps.bridge ?? null;
    this.answerBank = deps.answerBank ?? null;
    this.knowledgeProvider = deps.knowledgeProvider ?? null;
    this.logger = deps.logger ?? { debug: () => {}, info: () => {}, warn: () => {} };
    this.wakeWords = deps.wakeWords;
    this.persona = deps.persona;
    this.mode = deps.mode ?? "chat";
    this.lastDecision = null;
  }

  setMode(mode) {
    if (mode) this.mode = mode;
  }

  getMode() {
    return this.mode;
  }

  getLastDecision() {
    return this.lastDecision;
  }

  /**
   * Runs a full turn and returns rich metadata (used by IPC handlers and tests).
   *
   * @param {string} input
   * @returns {Promise<{ text: string, source: string, decision: object, knowledgeBlocks?: Array<object> }>}
   */
  async process(input) {
    const decision = decide(input, { mode: this.mode, wakeWords: this.wakeWords });
    this.lastDecision = decision;
    this.logger.debug("Frost decision", {
      intent: decision.intent,
      confidence: decision.confidence,
      reason: decision.reason,
      wakeWord: decision.signals.wakeWord,
    });

    if (decision.intent === INTENTS.DICTATION) {
      return { text: String(input ?? ""), source: "dictation_passthrough", decision };
    }

    if (decision.intent === INTENTS.CLARIFY) {
      return {
        text: CLARIFY_MESSAGES[decision.reason] ?? CLARIFY_MESSAGES.too_little_context,
        source: "clarify_rule",
        decision,
      };
    }

    // Saved answers win over generation for any knowledge-seeking turn: the same
    // repeated question must always receive the same stored answer, with no model
    // call and no variation. Code and small talk are exempt.
    if (decision.intent === INTENTS.GENERATE || decision.intent === INTENTS.KNOWLEDGE) {
      const stored = this.findStoredAnswer(decision.text);
      if (stored) {
        this.logger.debug("Answered from answer bank", {
          id: stored.entry.id,
          confidence: stored.confidence,
        });
        return { text: stored.entry.answer, source: "answer_bank", decision };
      }
    }

    const knowledgeBlocks = await this.retrieveKnowledge(decision);
    const systemPrompt = buildSystemPrompt({
      decision,
      knowledgeBlocks,
      persona: this.persona,
    });

    if (!this.bridge || typeof this.bridge.prompt !== "function") {
      return { text: NO_MODEL_MESSAGE, source: "no_model", decision };
    }

    const startedAt = Date.now();
    let response;
    try {
      response = await this.bridge.prompt(decision.text, { systemPrompt, decision });
    } catch (err) {
      this.logger.warn("Frost model call failed", { error: err?.message });
      throw err;
    }

    const text = typeof response?.text === "string" ? response.text.trim() : "";
    this.logger.debug("Frost model answered", {
      intent: decision.intent,
      durationMs: Date.now() - startedAt,
      knowledgeBlocks: knowledgeBlocks.length,
      empty: text.length === 0,
      modelError: response?.error ?? null,
    });

    if (!text) {
      return {
        text: response?.error ? `Erro do modelo: ${response.error}` : EMPTY_RESPONSE_MESSAGE,
        source: "model_empty",
        decision,
        knowledgeBlocks,
      };
    }

    return { text, source: "model", decision, knowledgeBlocks };
  }

  /**
   * Compatibility helper: plain text in, plain text out.
   * @param {string} input
   */
  async processText(input) {
    const result = await this.process(input);
    return result.text;
  }

  findStoredAnswer(question) {
    if (!this.answerBank || typeof this.answerBank.find !== "function") return null;
    try {
      return this.answerBank.find(question);
    } catch (err) {
      this.logger.warn("Answer bank lookup failed", { error: err?.message });
      return null;
    }
  }

  async retrieveKnowledge(decision) {
    if (!decision.shouldUseKnowledge) return [];
    if (!this.knowledgeProvider || typeof this.knowledgeProvider.search !== "function") {
      return [];
    }
    try {
      const blocks = await this.knowledgeProvider.search(decision.text, { limit: 5 });
      if (!Array.isArray(blocks)) return [];
      if (blocks.length === 0) {
        this.logger.debug("Knowledge miss: no saved blocks for this question");
      }
      return blocks;
    } catch (err) {
      this.logger.warn("Knowledge retrieval failed", { error: err?.message });
      return [];
    }
  }
}

module.exports = { FrostOrchestrator, CLARIFY_MESSAGES, EMPTY_RESPONSE_MESSAGE };
