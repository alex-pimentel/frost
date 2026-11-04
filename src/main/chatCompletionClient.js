/**
 * Minimal OpenAI-compatible chat client.
 *
 * Deliberately dependency-free (no SDK, no Electron) so the decision pipeline can be
 * tested against a local HTTP server. Supports both http:// and https:// endpoints:
 * the previous implementation always used `http`, which silently broke every cloud
 * provider URL.
 */

const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 120000;

/**
 * @param {{ providerUrl: string, apiKey?: string, modelId: string }} settings
 * @param {{ text: string, systemPrompt?: string, temperature?: number, timeoutMs?: number, extraMessages?: Array<object> }} request
 * @returns {Promise<{ text: string, toolCalls: null, error: string|null }>}
 */
function createChatCompletion(settings, request) {
  const { providerUrl, apiKey, modelId } = settings ?? {};
  const text = typeof request?.text === "string" ? request.text : "";

  if (!providerUrl) {
    return Promise.resolve({ text: "", toolCalls: null, error: "No provider URL configured" });
  }
  if (!modelId) {
    return Promise.resolve({ text: "", toolCalls: null, error: "No model id configured" });
  }

  const url = `${String(providerUrl).replace(/\/+$/, "")}/chat/completions`;
  const messages = [];
  if (request?.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
  if (Array.isArray(request?.extraMessages)) messages.push(...request.extraMessages);
  messages.push({ role: "user", content: text });

  const body = JSON.stringify({
    model: modelId,
    messages,
    stream: false,
    temperature: typeof request?.temperature === "number" ? request.temperature : 0.4,
  });

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const timeoutMs = typeof request?.timeoutMs === "number" ? request.timeoutMs : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      resolve({ text: "", toolCalls: null, error: `Invalid provider URL: ${err.message}` });
      return;
    }

    const transport = parsedUrl.protocol === "https:" ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: "POST",
      headers,
      timeout: timeoutMs,
    };

    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          resolve({
            text: "",
            toolCalls: null,
            error: `HTTP ${res.statusCode}: ${String(data).slice(0, 200)}`,
          });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.message?.content || "";
          resolve({ text: content, toolCalls: null, error: null });
        } catch {
          resolve({ text: "", toolCalls: null, error: "Failed to parse response" });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Model request timed out after ${timeoutMs}ms`));
    });
    req.on("error", (err) => {
      resolve({ text: "", toolCalls: null, error: err.message });
    });
    req.write(body);
    req.end();
  });
}

module.exports = { createChatCompletion, DEFAULT_TIMEOUT_MS };
