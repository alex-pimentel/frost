const debugLogger = require("../helpers/debugLogger");

class OmpBridge {
  constructor() {
    this.session = null;
    this.sessionManager = null;
    this.modelRegistry = null;
  }

  async initialize() {
    let sdk;
    try {
      sdk = require("@oh-my-pi/pi-coding-agent");
    } catch (err) {
      debugLogger.debug("omp SDK not available — chat mode runs without it", { error: err.message });
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

  async prompt(text) {
    if (!this.session) return { text: "I'm not connected to a model yet. Configure one in Settings." };
    await this.session.prompt(text);
    const messages = this.session.messages || [];
    const last = messages[messages.length - 1];
    return { text: last?.content || "", toolCalls: null, error: null };
  }

  async destroy() {
    if (this.session && typeof this.session.dispose === "function") {
      this.session.dispose();
    }
    this.session = null;
  }
}

module.exports = { OmpBridge };
