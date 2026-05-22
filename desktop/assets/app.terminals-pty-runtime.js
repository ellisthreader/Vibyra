async function startPtyTerminal(terminal) {
  if (!terminal || !findTerminal(terminal.id)) return;
  const size = initialPtyStartSize(terminal.id);
  try {
    const response = await fetch("/desktop/pty-terminals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: terminal.id, title: terminal.title, agent: terminal.agent, model: terminal.model, reasoningEffort: terminal.effort, projectId: terminal.projectId, cols: size.cols, rows: size.rows }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.session) throw new Error(result.error || "Terminal failed to start.");
    if (Array.isArray(result.agents)) updateTerminalAgents(result.agents);
    Object.assign(terminal, ptySessionPatch(result.session), { pending: false });
    if (terminal.ptyStatus !== "unavailable") connectPtyTerminal(terminal);
  } catch (error) {
    terminal.pending = false;
    terminal.ptyStatus = "exited";
    terminal.notice = error instanceof Error ? error.message : "Terminal failed to start.";
  } finally {
    terminal.updatedAt = Date.now();
    saveTerminals();
    if (activePage === "terminals") {
      renderTopbar();
      if (!refreshPtyTerminalsDom()) {
        forceTerminalRender = true;
        render();
      }
    }
  }
}

function queueStartPtyTerminal(terminal) {
  if (!terminal || terminal.ptyStartQueued) return;
  terminal.ptyStartQueued = true;
  const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  schedule(() => schedule(() => {
    if (!findTerminal(terminal.id)) return;
    mountVisibleXterms();
    void startPtyTerminal(terminal);
  }));
}

function connectPtyTerminal(terminal) {
  const existing = terminalPtySockets[terminal.id];
  if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/desktop/pty-terminals/${encodeURIComponent(terminal.id)}/socket`);
  terminalPtySockets[terminal.id] = socket;
  socket.onmessage = (event) => handlePtySocketMessage(terminal.id, event.data);
  socket.onclose = () => { if (terminalPtySockets[terminal.id] === socket) delete terminalPtySockets[terminal.id]; };
}

function handlePtySocketMessage(id, raw) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  let payload = null;
  try { payload = JSON.parse(raw); } catch { return; }
  let shouldRender = false;
  if (payload.type === "session" && payload.session) {
    Object.assign(terminal, ptySessionPatch(payload.session));
    mountVisibleXterms();
    shouldRender = true;
  } else if (payload.type === "output") {
    appendPtyOutput(terminal, payload.data || "");
  }
  if (payload.type === "exit") {
    appendPtyOutput(terminal, payload.data || "");
    terminal.ptyStatus = "exited";
    terminal.pending = false;
    terminal.exitCode = payload.code ?? null;
    shouldRender = true;
  }
  if (shouldRender) schedulePtyRender(terminal.id);
  else schedulePtySave(terminal.id);
}

const previousRenderTerminalsPage = renderTerminalsPage;
renderTerminalsPage = function renderPtyTerminalsPage() {
  const signature = ptyTerminalDomSignature();
  if (!forceTerminalRender && ptyRenderedSignature === signature && refreshPtyTerminalsDom()) {
    bindPtyTopbarControls();
    return;
  }
  if (patchPtyTerminalStructure()) {
    forceTerminalRender = false;
    ptyRenderedSignature = ptyTerminalDomSignature();
    bindPtyTopbarControls();
    return;
  }
  previousRenderTerminalsPage();
  ptyRenderedSignature = ptyTerminalDomSignature();
};


const previousSetActiveTerminal = setActiveTerminal;
setActiveTerminal = function setActivePtyTerminal(id) {
  if (!findTerminal(id)) return previousSetActiveTerminal(id);
  activeTerminalId = id;
  settingsTerminalId = "";
  saveTerminals();
  if (activePage === "terminals" && refreshPtyTerminalsDom()) {
    renderTopbar();
    bindPtyTopbarControls();
    focusPtyTerminal(id);
    return;
  }
  forceTerminalRender = true;
  render();
};

const previousToggleTerminalSettings = toggleTerminalSettings;
toggleTerminalSettings = function togglePtyTerminalSettings(id) {
  const terminal = findTerminal(id);
  if (!terminal) return previousToggleTerminalSettings(id);
  const nextSettingsTerminalId = settingsTerminalId === id ? "" : id;
  settingsTerminalId = nextSettingsTerminalId;
  newTerminalMenuOpen = false;
  saveTerminals();
  if (activePage === "terminals" && refreshPtyTerminalSettingsMenus()) {
    renderTopbar();
    bindPtyTopbarControls();
    return;
  }
  forceTerminalRender = true;
  render();
};

function bindPtyTopbarControls() {
  bindPtyClick(document.getElementById("open-terminal-new"), () => {
    newTerminalMenuOpen = !newTerminalMenuOpen;
    if (newTerminalMenuOpen) modelScrollTops.new = 0;
    settingsTerminalId = "";
    render();
  });
  bindPtyClick(document.getElementById("toggle-terminal-layout"), () => {
    terminalLayout = terminalLayout === "grid" ? "focus" : "grid";
    saveTerminals();
    render();
  });
  document.querySelectorAll("[data-terminal-focus]").forEach((button) => bindPtyClick(button, () => setActiveTerminal(button.dataset.terminalFocus)));
  document.querySelectorAll("[data-terminal-close]").forEach((button) => bindPtyClick(button, (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTerminal(button.dataset.terminalClose);
  }));
  document.querySelectorAll("[data-terminal-settings]").forEach((button) => bindPtyClick(button, (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTerminalSettings(button.dataset.terminalSettings);
  }));
  document.querySelectorAll("[data-terminal-model-search]").forEach((input) => {
    if (input.dataset.ptyModelSearchBound) return;
    input.dataset.ptyModelSearchBound = "1";
    input.addEventListener("input", () => updateTerminalModelSearch(input));
  });
  document.querySelectorAll(".terminal-model-scroll").forEach((scroller) => {
    if (scroller.dataset.ptyModelScrollBound) return;
    scroller.dataset.ptyModelScrollBound = "1";
    bindTerminalModelScroll(scroller);
  });
  document.querySelectorAll("[data-terminal-new-model]").forEach((button) => bindPtyClick(button, () => createTerminalFromModel(button.dataset.terminalNewModel || "auto")));
  document.querySelectorAll("[data-terminal-new-agent]").forEach((button) => bindPtyClick(button, () => createTerminal(button.dataset.terminalNewAgent || setupAgent, true)));
  document.querySelectorAll("[data-terminal-input]").forEach((node) => {
    bindPtyInput(node);
  });
  document.querySelectorAll("[data-terminal]").forEach((node) => {
    if (node.dataset.ptyFocusBound) return;
    node.dataset.ptyFocusBound = "1";
    node.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.("button, select, option, .terminal-menu")) return;
      focusPtyTerminal(node.dataset.terminal);
    });
  });
  document.querySelectorAll("[data-terminal-drag]").forEach((tab) => {
    if (tab.dataset.ptyDragBound) return;
    tab.dataset.ptyDragBound = "1";
    bindTerminalDrag(tab);
  });
}

function bindPtyInput(node) {
  if (!node || node.dataset.ptyInputBound) return;
  node.dataset.ptyInputBound = "1";
  node.addEventListener("keydown", (event) => handlePtyKeydown(event, node.dataset.terminalInput));
  node.addEventListener("paste", (event) => {
    event.preventDefault();
    sendPtyInput(node.dataset.terminalInput, event.clipboardData?.getData("text") || "");
  });
  node.addEventListener("pointerdown", () => focusPtyTerminal(node.dataset.terminalInput));
  node.addEventListener("click", () => focusPtyTerminal(node.dataset.terminalInput));
}

function bindPtyClick(node, handler) {
  if (!node || node.dataset.ptyClickBound) return;
  node.dataset.ptyClickBound = "1";
  node.addEventListener("click", handler);
}

function handlePtyKeydown(event, id) {
  if (!id) return;
  const map = { Enter: "\r", Backspace: "\x7f", Tab: "\t", Escape: "\x1b", ArrowUp: "\x1b[A", ArrowDown: "\x1b[B", ArrowRight: "\x1b[C", ArrowLeft: "\x1b[D" };
  let input = "";
  if (event.ctrlKey && event.key.toLowerCase() === "c") input = "\x03";
  else if (event.ctrlKey && event.key.toLowerCase() === "d") input = "\x04";
  else if (map[event.key]) input = map[event.key];
  else if (!event.ctrlKey && !event.metaKey && event.key.length === 1) input = event.key;
  if (!input) return;
  event.preventDefault();
  sendPtyInput(id, input);
}

function sendPtyInput(id, input) {
  const socket = terminalPtySockets[id];
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data: input }));
  else fetch(`/desktop/pty-terminals/${encodeURIComponent(id)}/input`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) }).catch(() => {});
}

function appendPtyOutput(terminal, data) {
  terminal.output = String((terminal.output || "") + String(data || "")).slice(-60000);
  terminal.ptyStatus = terminal.ptyStatus === "starting" ? "running" : terminal.ptyStatus;
  terminal.pending = false;
  terminal.updatedAt = Date.now();
  const xterm = terminalXterms[terminal.id];
  if (xterm) xterm.write(data);
}

function mountVisibleXterms() {
  document.querySelectorAll("[data-terminal-xterm]").forEach((node) => {
    const id = node.dataset.terminalXterm || "";
    const terminal = findTerminal(id);
    if (!terminal || terminal.ptyStatus === "unavailable") return;
    if (node.closest(".terminal-focus-hidden")) return;
    if (!window.Terminal) {
      node.textContent = plainTerminalOutput(terminal.output || "Terminal renderer failed to load.");
      return;
    }
    let xterm = terminalXterms[id];
    if (!xterm || xterm.element?.isConnected === false) {
      xterm?.dispose?.();
      xterm = new window.Terminal({
        allowProposedApi: false,
        convertEol: false,
        cursorBlink: true,
        disableStdin: false,
        fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.18,
        rows: 34,
        cols: 120,
        scrollback: 5000,
        theme: terminalXtermTheme(node)
      });
      terminalXterms[id] = xterm;
      xterm.onData((data) => sendPtyInput(id, data));
    } else {
      xterm.options.theme = terminalXtermTheme(node);
    }
    if (!xterm.element || xterm.element.parentElement !== node) {
      node.replaceChildren();
      xterm.open(node);
      xterm.clear();
      if (terminal.output) xterm.write(terminal.output);
    }
    fitPtyXterm(id, node, terminal);
  });
}

function focusPtyTerminal(id) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  if (activeTerminalId !== id) {
    activeTerminalId = id;
    saveTerminals();
    renderTopbar();
  }
  const xterm = terminalXterms[id];
  if (xterm) {
    xterm.focus?.();
    return;
  }
  nodes.content.querySelector(`[data-terminal-input="${CSS.escape(id)}"]`)?.focus?.();
}

function fitPtyXterm(id, node, terminal = findTerminal(id)) {
  const xterm = terminalXterms[id];
  if (!xterm || !node?.isConnected) return;
  const size = measuredPtySize(node);
  const previous = terminalXtermSizes[id] || {};
  if (previous.cols === size.cols && previous.rows === size.rows && xterm.cols === size.cols && xterm.rows === size.rows) return;
  terminalXtermSizes[id] = size;
  try { xterm.resize(size.cols, size.rows); } catch {}
  if (terminal) {
    terminal.cols = size.cols;
    terminal.rows = size.rows;
  }
  sendPtyResize(id, size.cols, size.rows);
}

function measuredPtySize(node) {
  const rect = node.getBoundingClientRect();
  const styles = getComputedStyle(node);
  const fontSize = Number.parseFloat(styles.fontSize) || 13;
  const paddingX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
  const paddingY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  const cols = Math.max(18, Math.min(180, Math.floor(Math.max(0, rect.width - paddingX - 8) / (fontSize * 0.62))));
  const rows = Math.max(4, Math.min(80, Math.floor(Math.max(0, rect.height - paddingY - 8) / (fontSize * 1.22))));
  return { cols, rows };
}

function initialPtyStartSize(id) {
  const node = nodes.content.querySelector(`[data-terminal-xterm="${CSS.escape(id)}"], [data-terminal-input="${CSS.escape(id)}"]`);
  if (node?.isConnected) return measuredPtySize(node);
  const terminal = findTerminal(id);
  return {
    cols: Number.isFinite(Number(terminal?.cols)) ? Number(terminal.cols) : 100,
    rows: Number.isFinite(Number(terminal?.rows)) ? Number(terminal.rows) : 30
  };
}

function sendPtyResize(id, cols, rows) {
  const payload = { type: "resize", cols, rows };
  const socket = terminalPtySockets[id];
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return;
  }
  fetch(`/desktop/pty-terminals/${encodeURIComponent(id)}/resize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cols, rows })
  }).catch(() => {});
}

function ptyTerminalDomSignature() {
  if (!terminals.length) return "setup";
  const visibleIds = terminals.map((terminal) => terminal.id);
  const structural = terminals.map((terminal) => [
    terminal.id,
    terminal.ptyStatus === "unavailable" ? "unavailable" : "xterm",
    terminal.notice ? "notice" : ""
  ].join(":"));
  return JSON.stringify({
    layout: terminalLayout,
    visibleIds,
    structural
  });
}
function patchPtyTerminalStructure() {
  if (!terminals.length) return false;
  const page = nodes.content.querySelector(".terminal-page");
  const stage = page?.querySelector(".terminal-stage");
  if (!page || !stage) return false;
  const grid = terminalLayout === "grid";
  if (page.classList.contains("grid-mode") !== grid) return false;
  syncPtyTerminalGrid(page, grid);
  const expectedIds = new Set(terminals.map((terminal) => terminal.id));
  stage.querySelectorAll("[data-terminal]").forEach((article) => {
    if (!expectedIds.has(article.dataset.terminal || "")) article.remove();
  });
  for (const terminal of terminals) {
    let article = stage.querySelector(`[data-terminal="${CSS.escape(terminal.id)}"]`);
    if (!article) {
      stage.insertAdjacentHTML("beforeend", grid ? terminalTile(terminal) : activeTerminalView(terminal));
      article = stage.querySelector(`[data-terminal="${CSS.escape(terminal.id)}"]`);
    }
    if (!article) return false;
    stage.appendChild(article);
  }
  if (!refreshPtyTerminalsDom()) return false;
  return true;
}

function syncPtyTerminalGrid(page, grid) {
  page.classList.toggle("grid-mode", grid);
  page.classList.remove("terminal-grid-many");
  page.removeAttribute("style");
  if (!grid || typeof terminalGridMeta !== "function") return;
  const gridMeta = terminalGridMeta(terminals.length);
  if (gridMeta.className) page.classList.add(gridMeta.className);
  page.style.setProperty("--terminal-grid-cols", gridMeta.cols);
  page.style.setProperty("--terminal-grid-rows", gridMeta.rows);
  page.style.setProperty("--terminal-grid-cols-narrow", gridMeta.narrowCols);
  page.style.setProperty("--terminal-grid-rows-narrow", gridMeta.narrowRows);
}

function refreshPtyTerminalsDom() {
  if (!terminals.length) return false;
  const page = nodes.content.querySelector(".terminal-page");
  if (!page) return false;
  const visible = terminals;
  let stable = true;
  for (const terminal of visible) stable = refreshPtyTerminalDom(terminal) && stable;
  if (stable) stable = refreshPtyTerminalSettingsMenus() && stable;
  if (stable) mountVisibleXterms();
  return stable;
}

function refreshPtyTerminalDom(terminal) {
  const article = nodes.content.querySelector(`[data-terminal="${CSS.escape(terminal.id)}"]`);
  if (!article) return false;
  const notice = article.querySelector(".terminal-notice");
  article.classList.toggle("has-notice", Boolean(terminal.notice));
  if (terminal.notice && !notice) return false;
  if (!terminal.notice && notice) notice.remove();
  if (terminal.notice && notice) {
    const noticeText = notice.querySelector("p");
    if (noticeText && noticeText.textContent !== String(terminal.notice)) noticeText.textContent = terminal.notice;
  }
  const unavailable = terminal.ptyStatus === "unavailable";
  if (unavailable !== Boolean(article.querySelector(".terminal-pty-unavailable"))) return false;
  article.querySelectorAll(".terminal-status").forEach((status) => {
    status.classList.toggle("running", terminal.pending || terminal.ptyStatus === "starting" || terminal.ptyStatus === "running");
  });
  const active = terminal.id === activeTerminalId;
  article.classList.toggle("active", active);
  article.classList.toggle("terminal-focus-hidden", terminalLayout !== "grid" && !active);
  if (terminalLayout !== "grid") article.setAttribute("aria-hidden", active ? "false" : "true");
  const title = article.querySelector(".terminal-name strong, .terminal-tile-head strong");
  if (title && title.textContent !== terminal.title) title.textContent = terminal.title;
  if (unavailable) {
    const pre = article.querySelector(".terminal-pty-lines pre");
    if (pre && pre.textContent !== String(terminal.output || "")) pre.textContent = terminal.output || "";
  }
  return true;
}

function refreshPtyTerminalSettingsMenus() {
  if (!nodes.content.querySelector(".terminal-page")) return false;
  let stable = true;
  document.querySelectorAll(".terminal-settings-menu").forEach((menu) => menu.remove());
  for (const terminal of terminals) {
    const article = nodes.content.querySelector(`[data-terminal="${CSS.escape(terminal.id)}"]`);
    if (!article) {
      stable = false;
      continue;
    }
    const button = article.querySelector(`[data-terminal-settings="${CSS.escape(terminal.id)}"]`);
    if (!button) {
      stable = false;
      continue;
    }
    if (terminal.id === settingsTerminalId) {
      button.insertAdjacentHTML("afterend", settingsMenu(terminal));
    }
  }
  document.querySelectorAll("[data-terminal-close]").forEach((button) => bindPtyClick(button, (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTerminal(button.dataset.terminalClose);
  }));
  return stable;
}

function terminalXtermTheme(node) {
  const scope = node.closest(".terminal-focus, .terminal-tile, .terminal-page") || document.body;
  const styles = getComputedStyle(scope);
  const css = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: css("--terminal-bg", "#08080c"),
    foreground: css("--terminal-copy", "#f7f4ff"),
    cursor: css("--terminal-text", "#f7f4ff"),
    selectionBackground: css("--terminal-accent-border", "rgba(109, 59, 255, 0.4)")
  };
}

function schedulePtyRender(id) {
  clearTimeout(terminalPtyRenderTimers[id]);
  terminalPtyRenderTimers[id] = setTimeout(() => {
    saveTerminals();
    if (activePage === "terminals") {
      renderTopbar();
      if (!refreshPtyTerminalsDom()) render();
    }
  }, 120);
}

function schedulePtySave(id) {
  clearTimeout(terminalPtyRenderTimers[id]);
  terminalPtyRenderTimers[id] = setTimeout(() => {
    saveTerminals();
  }, 300);
}

function plainTerminalOutput(value) {
  return String(value || "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[\@-~]/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/\x1b[78=>]/g, "");
}

function ptySessionPatch(session) {
  return {
    agent: String(session.agent || ""),
    agentStatus: session.agentStatus || null,
    model: String(session.model || ""),
    cwd: String(session.cwd || ""),
    output: String(session.output || "").slice(-60000),
    ptyStatus: String(session.status || "idle"),
    exitCode: session.exitCode ?? null
  };
}

function agentButton(agent) {
  const unavailable = agent.available === false;
  return `<button class="${setupAgent === agent.key ? "active" : ""} ${unavailable ? "unavailable" : ""}" type="button" data-terminal-agent="${escapeAttribute(agent.key)}" title="${escapeAttribute(unavailable ? agent.installHint || `${agent.label} is not installed` : agent.detail)}"><strong>${escapeHtml(agent.label)}</strong><small>${escapeHtml(unavailable ? "Not installed" : agent.detail)}</small></button>`;
}

function terminalAgent(terminal) {
  return terminalAgents.find((agent) => agent.key === normalizeTerminalAgent(terminal?.agent)) || terminalAgents[0];
}

function terminalAgentKeyOrSetup(value) {
  const next = String(value || "").trim().toLowerCase();
  return terminalAgents.some((agent) => agent.key === next) ? next : setupAgent;
}

function normalizeTerminalAgent(value) {
  const next = String(value || "").trim().toLowerCase();
  return terminalAgents.some((agent) => agent.key === next) ? next : "vibyra";
}

function agentDefaultModel(agent) {
  const provider = terminalAgent({ agent }).profile;
  return modelChoices().find((model) => model.provider === provider)?.key || modelChoices()[0]?.key || "auto";
}

function updateTerminalAgents(statuses) {
  for (const status of statuses) {
    const agent = terminalAgents.find((item) => item.key === status.key);
    if (agent) Object.assign(agent, { available: Boolean(status.available), installHint: status.installHint || agent.detail, commandPath: status.commandPath || "" });
  }
}

window.addEventListener("load", () => setTimeout(syncPtyTerminals, 0));

async function syncPtyTerminals() {
  try {
    const response = await fetch("/desktop/pty-terminals");
    const result = await response.json().catch(() => ({}));
    if (Array.isArray(result.agents)) updateTerminalAgents(result.agents);
    const sessions = Array.isArray(result.sessions) ? result.sessions : [];
    for (const terminal of terminals) {
      const session = sessions.find((item) => item.id === terminal.id);
      if (!session) {
        if (terminal.ptyStatus !== "exited" && terminal.ptyStatus !== "unavailable") {
          terminal.pending = false;
          terminal.ptyStatus = "exited";
          terminal.updatedAt = Date.now();
          terminalPtySockets[terminal.id]?.close?.();
          delete terminalPtySockets[terminal.id];
        }
        continue;
      }
      Object.assign(terminal, ptySessionPatch(session), { pending: false });
      if (terminal.ptyStatus !== "exited" && terminal.ptyStatus !== "unavailable") connectPtyTerminal(terminal);
    }
    saveTerminals();
    if (activePage === "terminals") {
      renderTopbar();
      if (!refreshPtyTerminalsDom()) {
        forceTerminalRender = true;
        render();
      }
    }
  } catch {}
}
