async function startPtyTerminal(terminal) {
  if (!terminal || !findTerminal(terminal.id)) return;
  const size = backendPtySize(terminal, initialPtyStartSize(terminal.id));
  const initialPrompt = normalizeInitialTerminalPrompt(terminal.initialPrompt);
  let teamFields = {};
  try {
    teamFields = typeof terminalTeamRequestFields === "function"
      ? terminalTeamRequestFields(terminal, terminals)
      : {};
  } catch (error) {
    terminal.pending = false;
    terminal.ptyStatus = "exited";
    terminal.providerState = "exited";
    terminal.notice = error instanceof Error ? error.message : "This Team record is incomplete.";
    saveTerminals();
    if (activePage === "terminals") render();
    return;
  }
  const assignmentId = initialPrompt
    ? (terminal.initialAssignmentId
      || (typeof terminalTaskActivityStart === "function"
        ? terminalTaskActivityStart(terminal, initialPrompt)
        : `assignment-${terminal.id}-${Date.now()}`))
    : "";
  if (assignmentId) terminal.initialAssignmentId = assignmentId;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("/desktop/pty-terminals", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: terminal.id, title: terminal.title, agent: terminal.agent, model: terminal.model, reasoningEffort: terminal.effort, permissionMode: terminal.permissionMode, tokenMode: terminal.tokenMode, projectId: terminal.projectId, workspaceMode: terminal.workspaceMode, allowSharedFallback: terminal.workspaceMode === "worktree" && terminal.allowSharedFallback !== false, ...teamFields, cols: size.cols, rows: size.rows, ...(initialPrompt ? { initialPrompt, assignmentId } : {}) }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.session) throw new Error(result.error || "Terminal failed to start.");
    if (Array.isArray(result.agents)) updateTerminalAgents(result.agents);
    Object.assign(terminal, ptySessionPatch(result.session), { pending: Boolean(initialPrompt) });
    if (terminal.workspaceNotice && !terminal.notice) terminal.notice = terminal.workspaceNotice;
    if (terminal.ptyStatus !== "unavailable") connectPtyTerminal(terminal);
    try {
      if (result.assignment) {
        acceptInitialPtyAssignment(terminal, result.assignment, assignmentId);
        delete terminal.initialPrompt;
        delete terminal.initialAssignmentId;
      } else {
        await submitInitialPtyPrompt(terminal);
      }
    } catch (error) {
      terminal.notice = error instanceof Error ? error.message : "The terminal task could not be delivered.";
    }
    terminal.pending = false;
  } catch (error) {
    if (assignmentId && typeof terminalTaskActivityFailed === "function") {
      terminalTaskActivityFailed(terminal, assignmentId);
    }
    terminal.pending = false;
    terminal.ptyStatus = "exited";
    terminal.providerState = "exited";
    terminal.providerBusy = false;
    terminal.notice = error?.name === "AbortError"
      ? "Terminal startup timed out. Try opening it again."
      : error instanceof Error ? error.message : "Terminal failed to start.";
  } finally {
    clearTimeout(timeout);
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

function acceptInitialPtyAssignment(terminal, assignment, assignmentId) {
  const provider = normalizedPtyProviderState({
    providerState: assignment.providerState,
    status: terminal.ptyStatus
  });
  terminal.providerState = provider.state;
  terminal.providerReady = provider.ready;
  terminal.providerBusy = provider.busy;
  terminal.notice = null;
  if (typeof terminalTaskActivityAccepted === "function") {
    terminalTaskActivityAccepted(terminal, {
      assignmentId: assignment.assignmentId || assignmentId,
      acceptedAt: assignment.acceptedAt
    });
  }
}

async function submitInitialPtyPrompt(terminal) {
  const prompt = normalizeInitialTerminalPrompt(terminal?.initialPrompt);
  if (!prompt || terminal.ptyStatus === "unavailable" || terminal.ptyStatus === "exited") return;
  const assignmentId = terminal.initialAssignmentId
    || (typeof terminalTaskActivityStart === "function"
      ? terminalTaskActivityStart(terminal, prompt)
      : `assignment-${terminal.id}-${Date.now()}`);
  terminal.initialAssignmentId = assignmentId;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`/desktop/pty-terminals/${encodeURIComponent(terminal.id)}/assign`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId, prompt })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The terminal task could not be delivered.");
    const assignment = result.assignment || result;
    const provider = normalizedPtyProviderState({
      providerState: assignment.providerState,
      status: terminal.ptyStatus
    });
    terminal.providerState = provider.state;
    terminal.providerReady = provider.ready;
    terminal.providerBusy = provider.busy;
    terminal.notice = null;
    if (typeof terminalTaskActivityAccepted === "function") {
      terminalTaskActivityAccepted(terminal, {
        assignmentId: assignment.assignmentId || assignmentId,
        acceptedAt: assignment.acceptedAt
      });
    }
  } catch (error) {
    if (typeof terminalTaskActivityFailed === "function") {
      terminalTaskActivityFailed(terminal, assignmentId);
    }
    throw error?.name === "AbortError"
      ? new Error("The terminal did not accept the task in time. Try sending it again.")
      : error;
  } finally {
    clearTimeout(timeout);
    delete terminal.initialPrompt;
    delete terminal.initialAssignmentId;
  }
}

function terminalTaskInputPrompt(terminal, value) {
  return String(value || "").trim();
}

let ptyCollectionSyncTimer = null;
let ptyCollectionSyncPromise = null;
let terminalXtermResizeFrame = 0;
let preservingPtyXtermElements = false;
let terminalXtermResizeObserver = null;
const terminalXtermObservedNodes = new WeakSet();
const terminalXtermPendingResizeNodes = new Set();
const terminalXtermSettledFits = new Map();
const terminalXtermLayoutSettleDelay = 120;
const terminalXtermScheduledFits = new Map();
const terminalXtermThemeKeys = {};
let terminalPtyRenderBatchTimer = 0;
const terminalPtyRenderDirtyIds = new Set();

function queueStartPtyTerminal(terminal) {
  if (!terminal || terminal.ptyStartQueued) return;
  terminal.ptyStartQueued = true;
  const launch = () => {
    if (!findTerminal(terminal.id)) return;
    try {
      mountVisibleXterms(new Set([terminal.id]));
    } catch (error) {
      console.error("Could not mount xterm before terminal launch.", error);
    }
    void startPtyTerminal(terminal);
  };
  if (typeof queueMicrotask === "function") queueMicrotask(launch);
  else Promise.resolve().then(launch);
  const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  schedule(() => schedule(() => {
    if (!findTerminal(terminal.id)) return;
    try {
      mountVisibleXterms(new Set([terminal.id]));
    } catch (error) {
      console.error("Could not mount xterm before terminal launch.", error);
    }
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
    mountVisibleXterms(new Set([terminal.id]));
    schedulePtyXtermFit(terminal.id, { forceBackend: true });
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
    const localOutput = payload.replaceOutput ? "" : String(terminal.output || "");
    const patch = ptySessionPatch(payload.session);
    patch.output = mergePtySnapshotOutput(localOutput, patch.output);
    Object.assign(terminal, patch);
    mountVisibleXterms(new Set([terminal.id]));
    syncPtyXtermOutput(terminal);
    shouldRender = true;
  } else if (payload.type === "output") {
    shouldRender = appendPtyOutput(terminal, payload.data || "", {
      assignmentId: payload.assignmentId || payload.assignment?.id || "",
      emittedAt: payload.emittedAt || payload.timestamp || ""
    });
  }
  if (payload.type === "exit") {
    appendPtyOutput(terminal, payload.data || "");
    if (typeof terminalTaskActivityClear === "function") terminalTaskActivityClear(terminal);
    terminal.ptyStatus = "exited";
    terminal.pending = false;
    terminal.exitCode = payload.code ?? null;
    if (typeof terminalPtyTranscriptExit === "function") {
      terminalPtyTranscriptExit(terminal, terminal.exitCode);
    }
    shouldRender = true;
  }
  if (shouldRender) schedulePtyRender(terminal.id);
  else schedulePtySave(terminal.id);
}

const previousRenderTerminalsPage = renderTerminalsPage;
renderTerminalsPage = function renderPtyTerminalsPage() {
  if (terminalBatchSetupOpen) {
    previousRenderTerminalsPage();
    ptyRenderedSignature = ptyTerminalDomSignature();
    return;
  }
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
  const preservedXterms = preserveConnectedXtermElements();
  preservingPtyXtermElements = true;
  try {
    previousRenderTerminalsPage();
  } finally {
    preservingPtyXtermElements = false;
  }
  restoreConnectedXtermElements(preservedXterms);
  mountVisibleXterms();
  ptyRenderedSignature = ptyTerminalDomSignature();
};

function preserveConnectedXtermElements() {
  const preserved = new Map();
  for (const [id, xterm] of Object.entries(terminalXterms)) {
    if (!xterm?.element?.isConnected) continue;
    preserved.set(id, xterm.element);
    xterm.element.remove();
  }
  return preserved;
}

function restoreConnectedXtermElements(preserved) {
  for (const [id, element] of preserved) {
    const host = document.querySelector(`[data-terminal-xterm="${CSS.escape(id)}"]`);
    if (!host || !findTerminal(id)) continue;
    host.replaceChildren(element);
    observeTerminalXtermNode(host);
    schedulePtyXtermFit(id);
  }
}


const previousSetActiveTerminal = setActiveTerminal;
setActiveTerminal = function setActivePtyTerminal(id) {
  if (!findTerminal(id)) return previousSetActiveTerminal(id);
  activeTerminalId = id;
  if (typeof activateTerminalProjectForTerminal === "function") activateTerminalProjectForTerminal(findTerminal(id));
  if (fullscreenTerminalId) {
    fullscreenTerminalId = id;
    localStorage.setItem(terminalFullscreenKey, id);
  }
  if (typeof rememberActiveTerminalForProject === "function") rememberActiveTerminalForProject(findTerminal(id));
  settingsTerminalId = "";
  saveTerminals();
  if (activePage === "terminals" && refreshPtyTerminalsDom()) {
    renderTopbar();
    renderNav();
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
  if (typeof bindTerminalProjectGroupControls === "function") bindTerminalProjectGroupControls(document.body);
  bindPtyClick(document.getElementById("open-terminal-new"), () => {
    newTerminalMenuOpen = !newTerminalMenuOpen;
    terminalToolbarMenuOpen = false;
    if (newTerminalMenuOpen) modelScrollTops.new = 0;
    else terminalProjectMenuTarget = "";
    settingsTerminalId = "";
    render();
  });
  bindPtyClick(document.getElementById("open-terminal-toolbar"), (event) => {
    event.stopPropagation();
    terminalToolbarMenuOpen = !terminalToolbarMenuOpen;
    newTerminalMenuOpen = false;
    terminalProjectMenuTarget = "";
    settingsTerminalId = "";
    render();
  });
  bindPtyClick(document.getElementById("toggle-terminal-layout"), () => {
    terminalToolbarMenuOpen = false;
    terminalLayout = terminalLayout === "grid" ? "focus" : "grid";
    saveTerminals();
    render();
  });
  document.querySelectorAll("[data-terminal-close-all]").forEach((button) => {
    bindPtyClick(button, () => void requestCloseAllPtyTerminals());
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
  if (typeof bindTerminalDrag === "function") {
    document.querySelectorAll("[data-terminal-drag]").forEach((item) => bindTerminalDrag(item));
  }
  if (typeof bindTerminalFullscreenControls === "function") bindTerminalFullscreenControls(document);
  if (typeof bindTerminalProjectControls === "function") bindTerminalProjectControls(document);
  if (typeof bindTerminalProjectGroupControls === "function") bindTerminalProjectGroupControls(nodes.content);
  if (typeof bindTerminalTokenControls === "function") bindTerminalTokenControls(document);
  if (typeof bindTerminalRuntimeControls === "function") bindTerminalRuntimeControls(document);
  if (typeof bindTerminalProjectWorkspaceControls === "function") bindTerminalProjectWorkspaceControls(document);
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
  if (typeof bindTerminalPathDrop === "function") bindTerminalPathDrop(node);
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

function sendPtyInput(id, input, options = {}) {
  const prompts = options.logPrompt === false ? [] : terminalPtyCompletedPrompts(id, input);
  queueTerminalPtyInput(id, prompts, () => sendPtyInputNow(id, input));
}

function sendPtyInputNow(id, input) {
  const terminal = findTerminal(id);
  if (terminal && /[\r\n]/.test(input)) markTerminalProviderBusy(terminal);
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

function appendPtyOutput(terminal, data, meta = {}) {
  const previousState = terminal.providerState;
  terminal.output = String((terminal.output || "") + String(data || "")).slice(-60000);
  terminal.ptyStatus = terminal.ptyStatus === "starting" ? "running" : terminal.ptyStatus;
  terminal.pending = false;
  applyTerminalProviderActivity(terminal, data);
  terminal.updatedAt = Date.now();
  if (typeof terminalPtyTranscriptOutput === "function") {
    terminalPtyTranscriptOutput(terminal, data, previousState);
  }
  if (typeof terminalTaskActivityOutput === "function") terminalTaskActivityOutput(terminal, data, meta);
  const xterm = terminalXterms[terminal.id];
  if (xterm?.element?.isConnected) {
    xterm.write(terminalDisplayOutput(terminal, data), () => {
      positionPtyViewport(terminal, xterm);
    });
    terminalXtermSnapshots[terminal.id] = terminal.output;
  }
  return previousState !== terminal.providerState;
}

function markTerminalProviderBusy(terminal) {
  if (!terminal || ["fallback-shell", "exited", "unavailable"].includes(terminal.providerState)) return;
  const changed = terminal.providerState !== "busy";
  terminal.providerState = "busy";
  terminal.providerReady = true;
  terminal.providerBusy = true;
  terminal.providerBusyObserved = false;
  terminal.updatedAt = Date.now();
  if (changed && activePage === "terminals") refreshPtyTerminalsDom();
}

function applyTerminalProviderActivity(terminal, data) {
  const signal = terminalProviderActivitySignal(terminal?.agent, data);
  if (signal === "busy") {
    markTerminalProviderBusy(terminal);
    terminal.providerBusyObserved = true;
    return;
  }
  if (signal !== "ready") return;
  if (terminal.providerState === "starting") {
    terminal.providerState = "ready";
    terminal.providerReady = true;
    terminal.providerBusy = false;
    terminal.providerBusyObserved = false;
    return;
  }
  if (terminal.providerState !== "busy") return;
  if (normalizeTerminalAgent(terminal.agent) === "codex" && !terminal.providerBusyObserved) return;
  terminal.providerState = "ready";
  terminal.providerReady = true;
  terminal.providerBusy = false;
  terminal.providerBusyObserved = false;
}

function terminalProviderActivitySignal(agent, data) {
  const value = String(data || "");
  if (!value) return "";
  if (normalizeTerminalAgent(agent) === "codex") {
    const titles = Array.from(value.matchAll(/\x1b\]0;([^\x07]*)\x07/g));
    const title = titles.at(-1)?.[1] || "";
    if (title) return /^[\u2800-\u28ff]\s/.test(title) ? "busy" : "ready";
    return [
      "Explain this codebase",
      "Summarize recent commits",
      "Implement {feature}",
      "Find and fix a bug in @filename",
      "Write tests for @filename",
      "Improve documentation in @filename",
      "Run /review on my current changes"
    ].some((placeholder) => value.includes(placeholder)) ? "ready" : "";
  }
  if (normalizeTerminalAgent(agent) === "vibyra") {
    const plain = terminalPlainActivityOutput(value);
    if (/(?:^|[\r\n])(?:│\s*)?[❯›>](?:\s+auto)?\s*$/.test(plain)) return "ready";
  }
  const plain = terminalPlainActivityOutput(value);
  if (normalizeTerminalAgent(agent) === "claude" && (
    /Claude\s*Code\s*v?\d/i.test(plain) && /❯\s*(?:Try\b|$)/m.test(plain)
    || /(?:^|[\r\n])❯\s*$/m.test(plain)
  )) return "ready";
  if (normalizeTerminalAgent(agent) === "gemini" && (
    /Do you trust the files in this folder\?/i.test(plain)
    || /Type your message or @path\/to\/file/i.test(plain)
    || /(?:^|[\r\n])>\s*$/m.test(plain)
  )) return "ready";
  return "";
}

function terminalPlainActivityOutput(value) {
  return String(value)
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u00a0/g, " ");
}

function mountVisibleXterms(ids = null) {
  if (preservingPtyXtermElements) return;
  ensureTerminalXtermResizeObserver();
  const nodesToMount = ids
    ? Array.from(ids, (id) => document.querySelector(`[data-terminal-xterm="${CSS.escape(id)}"]`)).filter(Boolean)
    : Array.from(document.querySelectorAll("[data-terminal-xterm]"));
  nodesToMount.forEach((node) => {
    const id = node.dataset.terminalXterm || "";
    const terminal = findTerminal(id);
    if (!terminal || terminal.ptyStatus === "unavailable") return;
    if (!terminalXtermNodeIsVisible(node)) return;
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
        screenReaderMode: true,
        fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.18,
        rows: normalizedPtyDimension(terminal.rows, 30, 4, 240),
        cols: normalizedPtyDimension(terminal.cols, 100, 18, 180),
        scrollOnUserInput: true,
        scrollback: 5000,
        theme: terminalXtermTheme(node)
      });
      terminalXterms[id] = xterm;
      terminalXtermThemeKeys[id] = terminalXtermThemeKey(node);
      if (typeof attachTerminalEditorLinkProvider === "function") {
        attachTerminalEditorLinkProvider(id, xterm);
      }
      xterm.onData((data) => {
        if (terminalXterms[id] !== xterm || !xterm.element?.isConnected) return;
        if (!terminalXtermReplayWrites[id]) {
          xterm.scrollToBottom?.();
          sendPtyInput(id, data);
        }
      });
    } else {
      applyPtyXtermThemeIfChanged(id, xterm, node);
      xterm.options.screenReaderMode = true;
    }
    if (typeof attachTerminalEditorLinkProvider === "function") {
      attachTerminalEditorLinkProvider(id, xterm);
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
    schedulePtyXtermFit(id);
  });
}

function terminalXtermNodeIsVisible(node) {
  if (!node?.isConnected) return false;
  if (node.closest(".terminal-focus-hidden, .terminal-project-hidden, .terminal-fullscreen-hidden, .terminal-minimized, .terminal-maximized-hidden")) return false;
  const article = node.closest("[data-terminal]");
  if (article?.getAttribute("aria-hidden") === "true") return false;
  return true;
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
  xterm.write(terminalDisplayOutput(findTerminal(id), output), () => {
    terminalXtermReplayWrites[id] = Math.max(0, (terminalXtermReplayWrites[id] || 1) - 1);
    if (!terminalXtermReplayWrites[id]) delete terminalXtermReplayWrites[id];
    positionPtyViewport(findTerminal(id), xterm);
  });
}

function terminalDisplayOutput(_terminal, value) {
  return value;
}

function terminalAutoDeciding(terminal) {
  return Boolean(terminal?.autoDeciding);
}

function positionPtyViewport(terminal, xterm) {
  applyPtyBottomOverscan(terminal, xterm);
  if (terminalAutoDeciding(terminal)) {
    xterm.scrollToTop?.();
    return;
  }
  xterm.scrollToBottom?.();
}

function focusPtyTerminal(id) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  if (activeTerminalId !== id) {
    activeTerminalId = id;
    saveTerminals();
    renderTopbar();
    refreshPtyTerminalsDom();
  }
  const xterm = terminalXterms[id];
  if (xterm) {
    positionPtyViewport(terminal, xterm);
    xterm.focus?.();
    return;
  }
  nodes.content.querySelector(`[data-terminal-input="${CSS.escape(id)}"]`)?.focus?.();
}

function fitPtyXterm(id, node, terminal = findTerminal(id), options = {}) {
  const xterm = terminalXterms[id];
  if (!xterm || !node?.isConnected) return;
  if (!terminalXtermNodeIsVisible(node)) return;
  if (document.visibilityState === "hidden") return;
  const rect = node.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 48) return;
  const size = measuredPtySize(node, xterm);
  const backendSize = backendPtySize(terminal, size);
  const previous = terminalXtermSizes[id] || {};
  const backendMatches = Number(terminal?.cols) === backendSize.cols
    && Number(terminal?.rows) === backendSize.rows;
  const rendererMatches = previous.cols === size.cols
    && previous.rows === size.rows
    && previous.bottomInset === size.bottomInset
    && xterm.cols === size.cols
    && xterm.rows === backendSize.rows;
  terminalXtermSizes[id] = size;
  applyPtyBottomOverscan(terminal, xterm, size);
  if (!options.forceBackend && rendererMatches && backendMatches) return;
  if (xterm.cols !== backendSize.cols || xterm.rows !== backendSize.rows) {
    try { xterm.resize(backendSize.cols, backendSize.rows); } catch {}
    applyPtyBottomOverscan(terminal, xterm, size);
  }
  if (terminal) {
    terminal.cols = backendSize.cols;
    terminal.rows = backendSize.rows;
  }
  if (options.forceBackend || !backendMatches) {
    sendPtyResize(id, backendSize.cols, backendSize.rows);
  }
}

function schedulePtyXtermFit(id, options = {}) {
  if (!id) return;
  const pending = terminalXtermScheduledFits.get(id) || { timer: 0, forceBackend: false, frame: 0 };
  pending.forceBackend = pending.forceBackend || Boolean(options.forceBackend);
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => runScheduledPtyXtermFit(id), 180);
  if (pending.frame) {
    terminalXtermScheduledFits.set(id, pending);
    return;
  }
  const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  pending.frame = schedule(() => {
    const current = terminalXtermScheduledFits.get(id);
    if (current) current.frame = schedule(() => runScheduledPtyXtermFit(id));
  });
  terminalXtermScheduledFits.set(id, pending);
}

function runScheduledPtyXtermFit(id) {
  const pending = terminalXtermScheduledFits.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  terminalXtermScheduledFits.delete(id);
  const node = document.querySelector(`[data-terminal-xterm="${CSS.escape(id)}"]`);
  if (node?.isConnected) fitPtyXterm(id, node, findTerminal(id), { forceBackend: pending.forceBackend });
}

function scheduleSettledPtyXtermFit(id, options = {}) {
  if (!id) return;
  const pending = terminalXtermSettledFits.get(id) || { timer: 0, forceBackend: false };
  clearTimeout(pending.timer);
  pending.forceBackend = pending.forceBackend || Boolean(options.forceBackend);
  pending.timer = setTimeout(() => {
    terminalXtermSettledFits.delete(id);
    const node = document.querySelector(`[data-terminal-xterm="${CSS.escape(id)}"]`);
    if (!node?.isConnected) return;
    fitPtyXterm(id, node, findTerminal(id), { forceBackend: pending.forceBackend });
  }, terminalXtermLayoutSettleDelay);
  terminalXtermSettledFits.set(id, pending);
}

function cancelSettledPtyXtermFit(id) {
  cancelScheduledPtyXtermFit(id);
  const pending = terminalXtermSettledFits.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  terminalXtermSettledFits.delete(id);
}

function cancelScheduledPtyXtermFit(id) {
  const pending = terminalXtermScheduledFits.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  terminalXtermScheduledFits.delete(id);
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
        if (id) scheduleSettledPtyXtermFit(id);
      }
    });
  });
}

function observeTerminalXtermNode(node) {
  if (!terminalXtermResizeObserver || terminalXtermObservedNodes.has(node)) return;
  terminalXtermObservedNodes.add(node);
  terminalXtermResizeObserver.observe(node);
}

function measuredPtySize(node, xterm = null) {
  const rect = node.getBoundingClientRect();
  const styles = getComputedStyle(node);
  const fontSize = Number.parseFloat(styles.fontSize) || 13;
  const paddingX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
  const paddingY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  const cell = xterm?._core?._renderService?.dimensions?.css?.cell;
  const viewport = xterm?.element?.querySelector?.(".xterm-viewport");
  const cellWidth = Number(cell?.width) || fontSize * 0.62;
  const cellHeight = Number(cell?.height) || fontSize * 1.22;
  const availableWidth = viewport?.clientWidth || Math.max(0, rect.width - paddingX - 8);
  const visibleHeight = Math.max(0, rect.height - paddingY);
  const availableHeight = Math.min(viewport?.clientHeight || visibleHeight, visibleHeight);
  const cols = Math.max(18, Math.min(180, Math.floor(availableWidth / cellWidth)));
  const rows = Math.max(4, Math.min(80, Math.round(availableHeight / cellHeight)));
  const bottomInset = terminalPtyBottomInsetForGeometry(availableHeight, cellHeight, rows);
  return { cols, rows, bottomInset };
}

function initialPtyStartSize(id) {
  const node = nodes.content.querySelector(`[data-terminal-xterm="${CSS.escape(id)}"], [data-terminal-input="${CSS.escape(id)}"]`);
  if (node?.isConnected) return measuredPtySize(node, terminalXterms[id]);
  const terminal = findTerminal(id);
  return {
    cols: Number.isFinite(Number(terminal?.cols)) ? Number(terminal.cols) : 100,
    rows: rendererPtyRows(
      terminal,
      Number.isFinite(Number(terminal?.rows)) ? Number(terminal.rows) : 30
    )
  };
}

function backendPtySize(terminal, size) {
  return {
    cols: size.cols,
    rows: size.rows + terminalPtyBottomOverscanRows(terminal)
  };
}

function rendererPtyRows(terminal, backendRows) {
  return Math.max(4, backendRows - terminalPtyBottomOverscanRows(terminal));
}

function terminalPtyBottomInsetForGeometry(availableHeight, cellHeight, rows) {
  const fractionalOverflow = (rows * cellHeight) - availableHeight;
  const overflowInset = Math.ceil(Math.max(0, fractionalOverflow - 0.25));
  return overflowInset + 3;
}

function applyPtyBottomOverscan(terminal, xterm, measuredSize = null) {
  const element = xterm?.element;
  if (!element) return;
  if (terminalAutoDeciding(terminal)) {
    element.style.height = "";
    element.style.transform = "";
    return;
  }
  const rows = terminalPtyBottomOverscanRows(terminal);
  const cellHeight = Number(xterm?._core?._renderService?.dimensions?.css?.cell?.height) || 0;
  const extraHeight = rows * cellHeight;
  const inset = terminalPtyBottomInsetPixels(terminal, measuredSize);
  const totalHeight = extraHeight + inset;
  const overscanOffset = terminalPtyBottomRowsContainContent(xterm, rows) ? extraHeight : 0;
  const bottomAnchorOffset = terminalPtyBottomAnchorRows(terminal, xterm) * cellHeight;
  const offset = inset + overscanOffset - bottomAnchorOffset;
  element.style.height = totalHeight ? `calc(100% + ${totalHeight}px)` : "";
  element.style.transform = offset ? `translateY(${-offset}px)` : "";
}

function terminalPtyBottomRowsContainContent(xterm, rows) {
  const buffer = xterm?.buffer?.active;
  if (!buffer || !rows) return false;
  const firstRow = Math.max(0, Number(xterm.rows || 0) - rows);
  for (let row = firstRow; row < Number(xterm.rows || 0); row += 1) {
    const line = buffer.getLine(buffer.viewportY + row);
    if (line?.translateToString(true).trim()) return true;
  }
  return false;
}

function terminalPtyBottomAnchorRows(terminal, xterm) {
  const reserveRows = terminalPtyBottomOverscanRows(terminal);
  const buffer = xterm?.buffer?.active;
  const totalRows = Number(xterm?.rows || 0);
  if (!buffer || !reserveRows || !totalRows) return 0;
  const visibleRows = Math.max(1, totalRows - reserveRows);
  for (let row = totalRows - 1; row >= 0; row -= 1) {
    const line = buffer.getLine(buffer.viewportY + row);
    if (!line?.translateToString(true).trim()) continue;
    return Math.max(0, visibleRows - (row + 1));
  }
  return 0;
}

function terminalPtyBottomOverscanRows(terminal) {
  const runtimeId = String(terminal?.launchPlan?.runtimeId || "").toLowerCase();
  const agent = String(terminal?.agent || "").toLowerCase();
  const model = String(terminal?.model || "").toLowerCase();
  const codexModel = model.startsWith("gpt-")
    || model.includes("/gpt-")
    || model.includes("codex")
    || /^o[134](?:-|$)/.test(model);
  return runtimeId === "codex" || agent === "codex" || (agent === "vibyra" && codexModel)
    ? 2
    : 0;
}

function terminalPtyBottomInsetPixels(terminal, measuredSize = null) {
  const storedSize = typeof terminalXtermSizes === "object"
    ? terminalXtermSizes[terminal?.id]
    : null;
  const inset = Number(measuredSize?.bottomInset ?? storedSize?.bottomInset);
  return Number.isFinite(inset) ? Math.max(0, inset) : 0;
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
  const visible = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  const visibleIds = visible.map((terminal) => terminal.id);
  const structural = visible.map((terminal) => [
    terminal.id,
    terminal.ptyStatus === "unavailable" ? "unavailable" : "xterm",
    terminal.notice ? "notice" : ""
  ].join(":"));
  return JSON.stringify({
    layout: terminalLayout,
    fullscreen: typeof fullscreenTerminalId === "string" ? fullscreenTerminalId : "",
    activeProject: typeof activeTerminalProjectKey === "function" ? activeTerminalProjectKey() : "",
    projectShell: ptyProjectShellSignature(),
    visibleIds,
    structural
  });
}

function ptyProjectShellSignature() {
  if (typeof terminalProjectGroups !== "function") return "";
  return JSON.stringify({
    groups: terminalProjectGroups().map((group) => ({
      key: group.key,
      label: group.label,
      status: typeof terminalWorkspaceGroupStatus === "function" ? terminalWorkspaceGroupStatus(group).key : "",
      ids: group.terminals.map((terminal) => terminal.id)
    })),
    toolbar: Boolean(terminalToolbarMenuOpen),
    newMenu: Boolean(newTerminalMenuOpen),
    projectMenu: terminalProjectMenuTarget || ""
  });
}

function patchPtyTerminalStructure() {
  if (!terminals.length) return false;
  const page = nodes.content.querySelector(".terminal-page");
  const stage = page?.querySelector(".terminal-stage");
  if (!page || !stage) return false;
  if (typeof syncTerminalProjectWorkspaceHome === "function") syncTerminalProjectWorkspaceHome(page);
  const grid = terminalLayout === "grid";
  if (page.classList.contains("grid-mode") !== grid) return false;
  const visible = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  if (!patchPtyProjectShell(page, visible)) return false;
  syncPtyTerminalGrid(page, grid);
  const expectedIds = new Set(visible.map((terminal) => terminal.id));
  stage.querySelectorAll("[data-terminal]").forEach((article) => {
    if (!expectedIds.has(article.dataset.terminal || "")) article.remove();
  });
  for (const terminal of visible) {
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

function patchPtyProjectShell(page, visible) {
  if (typeof terminalProjectTabsHtml !== "function" || typeof terminalRailAgentsHtml !== "function") return true;
  const tabs = document.querySelector(".terminal-project-tabs");
  const railAgents = document.querySelector(".terminal-rail-agents");
  if (!tabs || !railAgents) return false;
  const nextTabs = terminalProjectTabsHtml();
  const nextRailAgents = terminalRailAgentsHtml(visible);
  if (tabs.outerHTML !== nextTabs) tabs.outerHTML = nextTabs;
  if (railAgents.outerHTML !== nextRailAgents) railAgents.outerHTML = nextRailAgents;
  bindPtyTopbarControls();
  return true;
}


function syncPtyTerminalGrid(page, grid) {
  if (typeof syncTerminalFullscreenState === "function") syncTerminalFullscreenState();
  page.classList.toggle("terminal-page--terminal-fullscreen", Boolean(fullscreenTerminalId));
  page.classList.toggle("grid-mode", grid);
  page.classList.remove("terminal-grid-many");
  page.removeAttribute("style");
  if (!grid || typeof terminalGridMeta !== "function") return;
  const projectTerminals = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  const gridMeta = terminalGridMeta(projectTerminals.length);
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
  if (typeof syncTerminalProjectWorkspaceHome === "function") syncTerminalProjectWorkspaceHome(page);
  const visible = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  let stable = true;
  for (const terminal of visible) stable = refreshPtyTerminalDom(terminal) && stable;
  if (stable) stable = refreshPtyTerminalSettingsMenus() && stable;
  if (stable) mountVisibleXterms();
  return stable;
}

function refreshDirtyPtyTerminalsDom(ids) {
  if (!ids?.size || !terminals.length) return refreshPtyTerminalsDom();
  const page = nodes.content.querySelector(".terminal-page");
  if (!page) return false;
  if (typeof syncTerminalProjectWorkspaceHome === "function") syncTerminalProjectWorkspaceHome(page);
  const visible = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  const visibleIds = new Set(visible.map((terminal) => terminal.id));
  if (!patchPtyProjectShell(page, visible)) return false;
  let stable = true;
  for (const id of ids) {
    const terminal = findTerminal(id);
    if (!terminal) continue;
    if (visibleIds.has(id)) stable = refreshPtyTerminalDom(terminal) && stable;
    refreshPtyTopbarTerminalDom(terminal);
  }
  if (stable && settingsTerminalId && ids.has(settingsTerminalId)) {
    stable = refreshPtyTerminalSettingsMenus() && stable;
  }
  if (stable) mountVisibleXterms(ids);
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
    if (typeof bindTerminalNoticeControls === "function") bindTerminalNoticeControls(notice);
    if (typeof bindTerminalWorkspaceCheckpointLinks === "function") bindTerminalWorkspaceCheckpointLinks(notice);
  }
  if (typeof terminalTaskActivityRefresh === "function") terminalTaskActivityRefresh(terminal);
  const unavailable = terminal.ptyStatus === "unavailable";
  if (unavailable !== Boolean(article.querySelector(".terminal-pty-unavailable"))) return false;
  refreshPtyStatusElements(article, terminal);
  const active = terminal.id === activeTerminalId;
  const projectVisible = typeof terminalProjectGroupKey !== "function"
    || terminalProjectGroupKey(terminal) === activeTerminalProjectKey();
  article.classList.remove(
    "terminal-provider-auto",
    "terminal-provider-openai",
    "terminal-provider-claude",
    "terminal-provider-gemini",
    "terminal-shell-mode"
  );
  article.classList.add(...terminalProviderClass(terminal).split(/\s+/).filter(Boolean));
  article.classList.toggle("terminal-auto-waiting", Boolean(terminal.autoAwaitingTask));
  article.classList.toggle("active", active);
  article.classList.toggle("terminal-project-hidden", !projectVisible);
  article.classList.toggle("terminal-fullscreen", fullscreenTerminalId === terminal.id);
  article.classList.toggle("terminal-fullscreen-hidden", Boolean(fullscreenTerminalId) && fullscreenTerminalId !== terminal.id);
  article.classList.toggle("terminal-focus-hidden", terminalLayout !== "grid" && !active);
  const fullscreenVisible = !fullscreenTerminalId || fullscreenTerminalId === terminal.id;
  article.setAttribute("aria-hidden", projectVisible && fullscreenVisible && (terminalLayout === "grid" || active) ? "false" : "true");
  const title = article.querySelector(".terminal-name strong, .terminal-tile-head strong");
  if (title && title.textContent !== terminal.title) title.textContent = terminal.title;
  const agentName = article.querySelector(".terminal-name small, .terminal-tile-head > button:first-child small");
  const nextAgentName = terminalAgentDisplayName(terminal);
  if (agentName && agentName.textContent !== nextAgentName) agentName.textContent = nextAgentName;
  const modelChip = article.querySelector(".terminal-model-chip");
  if (modelChip) {
    const model = terminalModelForDisplay(terminal.model);
    const nextModelChip = `${modelLogo(model)}${escapeHtml(model.label)}`;
    if (modelChip.innerHTML !== nextModelChip) modelChip.innerHTML = nextModelChip;
  }
  const fullscreenButton = article.querySelector(`[data-terminal-fullscreen="${CSS.escape(terminal.id)}"]`);
  if (fullscreenButton) {
    const fullscreen = fullscreenTerminalId === terminal.id;
    fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
    fullscreenButton.setAttribute("aria-label", `${fullscreen ? "Exit full screen for" : "Full screen"} ${terminal.title || "terminal"}`);
    fullscreenButton.setAttribute("title", fullscreen ? "Exit full screen" : "Full screen");
    fullscreenButton.innerHTML = icon(fullscreen ? "contract" : "expand");
  }
  if (unavailable) {
    const pre = article.querySelector(".terminal-pty-lines pre");
    if (pre && pre.textContent !== String(terminal.output || "")) pre.textContent = terminal.output || "";
  }
  return true;
}

function refreshPtyTerminalSettingsMenus() {
  if (!nodes.content.querySelector(".terminal-page")) return false;
  if (!settingsTerminalId && !document.querySelector(".terminal-settings-menu")) return true;
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

function refreshPtyStatusElements(root, terminal) {
  if (!root || !terminal) return;
  const next = terminalStatusState(terminal);
  root.querySelectorAll(".terminal-status").forEach((status) => {
    status.className = `terminal-status ${next.key}`;
    status.setAttribute("aria-label", next.label);
    status.setAttribute("title", next.label);
  });
}

function refreshPtyTopbarTerminalDom(terminal) {
  if (!terminal?.id) return;
  const tab = document.querySelector(`.terminal-tab[data-terminal-drag="${CSS.escape(terminal.id)}"]`);
  const active = terminal.id === activeTerminalId;
  const label = terminalTabAgentLabel(terminal, terminals.indexOf(terminal));
  const title = `${label}, ${terminalAgentDisplayName(terminal)}`;
  if (tab) {
    tab.classList.toggle("active", active);
    if (tab.getAttribute("title") !== title) tab.setAttribute("title", title);
    const open = tab.querySelector(`[data-terminal-focus="${CSS.escape(terminal.id)}"]`);
    if (open) {
      open.setAttribute("aria-selected", String(active));
      open.setAttribute("aria-label", `Open ${label}. Alt plus left or right arrow reorders this tab.`);
      const text = open.querySelector("span:not(.terminal-status)");
      if (text && text.textContent !== label) text.textContent = label;
    }
    const close = tab.querySelector(`[data-terminal-close="${CSS.escape(terminal.id)}"]`);
    if (close) close.setAttribute("aria-label", `Close ${label}`);
    refreshPtyStatusElements(tab, terminal);
  }
  const row = document.querySelector(`.terminal-agent-nav-item[data-terminal-drag="${CSS.escape(terminal.id)}"]`);
  if (!row) return;
  row.classList.toggle("active", active);
  if (row.getAttribute("title") !== title) row.setAttribute("title", title);
  const open = row.querySelector(`[data-terminal-focus="${CSS.escape(terminal.id)}"]`);
  if (open) {
    open.setAttribute("aria-selected", String(active));
    open.setAttribute("aria-label", `Open ${label}`);
    const strong = open.querySelector("strong");
    const small = open.querySelector("small");
    const agent = terminalAgentDisplayName(terminal);
    if (strong && strong.textContent !== label) strong.textContent = label;
    if (small && small.textContent !== agent) small.textContent = agent;
  }
  const close = row.querySelector(`[data-terminal-close="${CSS.escape(terminal.id)}"]`);
  if (close) close.setAttribute("aria-label", `Close ${label}`);
  refreshPtyStatusElements(row, terminal);
}

function terminalXtermTheme(node) {
  const scope = node.closest(".terminal-focus, .terminal-tile, .terminal-page") || document.body;
  const styles = getComputedStyle(scope);
  const css = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: css("--terminal-bg", "#08080c"),
    foreground: css("--terminal-copy", "#f7f4ff"),
    cursor: css("--terminal-text", "#f7f4ff"),
    selectionBackground: css("--terminal-selection", "rgba(109, 59, 255, 0.22)"),
    selectionInactiveBackground: css("--terminal-selection-inactive", "rgba(109, 59, 255, 0.14)"),
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

function terminalXtermThemeKey(node) {
  const scope = node.closest(".terminal-focus, .terminal-tile, .terminal-page") || document.body;
  return [
    document.body?.dataset?.desktopTheme || "",
    scope.className || "",
    scope.getAttribute?.("style") || ""
  ].join("|");
}

function applyPtyXtermThemeIfChanged(id, xterm, node) {
  const key = terminalXtermThemeKey(node);
  if (terminalXtermThemeKeys[id] === key) return;
  xterm.options.theme = terminalXtermTheme(node);
  terminalXtermThemeKeys[id] = key;
}

function applyTerminalXtermThemes() {
  Object.entries(terminalXterms).forEach(([id, xterm]) => {
    const node = xterm?.element?.parentElement;
    if (!terminalXtermNodeIsVisible(node)) {
      delete terminalXtermThemeKeys[id];
      return;
    }
    try {
      xterm.options.theme = terminalXtermTheme(node);
      terminalXtermThemeKeys[id] = terminalXtermThemeKey(node);
      xterm.refresh?.(0, Math.max(0, (xterm.rows || 1) - 1));
    } catch {}
  });
}

let terminalThemeObserver = null;
let terminalThemeMedia = null;
function ensureTerminalThemeObserver() {
  if (!document.body) return;
  const scheduleTheme = () => {
    const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
    schedule(applyTerminalXtermThemes);
  };
  if (!terminalThemeObserver && typeof MutationObserver === "function") {
    terminalThemeObserver = new MutationObserver(scheduleTheme);
    terminalThemeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-desktop-theme"] });
  }
  if (!terminalThemeMedia && typeof window.matchMedia === "function") {
    terminalThemeMedia = window.matchMedia("(prefers-color-scheme: light)");
    terminalThemeMedia.addEventListener?.("change", scheduleTheme);
  }
}

ensureTerminalThemeObserver();

function schedulePtyRender(id) {
  if (id) {
    terminalPtyRenderDirtyIds.add(id);
    clearTimeout(terminalPtyRenderTimers[id]);
    delete terminalPtyRenderTimers[id];
  }
  clearTimeout(terminalPtyRenderBatchTimer);
  terminalPtyRenderBatchTimer = setTimeout(() => {
    const dirtyIds = new Set(terminalPtyRenderDirtyIds);
    terminalPtyRenderDirtyIds.clear();
    saveTerminals();
    if (activePage === "terminals") {
      if (!refreshDirtyPtyTerminalsDom(dirtyIds)) {
        renderTopbar();
        render();
      }
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
  const provider = normalizedPtyProviderState(session);
  return {
    title: String(session.title || ""),
    agent: String(session.agent || ""),
    agentStatus: session.agentStatus || null,
    requestedModel: String(session.requestedModel || session.model || ""),
    model: String(session.model || ""),
    autoRouting: session.autoRouting || null,
    autoAwaitingTask: Boolean(session.autoAwaitingTask),
    autoDeciding: Boolean(session.autoDeciding),
    launchPlan: session.launchPlan || null,
    effort: normalizeTerminalEffort(session.reasoningEffort),
    permissionMode: normalizeTerminalPermissionMode(session.permissionMode),
    teamId: String(session.teamId || ""),
    teamSize: Math.max(0, Math.min(4, Number(session.teamSize) || 0)),
    teamGoal: String(session.teamGoal || "").slice(0, 1200),
    teamRole: String(session.teamRole || "").slice(0, 40),
    teamRoleKey: String(session.teamRoleKey || "").slice(0, 40),
    teamPhase: String(session.teamPhase || "").slice(0, 40),
    teamCapability: String(session.teamCapability || "").slice(0, 40),
    teamRoleContractVersion: Math.max(0, Number(session.teamRoleContractVersion) || 0),
    teamRolePolicyHash: String(session.teamRolePolicyHash || "").slice(0, 128),
    teamPlannerMode: String(session.teamPlannerMode || "").slice(0, 40),
    teamPlannerModel: String(session.teamPlannerModel || "").slice(0, 120),
    teamPlannerFallbackReason: String(session.teamPlannerFallbackReason || "").slice(0, 80),
    tokenMode: ["vibyra", "provider"].includes(String(session.tokenMode || ""))
      ? String(session.tokenMode)
      : "vibyra",
    projectId: String(session.projectId || ""),
    workspaceMode: normalizeTerminalWorkspaceMode(session.workspaceMode),
    branchName: String(session.branchName || ""),
    workspacePath: String(session.workspacePath || ""),
    workspaceNotice: String(session.workspaceNotice || ""),
    cwd: String(session.cwd || ""),
    cols: normalizedPtyDimension(session.cols, 100, 18, 180),
    rows: normalizedPtyDimension(session.rows, 30, 4, 80),
    output: String(session.output || "").slice(-60000),
    ptyStatus: String(session.status || "idle"),
    providerState: provider.state,
    providerReady: provider.ready,
    providerBusy: provider.busy,
    exitCode: session.exitCode ?? null
  };
}

function normalizedPtyDimension(value, fallback, minimum, maximum) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : fallback;
}

function normalizedPtyProviderState(session) {
  const source = session?.providerState;
  const rawState = typeof source === "object"
    ? source.state || source.status
    : source;
  let state = String(rawState || session?.agentStatus || "").trim().toLowerCase();
  if (["fallback_shell", "fallback shell", "shell-fallback"].includes(state)) state = "fallback-shell";
  if (["initializing", "launching", "connecting", "not-ready"].includes(state)) state = "starting";
  if (["idle", "available"].includes(state)) state = "ready";
  if (["running", "working"].includes(state)) state = "busy";
  if (!["starting", "ready", "busy", "fallback-shell", "exited", "unavailable", "error"].includes(state)) {
    state = String(session?.status || "") === "starting" ? "starting" : "ready";
  }
  const explicitReady = typeof source === "object" ? source.ready : session?.providerReady;
  const explicitBusy = typeof source === "object" ? source.busy : session?.providerBusy;
  return {
    state,
    ready: explicitReady === undefined ? state === "ready" || state === "busy" : Boolean(explicitReady),
    busy: explicitBusy === undefined ? state === "busy" : Boolean(explicitBusy)
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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushPtyTerminals();
    return;
  }
  mountVisibleXterms();
  for (const terminal of terminals) schedulePtyXtermFit(terminal.id, { forceBackend: true });
});

function flushPtyTerminals() {
  try { saveTerminals(); } catch {}
}

function syncPtyTerminals() {
  if (ptyCollectionSyncPromise) return ptyCollectionSyncPromise;
  ptyCollectionSyncPromise = performPtyTerminalSync()
    .finally(() => {
      ptyCollectionSyncPromise = null;
    });
  return ptyCollectionSyncPromise;
}

async function performPtyTerminalSync() {
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
    const localNotice = terminal.notice;
    Object.assign(terminal, ptySessionPatch(session), {
      title: String(session.title || terminal.title || "Terminal"),
      pending: false
    });
    terminal.notice = localNotice || terminal.workspaceNotice || null;
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
  cancelSettledPtyXtermFit(id);
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
  delete terminalXtermThemeKeys[id];
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
  renderNav();
  renderTopbar();
  if (!refreshPtyTerminalsDom()) {
    forceTerminalRender = true;
    render();
  }
}
