const { ipcMain, app } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const debugLogger = require("./debugLogger");

const SETTINGS_FILE = "frost-settings.json";

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) return { providerUrl: "http://localhost:1234/v1", apiKey: "", modelId: "" };
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { providerUrl: "http://localhost:1234/v1", apiKey: "", modelId: "" };
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
    this.settings = null;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      this.settings = loadSettings();

      const { OmpBridge } = require("../main/ompBridge.cjs");
      this.ompBridge = new OmpBridge(this.settings);
      await this.ompBridge.initialize();

      this.orchestrator = {
        mode: this.mode,
        ompBridge: this.ompBridge,
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

      this.registerIpcHandlers();
      this.initialized = true;
      debugLogger.debug("Frost integration initialized", { mode: this.mode, settings: { providerUrl: this.settings.providerUrl, modelId: this.settings.modelId } });
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
        debugLogger.debug("Frost chat error", { error: err.message });
        return `Error: ${err.message}`;
      }
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
          res.on("data", (chunk) => { data += chunk; });
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
      await this.orchestrator.destroy();
    }
    this.initialized = false;
  }
}

module.exports = { FrostIntegration };
