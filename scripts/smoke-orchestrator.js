#!/usr/bin/env node
/**
 * End-to-end smoke test for the Frost decision orchestrator against a real model.
 *
 * Usage:
 *   FROST_BASE_URL=http://127.0.0.1:12434/engines/v1 \
 *   FROST_MODEL=docker.io/ai/gemma4:e2b-q4_K_M \
 *   node scripts/smoke-orchestrator.js
 *
 * Runs a battery of turns through the real pipeline (decision engine → answer bank
 * → system prompt → HTTP client → validation) and prints what each one decided.
 * No Electron, no app boot, no node_modules.
 */

const { createChatCompletion } = require("../src/main/chatCompletionClient");
const { FrostOrchestrator } = require("../src/main/orchestrator/frostOrchestrator");
const { AnswerBank } = require("../src/main/orchestrator/answerBank");

const BASE_URL = process.env.FROST_BASE_URL || "http://127.0.0.1:12434/engines/v1";
const MODEL = process.env.FROST_MODEL || "docker.io/ai/gemma4:e2b-q4_K_M";
const TIMEOUT_MS = Number(process.env.FROST_TIMEOUT_MS || 240000);

const TURNS = [
  { label: "pergunta aberta", input: "Hey Frost, em uma frase, o que é Docker Model Runner?" },
  { label: "pedido de código", input: "implemente um endpoint de login em src/api.php" },
  { label: "saudação", input: "oi" },
  { label: "confirmação solta", input: "sim" },
  { label: "resposta salva", input: "Qual a sua pretensão salarial?" },
  { label: "conhecimento sem RAG", input: "o que eu anotei sobre a reunião de ontem?" },
];

const calls = [];
const bridge = {
  prompt(text, options) {
    calls.push({ text, systemPrompt: options?.systemPrompt ?? "" });
    return createChatCompletion(
      { providerUrl: BASE_URL, modelId: MODEL },
      { text, systemPrompt: options?.systemPrompt, temperature: 0.3, timeoutMs: TIMEOUT_MS }
    );
  },
};

const answerBank = new AnswerBank({
  entries: [
    {
      id: "pretensao_salarial",
      question: "Pretensão salarial",
      aliases: ["expectativa salarial"],
      answer: "R$ 18.000 a R$ 22.000 (PJ)",
    },
  ],
});

async function stripThinking(text) {
  try {
    const mod = await import("../src/helpers/stripThinking.js");
    return mod.stripThinkingTags(text);
  } catch {
    return text;
  }
}

function truncate(value, limit = 200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

async function main() {
  console.log(`Frost smoke → ${BASE_URL} | model=${MODEL} | timeout=${TIMEOUT_MS}ms\n`);
  const orchestrator = new FrostOrchestrator({ bridge, answerBank });
  const report = [];

  for (const turn of TURNS) {
    const startedAt = Date.now();
    let result;
    try {
      result = await orchestrator.process(turn.input);
    } catch (err) {
      result = { text: `ERROR: ${err.message}`, source: "exception", decision: { intent: "?" } };
    }
    const durationMs = Date.now() - startedAt;
    const clean = await stripThinking(result.text);

    report.push({
      label: turn.label,
      input: turn.input,
      intent: result.decision?.intent ?? "?",
      confidence: result.decision?.confidence,
      tools: result.decision?.shouldUseTools === true,
      source: result.source,
      ms: durationMs,
      answer: clean,
    });

    console.log(`[${turn.label}]`);
    console.log(`  in      : ${truncate(turn.input, 80)}`);
    console.log(
      `  decision: ${result.decision?.intent} (conf ${result.decision?.confidence}, tools=${result.decision?.shouldUseTools === true})`
    );
    console.log(`  source  : ${result.source} | ${durationMs}ms`);
    console.log(`  out     : ${truncate(clean, 320) || "(vazio)"}`);
    console.log("");
  }

  const generateCall = calls[0];
  const codeCall = calls[1];
  console.log("--- prompt wiring ---");
  console.log(
    `system prompt enviado em pergunta aberta: ${generateCall ? "sim" : "não"} | tools mencionadas: ${
      generateCall && /tools are allowed/.test(generateCall.systemPrompt) ? "SIM (ERRO)" : "não"
    }`
  );
  console.log(
    `system prompt enviado em pedido de código: ${codeCall ? "sim" : "não"} | tools mencionadas: ${
      codeCall && /tools are allowed/.test(codeCall.systemPrompt) ? "sim (correto)" : "NÃO (ERRO)"
    }`
  );
  console.log(`chamadas ao modelo: ${calls.length} de ${TURNS.length} turnos`);

  const modelTurns = report.filter((item) => item.source === "model");
  const failures = modelTurns.filter((item) => !item.answer);
  console.log(
    `turnos resolvidos por regra: ${report.length - modelTurns.length} | pelo modelo: ${modelTurns.length} | vazios: ${failures.length}`
  );

  process.exit(failures.length === modelTurns.length ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
