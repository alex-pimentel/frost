/**
 * Rule-based decision layer for Frost.
 *
 * The engine answers one question before any model call: "what kind of request is
 * this, and does it need tools, saved knowledge, or just a direct answer?".
 * It is intentionally deterministic and dependency-free so it can run on every
 * utterance — including inside tests — without touching Electron or the network.
 */

const { stripWakeWord } = require("./wakeWord");

const INTENTS = Object.freeze({
  /** Dictation mode: return the text untouched. */
  DICTATION: "dictation",
  /** Greeting, thanks, identity: answer briefly, never touch tools. */
  SMALLTALK: "smalltalk",
  /** Must be answered from what Frost already knows (notes, history, profile). */
  KNOWLEDGE: "knowledge",
  /** Open question or request that needs the model to compose an answer. */
  GENERATE: "generate",
  /** Code/agent work: the only intent allowed to use tools. */
  CODE: "code",
  /** Too little signal to act: ask a focused question instead of guessing. */
  CLARIFY: "clarify",
});

const CODE_VERBS = [
  "implemente",
  "implementar",
  "implementa",
  "corrija",
  "corrigir",
  "conserte",
  "refatore",
  "refatorar",
  "refatora",
  "rode",
  "rodar",
  "execute",
  "executar",
  "compile",
  "compilar",
  "instale",
  "instalar",
  "crie (uma |a )?fun[çc][ãa]o",
  "cria (uma |a )?fun[çc][ãa]o",
  "escreva o c[óo]digo",
  "escreva um script",
  "debugue",
  "depure",
  "faça o deploy",
  "faca o deploy",
  "abre um pr",
  "abra um pr",
  "make the",
  "write the code",
  "fix the",
  "run the tests",
];

const CODE_NOUNS = [
  "c[óo]digo",
  "codebase",
  "funç[ãa]o",
  "funç[õo]es",
  "classe",
  "script",
  "bug",
  "teste unit[áa]rio",
  "testes unit[áa]rios",
  "unit test",
  "commit",
  "branch",
  "merge",
  "pull request",
  "migration",
  "refactor",
  "stack trace",
  "regex",
  "endpoint",
  "query sql",
  "schema",
];

const CODE_PATH_PATTERN =
  /\b[\w./-]+\.(js|jsx|ts|tsx|php|py|rb|go|rs|java|kt|sql|json|ya?ml|sh|css|html)\b/;
const CODE_SHAPE_PATTERN = /(\S+\(\)|=>|\w+::\w+|`[^`]+`)/;

const KNOWLEDGE_PATTERNS = [
  /\b(minhas? notas?|meus? notes?|anota[çc][ãa]o|anota[çc][õo]es|anotei|salvei|salvo)\b/i,
  /\b(reuni[ãa]o|reuni[õo]es|meeting|transcri[çc][ãa]o|transcri[çc][õo]es)\b/i,
  /\b(o que (eu|a gente) (falei|disse|combinamos|decidimos|acordamos))\b/i,
  /\b(lembra|lembrar|mem[óo]ria|hist[óo]rico|arquivad[oa]s?)\b/i,
  /\b(meu curr[íi]culo|curr[íi]culo|minha experi[êe]ncia|minhas vagas|minha vaga)\b/i,
  /\b(segundo o que|baseado no que|de acordo com o que|conforme (eu|a gente))\b/i,
];

const QUESTION_START =
  /^(o que|que |qual|quais|quando|onde|quem|como|por que|porque|quanto|quantos|quantas|será que|sera que|what|when|where|who|whom|whose|which|how|why|is |are |do |does |did |can |could |should |would )/i;

const REQUEST_START =
  /^(me (diga|diz|digas|explica|explique|conte|conta|ajuda|ajude)|preciso que|quero que|voc[êe] pode|pode me|resuma|resume|explique|explica|descreva|descreve|compare|traduza|traduz)\b/i;

const SMALLTALK_PATTERNS = [
  /^(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[íi]|eai|hey|hi|hello|tudo bem|tudo bom|opa)\b[.!?]*$/i,
  /^(obrigad[oa]|valeu|vlw|thanks|thank you|brigad[oa])\b[.!?]*$/i,
  /\b(quem [ée] voc[êe]|seu nome|o que voc[êe] (é|faz)|what are you|what can you do)\b/i,
];

const BARE_CONFIRMATIONS =
  /^(sim|n[ãa]o|nao|yes|no|confirmo|confirmado|pode|bora|certo|beleza|ok|okay|claro)[.!?]*$/i;

function countMatches(patterns, text) {
  const hits = [];
  for (const pattern of patterns) {
    if (pattern.test(text)) hits.push(pattern.source);
  }
  return hits;
}

/**
 * JavaScript's \b is ASCII-only, so `\bfunç\b` never matches "função". These
 * lookarounds treat accented letters as word characters, which is what we mean.
 */
function wordBoundaryPattern(fragment) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${fragment}(?![\\p{L}\\p{N}])`, "iu");
}

function isQuestion(text) {
  return text.endsWith("?") || QUESTION_START.test(text) || REQUEST_START.test(text);
}

function words(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Classifies text into an intent.
 *
 * @param {string} input raw user text (may include a wake phrase)
 * @param {{ mode?: string, wakeWords?: string[] }} [options]
 */
function decide(input, options = {}) {
  const mode = options.mode ?? "chat";
  const raw = typeof input === "string" ? input : "";
  const wake = stripWakeWord(raw, options.wakeWords);
  const text = wake.text;
  const lowered = text.toLowerCase();

  const base = {
    text,
    rawText: raw,
    mode,
    signals: {
      wakeWord: wake.detected,
      matchedWakeWord: wake.matched,
      isQuestion: false,
      codeSignals: [],
      knowledgeSignals: [],
    },
    shouldUseTools: false,
    shouldUseKnowledge: false,
    needsModel: false,
  };

  if (mode === "dictation") {
    return {
      ...base,
      intent: INTENTS.DICTATION,
      confidence: 1,
      reason: "dictation_mode_passthrough",
      needsModel: false,
      text: raw,
    };
  }

  if (!text.trim()) {
    return {
      ...base,
      intent: INTENTS.CLARIFY,
      confidence: 1,
      reason: wake.detected ? "wake_word_without_request" : "empty_input",
    };
  }

  base.signals.isQuestion = isQuestion(lowered);

  const codeVerbHits = countMatches(CODE_VERBS.map(wordBoundaryPattern), lowered);
  const codeNounHits = countMatches(CODE_NOUNS.map(wordBoundaryPattern), lowered);
  const codeSignals = [...codeVerbHits, ...codeNounHits];
  if (CODE_PATH_PATTERN.test(text)) codeSignals.push("file_path");
  if (CODE_SHAPE_PATTERN.test(text)) codeSignals.push("code_shape");
  base.signals.codeSignals = codeSignals;
  base.signals.codeVerbs = codeVerbHits;

  const knowledgeSignals = countMatches(KNOWLEDGE_PATTERNS, lowered);
  base.signals.knowledgeSignals = knowledgeSignals;

  const isSmallTalk = countMatches(SMALLTALK_PATTERNS, lowered).length > 0 && words(text) <= 12;

  if (isSmallTalk) {
    return {
      ...base,
      intent: INTENTS.SMALLTALK,
      confidence: 0.9,
      reason: "greeting_or_identity",
      needsModel: true,
    };
  }

  if (BARE_CONFIRMATIONS.test(lowered.trim()) && words(text) === 1) {
    return {
      ...base,
      intent: INTENTS.CLARIFY,
      confidence: 0.8,
      reason: "confirmation_without_context",
    };
  }

  // Code wins only with real evidence: an imperative verb, or two independent hints.
  // A single mention of "api" in a personal question must not open the tool surface.
  if (codeVerbHits.length > 0 || codeSignals.length >= 2) {
    return {
      ...base,
      intent: INTENTS.CODE,
      confidence: codeVerbHits.length > 0 && codeSignals.length >= 2 ? 0.95 : 0.85,
      reason: "code_signals_present",
      shouldUseTools: true,
      needsModel: true,
    };
  }

  if (knowledgeSignals.length > 0) {
    return {
      ...base,
      intent: INTENTS.KNOWLEDGE,
      confidence: knowledgeSignals.length >= 2 ? 0.9 : 0.78,
      reason: "references_saved_knowledge",
      shouldUseKnowledge: true,
      needsModel: true,
    };
  }

  if (base.signals.isQuestion) {
    return {
      ...base,
      intent: INTENTS.GENERATE,
      confidence: 0.8,
      reason: "open_question",
      needsModel: true,
    };
  }

  if (words(text) <= 2) {
    return {
      ...base,
      intent: INTENTS.CLARIFY,
      confidence: 0.5,
      reason: "too_little_context",
    };
  }

  return {
    ...base,
    intent: INTENTS.GENERATE,
    confidence: 0.6,
    reason: "default_answer_path",
    needsModel: true,
  };
}

module.exports = { INTENTS, decide, isQuestion };
