async function startPtyTerminal(terminal) {
  if (!terminal || !findTerminal(terminal.id)) return;
  const size = initialPtyStartSize(terminal.id);
  try {
    const response = await fetch("/desktop/pty-terminals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: terminal.id, title: terminal.title, agent: terminal.agent, model: terminal.model, reasoningEffort: terminal.effort, permissionMode: terminal.permissionMode, tokenMode: terminal.tokenMode, projectId: terminal.projectId, workspaceMode: terminal.workspaceMode, allowSharedFallback: terminal.workspaceMode === "worktree" && terminal.allowSharedFallback !== false, cols: size.cols, rows: size.rows }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.session) throw new Error(result.error || "Terminal failed to start.");
    if (Array.isArray(result.agents)) updateTerminalAgents(result.agents);
    const hasInitialPrompt = Boolean(String(terminal.initialPrompt || "").trim());
    Object.assign(terminal, ptySessionPatch(result.session), { pending: hasInitialPrompt });
    if (terminal.workspaceNotice && !terminal.notice) terminal.notice = terminal.workspaceNotice;
    try {
      await submitInitialPtyPrompt(terminal);
    } catch (error) {
      terminal.notice = error instanceof Error ? error.message : "The terminal task could not be delivered.";
    }
    terminal.pending = false;
    if (terminal.ptyStatus !== "unavailable") connectPtyTerminal(terminal);
  } catch (error) {
    terminal.pending = false;
    terminal.ptyStatus = "exited";
    terminal.notice = error instanceof Error ? error.message : "Terminal failed to start.";
  } finally {
    delete terminal.ptyStartQueued;
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

async function submitInitialPtyPrompt(terminal) {
  const prompt = terminalTaskInputPrompt(terminal, terminal?.initialPrompt);
  if (!prompt || terminal.ptyStatus === "unavailable" || terminal.ptyStatus === "exited") return;
  const input = `\x1b[200~${prompt.replace(/\r?\n/g, "\r")}\x1b[201~\r`;
  const response = await fetch(`/desktop/pty-terminals/${encodeURIComponent(terminal.id)}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The terminal task could not be delivered.");
  delete terminal.initialPrompt;
}

function terminalTaskInputPrompt(terminal, value) {
  const prompt = String(value || "").trim();
  if (!prompt || normalizeTerminalAgent(terminal?.agent) !== "vibyra") return prompt;
  return prompt
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

let ptyCollectionSyncTimer = null;
let terminalXtermResizeFrame = 0;
let terminalXtermResizeObserver = null;
const terminalXtermObservedNodes = new WeakSet();
const terminalXtermPendingResizeNodes = new Set();

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
  socket.onopen = () => {
    clearTimeout(terminalPtyReconnectTimers[terminal.id]);
    delete terminalPtyReconnectTimers[terminal.id];
    terminalPtyReconnectAttempts[terminal.id] = 0;
    schedulePtyCollectionSync(250);
  };
  socket.onmessage = (event) => handlePtySocketMessage(terminal.id, event.data);
  socket.onclose = () => {
    if (terminalPtySockets[terminal.id] !== socket) return;
    delete terminalPtySockets[terminal.id];
    schedulePtyCollectionSync();
    schedulePtyReconnect(terminal.id);
  };
  socket.onerror = () => socket.close();
}

function schedulePtyCollectionSync(delay = 750) {
  clearTimeout(ptyCollectionSyncTimer);
  ptyCollectionSyncTimer = setTimeout(() => {
    ptyCollectionSyncTimer = null;
    void syncPtyTerminals();
  }, delay);
}

function schedulePtyReconnect(id) {
  const terminal = findTerminal(id);
  if (!terminal || terminal.ptyStatus === "exited" || terminal.ptyStatus === "unavailable" || terminalPtyReconnectTimers[id]) return;
  const attempt = (terminalPtyReconnectAttempts[id] || 0) + 1;
  terminalPtyReconnectAttempts[id] = attempt;
  terminalPtyReconnectTimers[id] = setTimeout(() => {
    delete terminalPtyReconnectTimers[id];
    const current = findTerminal(id);
    if (current) connectPtyTerminal(current);
  }, Math.min(10000, 500 * (2 ** Math.min(attempt - 1, 5))));
}

function handlePtySocketMessage(id, raw) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  let payload = null;
  try { payload = JSON.parse(raw); } catch { return; }
  let shouldRender = false;
  if (payload.type === "session" && payload.session) {
    const localOutput = String(terminal.output || "");
    const patch = ptySessionPatch(payload.session);
    patch.output = mergePtySnapshotOutput(localOutput, patch.output);
    Object.assign(terminal, patch);
    mountVisibleXterms();
    syncPtyXtermOutput(terminal);
    shouldRender = true;
  } else if (payload.type === "output") {
    appendPtyOutput(terminal, payload.data || "");
  }
  if (payload.type === "exit") {
    appendPtyOutput(terminal, payload.data || "");
    if (typeof terminalTaskActivityClear === "function") terminalTaskActivityClear(terminal);
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
  if (typeof bindTerminalCompanionLaunchers === "function") bindTerminalCompanionLaunchers(document);
  if (typeof bindTerminalWorkspaceIndicators === "function") bindTerminalWorkspaceIndicators(document);
  bindPtyClick(document.getElementById("open-terminal-new"), () => {
    newTerminalMenuOpen = !newTerminalMenuOpen;
    if (newTerminalMenuOpen) modelScrollTops.new = 0;
    else terminalProjectMenuTarget = "";
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
    (typeof requestCloseTerminal === "function" ? requestCloseTerminal : closeTerminal)(button.dataset.terminalClose);
  }));
  document.querySelectorAll("[data-terminal-settings]").forEach((button) => bindPtyClick(button, (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTerminalSettings(button.dataset.terminalSettings);
  }));
  if (typeof bindTerminalProjectControls === "function") bindTerminalProjectControls(document);
  if (typeof bindTerminalTokenControls === "function") bindTerminalTokenControls(document);
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
  if (!window.Terminal) {
    node.addEventListener("keydown", (event) => {
      if (window.Terminal) return;
      handlePtyKeydown(event, node.dataset.terminalInput);
    });
    node.addEventListener("paste", (event) => {
      if (window.Terminal) return;
      event.preventDefault();
      sendPtyInput(node.dataset.terminalInput, event.clipboardData?.getData("text") || "");
    });
  }
  node.addEventListener("pointerdown", () => focusPtyTerminal(node.dataset.terminalInput));
  node.addEventListener("click", () => focusPtyTerminal(node.dataset.terminalInput));
}

function bindPtyClick(node, handler) {
  if (!node || node.dataset.terminalClickBound || node.dataset.ptyClickBound) return;
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
  else fetch(`/desktop/pty-terminals/${encodeURIComponent(id)}/input`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) })
    .then((response) => { if (!response.ok) setPtyInputNotice(id, "Terminal is not connected. Reconnect or open a new terminal to continue."); })
    .catch(() => setPtyInputNotice(id, "Terminal input could not be delivered."));
}

function setPtyInputNotice(id, message) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  terminal.pending = false;
  terminal.notice = message;
  terminal.updatedAt = Date.now();
  saveTerminals();
  if (activePage === "terminals") {
    renderTopbar();
    if (!refreshPtyTerminalsDom()) render();
  }
}

function appendPtyOutput(terminal, data) {
  terminal.output = String((terminal.output || "") + String(data || "")).slice(-60000);
  terminal.ptyStatus = terminal.ptyStatus === "starting" ? "running" : terminal.ptyStatus;
  terminal.pending = false;
  terminal.updatedAt = Date.now();
  if (typeof terminalTaskActivityOutput === "function") terminalTaskActivityOutput(terminal, data);
  const xterm = terminalXterms[terminal.id];
  if (xterm?.element?.isConnected) {
    xterm.write(data);
    terminalXtermSnapshots[terminal.id] = terminal.output;
  }
}

function mountVisibleXterms() {
  ensureTerminalXtermResizeObserver();
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
        screenReaderMode: false,
        fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.18,
        rows: 34,
        cols: 120,
        scrollback: 5000,
        theme: terminalXtermTheme(node)
      });
      terminalXterms[id] = xterm;
      xterm.onData((data) => {
        if (terminalXterms[id] !== xterm || !xterm.element?.isConnected) return;
        if (!terminalXtermReplayWrites[id]) sendPtyInput(id, data);
      });
    } else {
      xterm.options.theme = terminalXtermTheme(node);
      xterm.options.screenReaderMode = false;
    }
    if (!xterm.element || xterm.element.parentElement !== node) {
      node.replaceChildren();
      xterm.open(node);
      xterm.clear();
      if (terminal.output) writePtySnapshot(id, xterm, terminal.output);
      terminalXtermSnapshots[id] = terminal.output || "";
    }
    observeTerminalXtermNode(node);
    fitPtyXterm(id, node, terminal);
  });
}

function mergePtySnapshotOutput(localOutput, remoteOutput) {
  const local = String(localOutput || "");
  const remote = String(remoteOutput || "");
  if (!local) return remote;
  if (!remote || local.endsWith(remote)) return local;
  if (remote.startsWith(local)) return remote;
  return remote;
}

function syncPtyXtermOutput(terminal) {
  const xterm = terminalXterms[terminal.id];
  if (!xterm || terminalXtermSnapshots[terminal.id] === terminal.output) return;
  try {
    xterm.reset();
    if (terminal.output) writePtySnapshot(terminal.id, xterm, terminal.output);
    terminalXtermSnapshots[terminal.id] = terminal.output || "";
  } catch {}
}

function writePtySnapshot(id, xterm, output) {
  terminalXtermReplayWrites[id] = (terminalXtermReplayWrites[id] || 0) + 1;
  xterm.write(output, () => {
    terminalXtermReplayWrites[id] = Math.max(0, (terminalXtermReplayWrites[id] || 1) - 1);
    if (!terminalXtermReplayWrites[id]) delete terminalXtermReplayWrites[id];
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
  const rect = node.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 48) return;
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

function ensureTerminalXtermResizeObserver() {
  if (terminalXtermResizeObserver || typeof ResizeObserver !== "function") return;
  terminalXtermResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) terminalXtermPendingResizeNodes.add(entry.target);
    if (terminalXtermResizeFrame) return;
    const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
    terminalXtermResizeFrame = schedule(() => {
      terminalXtermResizeFrame = 0;
      const pending = Array.from(terminalXtermPendingResizeNodes);
      terminalXtermPendingResizeNodes.clear();
      for (const node of pending) {
        const id = node.dataset.terminalXterm || "";
        if (id) fitPtyXterm(id, node);
      }
    });
  });
}

function observeTerminalXtermNode(node) {
  if (!terminalXtermResizeObserver || terminalXtermObservedNodes.has(node)) return;
  terminalXtermObservedNodes.add(node);
  terminalXtermResizeObserver.observe(node);
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
  if (typeof refreshTerminalWorkspaceIndicator === "function" && !refreshTerminalWorkspaceIndicator(article, terminal)) return false;
  let notice = article.querySelector(".terminal-notice");
  article.classList.toggle("has-notice", Boolean(terminal.notice));
  if (terminal.notice && !notice) {
    article.querySelector(".terminal-focus-head, .terminal-tile-head")?.insertAdjacentHTML("afterend", terminalNotice(terminal));
    notice = article.querySelector(".terminal-notice");
    if (!notice) return false;
  }
  if (!terminal.notice && notice) notice.remove();
  if (terminal.notice && notice) {
    const noticeText = notice.querySelector("p");
    const checkpoint = typeof terminalWorkspaceCheckpointLink === "function"
      ? terminalWorkspaceCheckpointLink(terminal)
      : "";
    const noticeHtml = `${escapeHtml(terminal.notice)}${checkpoint}`;
    if (noticeText && noticeText.innerHTML !== noticeHtml) noticeText.innerHTML = noticeHtml;
    if (typeof bindTerminalWorkspaceCheckpointLinks === "function") bindTerminalWorkspaceCheckpointLinks(notice);
  }
  if (typeof terminalTaskActivityRefresh === "function") terminalTaskActivityRefresh(terminal);
  const unavailable = terminal.ptyStatus === "unavailable";
  if (unavailable !== Boolean(article.querySelector(".terminal-pty-unavailable"))) return false;
  article.querySelectorAll(".terminal-status").forEach((status) => {
    const next = terminalStatusState(terminal);
    status.className = `terminal-status ${next.key}`;
    status.setAttribute("aria-label", next.label);
    status.setAttribute("title", next.label);
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
    (typeof requestCloseTerminal === "function" ? requestCloseTerminal : closeTerminal)(button.dataset.terminalClose);
  }));
  if (typeof bindTerminalTokenControls === "function") bindTerminalTokenControls(document);
  if (typeof bindTerminalRenameControls === "function") bindTerminalRenameControls(document);
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
    selectionBackground: css("--terminal-accent-border", "rgba(109, 59, 255, 0.4)"),
    black: css("--terminal-ansi-black", "#24242d"),
    red: css("--terminal-ansi-red", "#ff6b81"),
    green: css("--terminal-ansi-green", "#55d98b"),
    yellow: css("--terminal-ansi-yellow", "#e7c65f"),
    blue: css("--terminal-ansi-blue", "#6aa8ff"),
    magenta: css("--terminal-ansi-magenta", "#bd8cff"),
    cyan: css("--terminal-ansi-cyan", "#69d6c7"),
    white: css("--terminal-ansi-white", "#ddd8e8"),
    brightBlack: css("--terminal-ansi-bright-black", "#7a7a8c"),
    brightRed: css("--terminal-ansi-bright-red", "#ff9aad"),
    brightGreen: css("--terminal-ansi-bright-green", "#86e7aa"),
    brightYellow: css("--terminal-ansi-bright-yellow", "#f3db83"),
    brightBlue: css("--terminal-ansi-bright-blue", "#9bc2ff"),
    brightMagenta: css("--terminal-ansi-bright-magenta", "#d5b4ff"),
    brightCyan: css("--terminal-ansi-bright-cyan", "#9be7dc"),
    brightWhite: css("--terminal-ansi-bright-white", "#ffffff")
  };
}

function applyTerminalXtermThemes() {
  Object.values(terminalXterms).forEach((xterm) => {
    const node = xterm?.element?.parentElement;
    if (!node?.isConnected) return;
    try {
      xterm.options.theme = terminalXtermTheme(node);
      xterm.refresh?.(0, Math.max(0, (xterm.rows || 1) - 1));
    } catch {}
  });
}

let terminalThemeObserver = null;
function ensureTerminalThemeObserver() {
  if (terminalThemeObserver || !document.body || typeof MutationObserver !== "function") return;
  terminalThemeObserver = new MutationObserver(() => {
    const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
    schedule(applyTerminalXtermThemes);
  });
  terminalThemeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-desktop-theme"] });
}

ensureTerminalThemeObserver();

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
    effort: normalizeTerminalEffort(session.reasoningEffort),
    permissionMode: normalizeTerminalPermissionMode(session.permissionMode),
    tokenMode: String(session.tokenMode || "vibyra") === "provider" ? "provider" : "vibyra",
    projectId: String(session.projectId || ""),
    workspaceMode: normalizeTerminalWorkspaceMode(session.workspaceMode),
    branchName: String(session.branchName || ""),
    workspacePath: String(session.workspacePath || ""),
    workspaceNotice: String(session.workspaceNotice || ""),
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
window.addEventListener("pagehide", flushPtyTerminals);
window.addEventListener("beforeunload", flushPtyTerminals);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPtyTerminals(); });

function flushPtyTerminals() {
  try { saveTerminals(); } catch {}
}

async function syncPtyTerminals() {
  try {
    const response = await fetch("/desktop/pty-terminals");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Desktop terminal service did not respond.");
    if (Array.isArray(result.agents)) updateTerminalAgents(result.agents);
    const sessions = Array.isArray(result.sessions) ? result.sessions : [];
    reconcilePtyTerminalSessions(sessions);
    ensureTerminal();
    saveTerminals();
  } catch (error) {
    markPtySyncError(error);
  } finally {
    finishPtySyncRender();
  }
}

function reconcilePtyTerminalSessions(sessions) {
  const localById = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  const serverById = new Map(
    sessions.filter((session) => session?.id).map((session) => [String(session.id), session])
  );
  const pendingLocalIds = terminals
    .filter((terminal) =>
      terminal.ptyStartQueued
      || (
        (terminal.pending || terminal.ptyStatus === "starting")
        && Date.now() - Number(terminal.updatedAt || 0) < 15_000
      )
    )
    .map((terminal) => terminal.id)
    .filter((id) => !serverById.has(id));
  const orderedIds = [
    ...terminals.map((terminal) => terminal.id).filter((id) => serverById.has(id)),
    ...pendingLocalIds,
    ...Array.from(serverById.keys()).filter((id) => !localById.has(id))
  ];
  const next = [];

  for (const id of orderedIds.slice(0, maxTerminals)) {
    const session = serverById.get(id);
    let terminal = localById.get(id);
    if (!session && terminal?.pending) {
      next.push(terminal);
      continue;
    }
    if (!terminal) {
      terminal = normalizeTerminal({
        id,
        title: session.title || "Recovered terminal",
        agent: session.agent || "vibyra",
        model: session.model || "auto",
        effort: session.reasoningEffort || "medium",
        permissionMode: session.permissionMode || "standard",
        projectId: session.projectId || "",
        ptyRendererVersion: terminalPtyRendererVersion,
        updatedAt: Date.parse(session.updatedAt || "") || Date.now()
      });
    }
    if (!terminal) continue;
    Object.assign(terminal, ptySessionPatch(session), {
      title: String(session.title || terminal.title || "Terminal"),
      pending: false,
      notice: null
    });
    next.push(terminal);
  }

  const nextIds = new Set(next.map((terminal) => terminal.id));
  terminals.filter((terminal) => !nextIds.has(terminal.id)).forEach(removeLocalPtyTerminal);
  terminals = next;
  for (const terminal of terminals) {
    if (terminal.ptyStatus !== "exited" && terminal.ptyStatus !== "unavailable") {
      connectPtyTerminal(terminal);
    }
  }
}

function removeLocalPtyTerminal(terminal) {
  const id = terminal?.id;
  if (!id) return;
  if (typeof terminalTaskActivityClear === "function") terminalTaskActivityClear(terminal);
  clearTimeout(terminalPtyReconnectTimers[id]);
  terminalPtySockets[id]?.close?.();
  terminalXterms[id]?.dispose?.();
  delete terminalPtySockets[id];
  delete terminalPtyReconnectTimers[id];
  delete terminalPtyReconnectAttempts[id];
  delete terminalXterms[id];
  delete terminalXtermSizes[id];
  delete terminalXtermSnapshots[id];
  delete terminalXtermReplayWrites[id];
}

function markPtySyncError(error) {
  const message = error instanceof Error ? error.message : "Desktop terminal sync failed.";
  for (const terminal of terminals) {
    if (terminal.ptyStatus === "exited" || terminal.ptyStatus === "unavailable") continue;
    terminal.pending = false;
    terminal.notice = "Could not reconnect terminals. " + message;
    terminal.updatedAt = Date.now();
  }
  saveTerminals();
}

function finishPtySyncRender() {
  if (activePage !== "terminals") return;
  renderTopbar();
  if (!refreshPtyTerminalsDom()) {
    forceTerminalRender = true;
    render();
  }
}
