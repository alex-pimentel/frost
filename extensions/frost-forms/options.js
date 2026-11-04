const KEY = "frostBridge";
const statusEl = document.getElementById("status");
const portEl = document.getElementById("port");
const tokenEl = document.getElementById("token");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

async function load() {
  const stored = await chrome.storage.local.get(KEY);
  const config = stored[KEY] ?? {};
  portEl.value = config.port ?? 8200;
  tokenEl.value = config.token ?? "";
}

async function save() {
  const port = Number(portEl.value);
  const token = tokenEl.value.trim();
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    setStatus("Porta inválida.", "error");
    return;
  }
  await chrome.storage.local.set({ [KEY]: { port, token } });
  setStatus("Configuração salva.", "ok");
}

async function test() {
  setStatus("Testando…");
  const port = Number(portEl.value);
  const token = tokenEl.value.trim();
  if (!token) {
    setStatus("Informe o token.", "error");
    return;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus(payload?.error?.message ?? `HTTP ${response.status}`, "error");
      return;
    }
    setStatus(`Conectado (bridge v${payload?.data?.version ?? "?"}).`, "ok");
  } catch (error) {
    setStatus(`Sem conexão: ${error.message}`, "error");
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("test").addEventListener("click", test);
load();
