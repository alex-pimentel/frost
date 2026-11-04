const { ipcMain, app } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const debugLogger = require("./debugLogger");
const { FrostOrchestrator } = require("../main/orchestrator/frostOrchestrator");
const { loadAnswerBank, saveAnswerBank } = require("../main/orchestrator/answerBankStore");

const SETTINGS_FILE = "frost-settings.json";
const ANSWER_BANK_FILE = "frost-answers.json";
const VALID_MODES = new Set(["dictation", "chat", "code"]);

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function getAnswerBankPath() {
  return path.join(app.getPath("userData"), ANSWER_BANK_FILE);
}

function defaultSettings() {
  return { providerUrl: "http://localhost:1234/v1", apiKey: "", modelId: "" };
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(p, "utf-8")) };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  const p = getSettingsPath();
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf-8");
}

class FrostIntegration {
  constructor() {
    this.initialized = false;
    this.mode = "dictation";
    this.ompBridge = null;
    this.orchestrator = null;
    this.answerBank = null;
    this.settings = null;
    this.lastTurn = null;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      this.settings = loadSettings();
      this.answerBank = loadAnswerBank(getAnswerBankPath());

      const { OmpBridge } = require("../main/ompBridge.cjs");
      this.ompBridge = new OmpBridge(this.settings);
      await this.ompBridge.initialize();

      this.orchestrator = new FrostOrchestrator({
        bridge: this.ompBridge,
        answerBank: this.answerBank,
        logger: debugLogger,
        mode: this.mode,
        persona: this.settings.persona,
      });

      this.registerIpcHandlers();
      this.initialized = true;
      debugLogger.debug("Frost integration initialized", {
        mode: this.mode,
        answerBankEntries: this.answerBank.size,
        settings: { providerUrl: this.settings.providerUrl, modelId: this.settings.modelId },
      });
    } catch (err) {
      debugLogger.debug("Frost integration init error (non-fatal)", { error: err.message });
    }
  }

  registerIpcHandlers() {
    ipcMain.handle("frost:setMode", (_event, mode) => {
      if (!VALID_MODES.has(mode)) return;
      this.mode = mode;
      if (this.orchestrator) this.orchestrator.setMode(mode);
    });

    ipcMain.handle("frost:getMode", () => this.mode);

    ipcMain.handle("frost:chat", async (_event, text) => {
      if (!this.orchestrator) return "Frost is not initialized yet.";
      try {
        const result = await this.orchestrator.process(text);
        this.lastTurn = {
          text: result.text,
          source: result.source,
          decision: result.decision,
          knowledgeBlocks: result.knowledgeBlocks ?? [],
        };
        return result.text;
      } catch (err) {
        debugLogger.debug("Frost chat error", { error: err.message });
        return `Error: ${err.message}`;
      }
    });

    // Exposes the decision that produced the last answer (intent, confidence,
    // whether tools were allowed). Used by the chat UI and for debugging.
    ipcMain.handle("frost:getLastTurn", () => this.lastTurn);

    ipcMain.handle("frost:answers:list", () => this.answerBank?.toJSON() ?? { entries: [] });

    ipcMain.handle("frost:answers:upsert", (_event, entry) => {
      if (!this.answerBank) return { success: false, error: "Answer bank not initialized" };
      try {
        const saved = this.answerBank.add(entry);
        saveAnswerBank(getAnswerBankPath(), this.answerBank);
        return { success: true, entry: saved };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("frost:answers:delete", (_event, id) => {
      if (!this.answerBank) return { success: false, error: "Answer bank not initialized" };
      const removed = this.answerBank.remove(id);
      if (removed) saveAnswerBank(getAnswerBankPath(), this.answerBank);
      return { success: removed };
    });

    ipcMain.handle("frost:getSettings", () => {
      return this.settings || loadSettings();
    });

    ipcMain.handle("frost:saveSettings", async (_event, settings) => {
      this.settings = { ...this.settings, ...settings };
      saveSettings(this.settings);
      if (this.ompBridge) {
        await this.ompBridge.updateSettings(this.settings);
        await this.ompBridge.initialize();
      }
      debugLogger.debug("Frost settings updated", { settings: this.settings });
      return { success: true };
    });

    ipcMain.handle("frost:listModels", async (_event, providerUrl, apiKey) => {
      const url = providerUrl || this.settings?.providerUrl || "http://localhost:1234/v1";
      const key = apiKey || this.settings?.apiKey || "";
      return new Promise((resolve) => {
        const u = new URL(`${url.replace(/\/+$/, "")}/models`);
        const options = {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: "GET",
          headers: { "Content-Type": "application/json" },
          timeout: 5000,
        };
        if (key) options.headers["Authorization"] = `Bearer ${key}`;
        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              const models = (parsed.data || []).map((m) => ({ id: m.id, name: m.id }));
              resolve(models);
            } catch {
              resolve([]);
            }
          });
        });
        req.on("error", () => resolve([]));
        req.end();
      });
    });
  }

  async destroy() {
    if (this.orchestrator) {
      await this.orchestrator.destroy?.();
    }
    if (this.ompBridge) {
      await this.ompBridge.destroy();
    }
    this.orchestrator = null;
    this.answerBank = null;
    this.initialized = false;
  }
}

module.exports = { FrostIntegration };
