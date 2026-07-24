const debugLogger = require("../helpers/debugLogger");

class OmpBridge {
  constructor(settings) {
    this.session = null;
    this.settings = settings || { providerUrl: "http://localhost:1234/v1", apiKey: "", modelId: "" };
  }

  async initialize() {
    if (this.settings.modelId) {
      debugLogger.debug("OmpBridge ready with direct API", { providerUrl: this.settings.providerUrl, modelId: this.settings.modelId });
      return;
    }
    let sdk;
    try {
      sdk = require("@oh-my-pi/pi-coding-agent");
    } catch (err) {
      debugLogger.debug("omp SDK not available", { error: err.message });
      return;
    }
    try {
      const auth = await sdk.discoverAuthStorage();
      this.sessionManager = sdk.SessionManager.inMemory();
      this.modelRegistry = new sdk.ModelRegistry(auth);
      await this.modelRegistry.refresh();
      const result = await sdk.createAgentSession({
        sessionManager: this.sessionManager,
        authStorage: auth,
        modelRegistry: this.modelRegistry,
      });
      this.session = result.session;
      debugLogger.debug("omp SDK session created");
    } catch (err) {
      debugLogger.debug("omp SDK init error (non-fatal)", { error: err.message });
    }
  }

  async updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  async prompt(text) {
    if (this.settings.modelId) {
      return this.promptDirect(text);
    }
    if (!this.session) {
      return { text: "No model configured. Open Settings and set up your chat provider." };
    }
    await this.session.prompt(text);
    const messages = this.session.messages || [];
    const last = messages[messages.length - 1];
    return { text: last?.content || "", toolCalls: null, error: null };
  }

  async promptDirect(text) {
    const url = `${this.settings.providerUrl.replace(/\/+$/, "")}/chat/completions`;
    const body = JSON.stringify({
      model: this.settings.modelId,
      messages: [{ role: "user", content: text }],
      stream: false,
    });
    const headers = { "Content-Type": "application/json" };
    if (this.settings.apiKey) headers["Authorization"] = `Bearer ${this.settings.apiKey}`;

    try {
      const u = new URL(url);
      const http = require("http");
      return new Promise((resolve) => {
        const options = {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: "POST",
          headers,
          timeout: 60000,
        };
        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              const content = parsed?.choices?.[0]?.message?.content || "";
              resolve({ text: content, toolCalls: null, error: null });
            } catch {
              resolve({ text: "", toolCalls: null, error: "Failed to parse response" });
            }
          });
        });
        req.on("error", (err) => {
          resolve({ text: "", toolCalls: null, error: err.message });
        });
        req.write(body);
        req.end();
      });
    } catch (err) {
      return { text: "", toolCalls: null, error: err.message };
    }
  }

  async destroy() {
    if (this.session && typeof this.session.dispose === "function") {
      this.session.dispose();
    }
    this.session = null;
  }
}

module.exports = { OmpBridge };
