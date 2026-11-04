/**
 * Thin HTTP client for the local decision-model sidecar.
 *
 * Kept dependency-free and strictly time-boxed: a decision signal that arrives late
 * is worse than no signal at all, so every call degrades to `error` instead of
 * blocking the turn.
 *
 * Sidecar contract (POST /decide):
 *   { state: string, questions: Array<{ id, kind, prompt, options? }> }
 *   → { answers: { [id]: { value, confidence, distribution? } } }
 *
 * Reference: docs/DECISION-MODEL.md
 */

const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 150;

/**
 * @param {{ baseUrl: string, payload: object, timeoutMs?: number }} request
 * @returns {Promise<{ data: object|null, error: string|null, latencyMs: number, timedOut: boolean }>}
 */
function requestDecision({ baseUrl, payload, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ latencyMs: Date.now() - startedAt, ...result });
    };

    if (!baseUrl) {
      finish({ data: null, error: "decision model not configured", timedOut: false });
      return;
    }

    let url;
    try {
      url = new URL("/decide", baseUrl);
    } catch (err) {
      finish({ data: null, error: `invalid sidecar url: ${err.message}`, timedOut: false });
      return;
    }

    const body = Buffer.from(JSON.stringify(payload ?? {}));
    const transport = url.protocol === "https:" ? https : http;

    const request = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": body.length },
        timeout: timeoutMs,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 1_000_000) request.destroy(new Error("response too large"));
        });
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 400) {
            finish({ data: null, error: `sidecar HTTP ${response.statusCode}`, timedOut: false });
            return;
          }
          try {
            finish({ data: JSON.parse(raw), error: null, timedOut: false });
          } catch {
            finish({ data: null, error: "invalid sidecar payload", timedOut: false });
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("timeout"));
      finish({ data: null, error: `decision model timeout after ${timeoutMs}ms`, timedOut: true });
    });
    request.on("error", (err) => {
      finish({ data: null, error: err.message, timedOut: false });
    });

    request.write(body);
    request.end();
  });
}

module.exports = { requestDecision, DEFAULT_TIMEOUT_MS };
