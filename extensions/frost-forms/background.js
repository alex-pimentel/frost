/**
 * Frost Forms — service worker.
 *
 * The only place that talks to the local bridge, because extension origins are
 * allowed by host_permissions while page origins are not. Messages are deliberately
 * narrow: the content script can ask for matches and save answers, nothing else.
 */

const CONFIG_KEY = "frostBridge";

async function getConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  return stored[CONFIG_KEY] ?? { port: 8200, token: "" };
}

async function bridgeFetch(path, init = {}) {
  const { port, token } = await getConfig();
  if (!token) {
    throw new Error("Token não configurado. Abra as opções da extensão (Frost → token).");
  }

  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Resposta inválida do Frost");
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
  }
  return payload;
}

const handlers = {
  health: () => bridgeFetch("/v1/health"),
  match: ({ fields }) =>
    bridgeFetch("/v1/forms/match", { method: "POST", body: JSON.stringify({ fields }) }),
  listAnswers: () => bridgeFetch("/v1/forms/answers"),
  saveAnswer: ({ entry }) =>
    bridgeFetch("/v1/forms/answers", { method: "POST", body: JSON.stringify(entry) }),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: `mensagem desconhecida: ${message?.type}` });
    return false;
  }

  handler(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));

  return true; // resposta assíncrona
});
