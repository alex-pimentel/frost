const statusEl = document.getElementById("status");

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

(async () => {
  const stored = await chrome.storage.local.get("frostBridge");
  const config = stored.frostBridge;
  if (!config?.token) {
    statusEl.textContent = "Token não configurado.";
    statusEl.className = "status error";
    return;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/v1/health`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    statusEl.textContent = response.ok ? "Frost conectado." : `Falha: HTTP ${response.status}`;
    statusEl.className = `status ${response.ok ? "ok" : "error"}`;
  } catch (error) {
    statusEl.textContent = "Frost não está respondendo.";
    statusEl.className = "status error";
  }
})();
