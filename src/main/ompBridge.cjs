const debugLogger = require("../helpers/debugLogger");
const { createChatCompletion } = require("./chatCompletionClient");

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

  async prompt(text, options = {}) {
    if (this.settings.modelId) {
      return this.promptDirect(text, options);
    }
    if (!this.session) {
      return { text: "No model configured. Open Settings and set up your chat provider." };
    }
    // The omp session owns its own prompt stack; a per-turn system prompt cannot be
    // injected there. The direct provider path (LM Studio, llama-server, OpenAI-compatible)
    // is the supported route for Frost's decision prompts.
    if (options.systemPrompt) {
      debugLogger.debug("omp session ignores per-turn system prompt; use a direct provider");
    }
    await this.session.prompt(text);
    const messages = this.session.messages || [];
    const last = messages[messages.length - 1];
    return { text: last?.content || "", toolCalls: null, error: null };
  }

  async promptDirect(text, options = {}) {
    return createChatCompletion(
      {
        providerUrl: this.settings.providerUrl,
        apiKey: this.settings.apiKey,
        modelId: this.settings.modelId,
      },
      { text, ...options }
    );
  }

  async destroy() {
    if (this.session && typeof this.session.dispose === "function") {
      this.session.dispose();
    }
    this.session = null;
  }
}

module.exports = { OmpBridge };
