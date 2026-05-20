async function startPtyTerminal(terminal) {
  try {
    const response = await fetch("/desktop/pty-terminals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: terminal.id, title: terminal.title, agent: terminal.agent, projectId: terminal.projectId, cols: 120, rows: 34 }) });
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
    forceTerminalRender = true;
    saveTerminals();
    render();
  }
}

function connectPtyTerminal(terminal) {
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

function handlePtyKeydown(event, id) {
  if (!id || terminalXterms[id]) return;
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
        theme: {
          background: "#08080c",
          foreground: "#f7f4ff",
          cursor: "#f7f4ff",
          selectionBackground: "#6d3bff66"
        }
      });
      terminalXterms[id] = xterm;
      xterm.onData((data) => sendPtyInput(id, data));
    }
    if (!xterm.element || xterm.element.parentElement !== node) {
      node.replaceChildren();
      xterm.open(node);
      xterm.clear();
      if (terminal.output) xterm.write(terminal.output);
    }
  });
}

function schedulePtyRender(id) {
  clearTimeout(terminalPtyRenderTimers[id]);
  terminalPtyRenderTimers[id] = setTimeout(() => {
    forceTerminalRender = true;
    saveTerminals();
    if (activePage === "terminals") render();
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
    agentStatus: session.agentStatus || null,
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
  return terminalAgents.some((agent) => agent.key === next) ? next : "codex";
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
    forceTerminalRender = true;
    saveTerminals();
    if (activePage === "terminals") render();
  } catch {}
}
