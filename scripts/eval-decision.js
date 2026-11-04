#!/usr/bin/env node
/**
 * Decision evaluation harness.
 *
 * Compares the deterministic rules against statistical alternatives on a labeled
 * dataset BEFORE any of them is allowed to steer the orchestrator. This is the gate
 * described in docs/DECISION-MODEL.md: a model only gets promoted if it beats the
 * rules on the ambiguous cases, not on average.
 *
 * Usage:
 *   node scripts/eval-decision.js                          # rules vs char-n-gram kNN
 *   node scripts/eval-decision.js --sidecar http://127.0.0.1:8765
 *   node scripts/eval-decision.js --dataset test/fixtures/decision-dataset.jsonl
 *
 * Dataset format (JSONL): {"text", "intent", "isQuestion", "topicShift?"}
 */

const fs = require("fs");
const path = require("path");

const { decide } = require("../src/main/orchestrator/decisionEngine");
const { requestDecision } = require("../src/main/orchestrator/decisionModelClient");
const { buildQuestions, buildState, mapAnswers } = require("../src/main/orchestrator/decisionModel");

function parseArgs(argv) {
  const args = { dataset: "test/fixtures/decision-dataset.jsonl", sidecar: null, limit: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dataset") args.dataset = argv[index + 1];
    if (argv[index] === "--sidecar") args.sidecar = argv[index + 1];
    if (argv[index] === "--limit") args.limit = Number(argv[index + 1]) || 0;
  }
  return args;
}

function loadDataset(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSON on line ${index + 1}: ${error.message}`);
      }
    });
}

/** Character n-grams: cheap, dependency-free, surprisingly strong for intent. */
function ngrams(text, size = 3) {
  const normalized = String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const padded = ` ${normalized} `;
  const grams = new Map();
  for (let index = 0; index + size <= padded.length; index += 1) {
    const gram = padded.slice(index, index + size);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [gram, count] of a) {
    normA += count * count;
    const other = b.get(gram);
    if (other) dot += count * other;
  }
  for (const count of b.values()) normB += count * count;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Leave-one-out kNN over the dataset itself: a floor, not a benchmark. */
function knnPredict(dataset, query) {
  const queryGrams = ngrams(query.text);
  const scored = dataset
    .filter((item) => item !== query)
    .map((item) => ({ item, score: cosine(queryGrams, ngrams(item.text)) }))
    .sort((a, b) => b.score - a.score);

  const votes = new Map();
  for (const { item, score } of scored.slice(0, 5)) {
    votes.set(item.intent, (votes.get(item.intent) ?? 0) + score);
  }
  let best = null;
  for (const [intent, score] of votes) {
    if (!best || score > best.score) best = { intent, score };
  }
  return best ? best.intent : null;
}

function percentiles(values) {
  if (values.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  return { p50: Math.round(at(0.5)), p95: Math.round(at(0.95)) };
}

function score(predictions) {
  const total = predictions.length;
  let intentHits = 0;
  let questionHits = 0;
  let questionTotal = 0;
  let topicHits = 0;
  let topicTotal = 0;
  const perIntent = new Map();

  for (const row of predictions) {
    const bucket = perIntent.get(row.expected.intent) ?? { total: 0, hits: 0 };
    bucket.total += 1;
    if (row.predicted.intent === row.expected.intent) {
      bucket.hits += 1;
      intentHits += 1;
    }
    perIntent.set(row.expected.intent, bucket);

    if (typeof row.expected.isQuestion === "boolean" && row.predicted.isQuestion !== undefined) {
      questionTotal += 1;
      if (row.predicted.isQuestion === row.expected.isQuestion) questionHits += 1;
    }
    if (typeof row.expected.topicShift === "boolean" && row.predicted.topicShift !== undefined) {
      topicTotal += 1;
      if (row.predicted.topicShift === row.expected.topicShift) topicHits += 1;
    }
  }

  return {
    total,
    intentAccuracy: total ? intentHits / total : 0,
    questionAccuracy: questionTotal ? questionHits / questionTotal : null,
    topicAccuracy: topicTotal ? topicHits / topicTotal : null,
    perIntent,
  };
}

function formatPercent(value) {
  return value === null || value === undefined ? "   n/a" : `${(value * 100).toFixed(1)}%`.padStart(6);
}

async function runRules(dataset) {
  const predictions = [];
  const latencies = [];
  for (const item of dataset) {
    const startedAt = process.hrtime.bigint();
    const decision = decide(item.text, { mode: "chat" });
    latencies.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
    predictions.push({
      expected: item,
      predicted: {
        intent: decision.intent,
        isQuestion: decision.signals.isQuestion,
        confidence: decision.confidence,
      },
    });
  }
  return { predictions, latencies };
}

function runKnn(dataset) {
  const predictions = [];
  const latencies = [];
  for (const item of dataset) {
    const startedAt = process.hrtime.bigint();
    const intent = knnPredict(dataset, item);
    latencies.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
    predictions.push({ expected: item, predicted: { intent } });
  }
  return { predictions, latencies };
}

async function runSidecar(dataset, baseUrl) {
  const predictions = [];
  const latencies = [];
  let degraded = 0;
  let previousText = null;

  for (const item of dataset) {
    const hasPrevious = Boolean(previousText);
    const result = await requestDecision({
      baseUrl,
      payload: { state: buildState({ text: item.text, previousText }), questions: buildQuestions({ hasPrevious }) },
      timeoutMs: 2000,
    });
    if (result.error) {
      degraded += 1;
      predictions.push({ expected: item, predicted: { intent: null } });
    } else {
      const signals = mapAnswers(result.data, { hasPrevious });
      predictions.push({
        expected: item,
        predicted: {
          intent: signals?.intent?.value ?? null,
          isQuestion: signals?.isQuestion?.value,
          topicShift: signals?.topicShift?.value,
        },
      });
    }
    latencies.push(result.latencyMs);
    previousText = item.text;
  }

  return { predictions, latencies, degraded };
}

function report(name, result) {
  const metrics = score(result.predictions);
  const latency = percentiles(result.latencies);
  console.log(`\n${name}`);
  console.log(`  intent     ${formatPercent(metrics.intentAccuracy)}  (n=${metrics.total})`);
  console.log(`  isQuestion ${formatPercent(metrics.questionAccuracy)}`);
  if (metrics.topicAccuracy !== null) console.log(`  topicShift ${formatPercent(metrics.topicAccuracy)}`);
  console.log(`  latency    p50 ${latency.p50}ms  p95 ${latency.p95}ms`);
  if (result.degraded) console.log(`  degraded   ${result.degraded}/${metrics.total}`);
  for (const [intent, bucket] of [...metrics.perIntent].sort()) {
    console.log(`    ${intent.padEnd(10)} ${formatPercent(bucket.hits / bucket.total)} (${bucket.hits}/${bucket.total})`);
  }
  return metrics;
}

function agreement(a, b) {
  let same = 0;
  for (let index = 0; index < a.predictions.length; index += 1) {
    if (a.predictions[index].predicted.intent === b.predictions[index].predicted.intent) same += 1;
  }
  return a.predictions.length ? same / a.predictions.length : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetPath = path.resolve(process.cwd(), args.dataset);
  let dataset = loadDataset(datasetPath);
  if (args.limit > 0) dataset = dataset.slice(0, args.limit);

  console.log(`dataset: ${datasetPath} (${dataset.length} exemplos)`);

  const rules = await runRules(dataset);
  const rulesMetrics = report("regras (decisionEngine)", rules);

  const knn = runKnn(dataset);
  report("baseline kNN char-3gram (leave-one-out)", knn);
  console.log(`\nconcordancia regras x kNN: ${(agreement(rules, knn) * 100).toFixed(1)}%`);

  if (args.sidecar) {
    const sidecar = await runSidecar(dataset, args.sidecar);
    const sidecarMetrics = report(`sidecar ${args.sidecar}`, sidecar);
    console.log(
      `\nmodelo vs regras: ${((sidecarMetrics.intentAccuracy - rulesMetrics.intentAccuracy) * 100).toFixed(1)} p.p.`
    );
    console.log(`concordancia regras x modelo: ${(agreement(rules, sidecar) * 100).toFixed(1)}%`);
  } else {
    console.log("\n(sidecar nao informado; use --sidecar http://127.0.0.1:8765)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
