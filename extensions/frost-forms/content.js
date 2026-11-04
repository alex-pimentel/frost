/**
 * Frost Forms — content script.
 *
 * Detects form fields by accessible name, asks the local Frost bridge for answers and
 * fills only what was matched. It never submits a form and never touches file,
 * password or hidden inputs.
 *
 * Runs in every frame (`all_frames: true`) because several ATS render the form inside
 * nested iframes. Each frame injects its own panel; the panel is scoped inside a Shadow
 * DOM so page CSS cannot break it.
 */

const STYLE = `
  :host { all: initial; }
  .panel {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    width: 340px; max-height: 70vh; overflow: auto;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 12px;
    color: #123a5c; background: #f7fbff; border: 1px solid #cfe4f7;
    border-radius: 12px; box-shadow: 0 12px 32px rgba(18, 58, 92, .18);
  }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e3f0fb; }
  header strong { font-size: 12px; }
  header .spacer { flex: 1; }
  button { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid #c7dff3; background: #fff; padding: 5px 9px; color: #123a5c; }
  button.primary { background: #4a97d8; border-color: #4a97d8; color: #fff; }
  button:disabled { opacity: .55; cursor: default; }
  .body { padding: 10px 12px; display: grid; gap: 8px; }
  .row { display: grid; gap: 2px; padding: 6px 8px; border-radius: 8px; background: #fff; border: 1px solid #e3f0fb; }
  .row.review { border-color: #f3d3a2; background: #fffdf7; }
  .label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value { color: #3d6d94; word-break: break-word; }
  .meta { color: #7ba0bf; font-size: 11px; }
  .status { color: #7ba0bf; }
  .status.error { color: #b4453a; }
  textarea { width: 100%; min-height: 56px; font: inherit; border-radius: 8px; border: 1px solid #c7dff3; padding: 6px; resize: vertical; }
`;

const SKIP_TYPES = new Set(["file", "password", "hidden", "submit", "button", "image", "reset"]);

function accessibleName(element) {
  const id = element.getAttribute("id");
  if (id) {
    const explicit = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((token) => element.ownerDocument.getElementById(token)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const wrapping = element.closest("label");
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

  const placeholder = element.getAttribute("placeholder");
  if (placeholder?.trim()) return placeholder.trim();

  return element.getAttribute("name") || element.getAttribute("id") || "";
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectFields() {
  const nodes = Array.from(document.querySelectorAll("input, textarea, select"));
  return nodes
    .filter((element) => {
      if (element.disabled || element.readOnly) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      const type = (element.getAttribute("type") || element.tagName).toLowerCase();
      if (SKIP_TYPES.has(type)) return false;
      return isVisible(element);
    })
    .map((element, index) => ({
      index,
      element,
      type: (element.getAttribute("type") || element.tagName).toLowerCase(),
      label: accessibleName(element),
      options:
        element.tagName === "SELECT"
          ? Array.from(element.options).map((option) => option.value)
          : undefined,
    }));
}

/** React and friends ignore a plain `element.value = x`; they need the native setter. */
function setNativeValue(element, value) {
  const prototype =
    element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fillField(element, value) {
  element.focus();
  if (element.tagName === "SELECT") {
    const match = Array.from(element.options).find(
      (option) => option.value === value || option.textContent.trim() === value
    );
    if (!match) return false;
    element.value = match.value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  setNativeValue(element, value);
  return true;
}

function createPanel() {
  const host = document.createElement("div");
  host.style.all = "initial";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `
    <header>
      <strong>Frost</strong>
      <span class="spacer"></span>
      <button data-action="close" title="Fechar">×</button>
    </header>
    <div class="body">
      <div class="status" data-role="status">Pronto.</div>
      <div style="display:flex; gap:6px;">
        <button class="primary" data-action="match">Buscar respostas</button>
        <button data-action="fill">Preencher</button>
      </div>
      <div data-role="results" style="display:grid; gap:6px;"></div>
    </div>
  `;

  shadow.append(style, panel);
  document.documentElement.appendChild(host);
  return { host, shadow, panel };
}

(async function main() {
  if (window.__frostFormsInjected) return;
  window.__frostFormsInjected = true;

  const { host, panel } = createPanel();
  const status = panel.querySelector('[data-role="status"]');
  const results = panel.querySelector('[data-role="results"]');
  const buttons = panel.querySelectorAll("button");

  let fields = [];
  let matches = [];

  const setStatus = (text, isError = false) => {
    status.textContent = text;
    status.className = `status${isError ? " error" : ""}`;
  };

  const send = (message) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response ?? { ok: false, error: "sem resposta" });
      });
    });

  const render = () => {
    results.textContent = "";
    matches.forEach((match) => {
      const row = document.createElement("div");
      row.className = `row${match.needsReview ? " review" : ""}`;

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = match.label || "(sem rótulo)";

      const value = document.createElement("div");
      value.className = "value";
      value.textContent = match.answer ?? (match.needsReview ? "revisar" : "");

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${match.reason} · ${(match.confidence * 100).toFixed(0)}%`;

      row.append(label, value, meta);
      results.appendChild(row);
    });
  };

  const handleMatch = async () => {
    setStatus("Consultando…");
    fields = collectFields();
    if (fields.length === 0) {
      setStatus("Nenhum campo detectado nesta página.", true);
      matches = [];
      render();
      return;
    }

    const response = await send({
      type: "match",
      fields: fields.map(({ label, type, options }) => ({ label, type, options })),
    });

    if (!response.ok) {
      setStatus(response.error, true);
      return;
    }

    matches = response.data?.data ?? [];
    render();
    const stats = response.data?.stats;
    setStatus(
      stats
        ? `${stats.filled} de ${stats.total} campos com resposta · ${stats.needsReview} para revisar`
        : `${matches.length} campos`
    );
  };

  const handleFill = () => {
    if (matches.length === 0) {
      setStatus("Busque as respostas primeiro.", true);
      return;
    }

    let filled = 0;
    for (const match of matches) {
      if (!match.answer) continue;
      const field = fields[match.index];
      if (!field?.element) continue;
      if (fillField(field.element, match.answer)) filled += 1;
    }

    setStatus(`${filled} campos preenchidos. Revise antes de enviar.`);
  };

  panel.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "close") host.remove();
    if (action === "match") handleMatch();
    if (action === "fill") handleFill();
  });

  buttons.forEach((button) => button.addEventListener("mouseup", (event) => event.stopPropagation()));

  setStatus("Clique em “Buscar respostas”.", false);
})();
