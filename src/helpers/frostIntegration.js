const { ipcMain } = require("electron");
const debugLogger = require("./debugLogger");

class FrostIntegration {
  constructor() {
    this.initialized = false;
    this.mode = "dictation";
    this.ompBridge = null;
    this.orchestrator = null;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      const { OmpBridge } = require("../main/ompBridge.cjs");
      this.ompBridge = new OmpBridge();

      await this.ompBridge.initialize();

      this.orchestrator = {
        mode: this.mode,
        setMode(mode) {
          this.mode = mode;
        },
        async processVoiceInput(text) {
          if (this.mode === "dictation") return text;
          if (!this.ompBridge) return text;
          const response = await this.ompBridge.prompt(text);
          return response.text;
        },
        async destroy() {
          if (this.ompBridge) await this.ompBridge.destroy();
        },
      };

      this.orchestrator.ompBridge = this.ompBridge;

      this.registerIpcHandlers();
      this.initialized = true;
      debugLogger.debug("Frost integration initialized", { mode: this.mode });
    } catch (err) {
      debugLogger.debug("Frost integration init error (non-fatal)", { error: err.message });
    }
  }

  registerIpcHandlers() {
    ipcMain.handle("frost:setMode", (_event, mode) => {
      if (mode !== "dictation" && mode !== "chat") return;
      this.mode = mode;
      if (this.orchestrator) this.orchestrator.setMode(mode);
    });

    ipcMain.handle("frost:getMode", () => this.mode);

    ipcMain.handle("frost:chat", async (_event, text) => {
      if (!this.orchestrator) return "Frost is not initialized yet.";
      try {
        const response = await this.orchestrator.processVoiceInput(text);
        return response;
      } catch (err) {
        debugLogger.error("Frost chat error", { error: err.message });
        return `Error: ${err.message}`;
      }
    });
  }

  async destroy() {
    if (this.orchestrator) {
      await this.orchestrator.destroy();
    }
    this.initialized = false;
  }
}

module.exports = { FrostIntegration };
