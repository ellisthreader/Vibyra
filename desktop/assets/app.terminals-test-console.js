let terminalTestConsoleOpen = localStorage.getItem("vibyra.desktop.testConsoleOpen") === "true";
let terminalTestConsoleEntries = [];
let terminalTestConsoleSequence = 0;
let terminalTestRefreshing = false;
let terminalTestConsoleHeight = Number(localStorage.getItem("vibyra.desktop.testConsoleHeight")) || 250;

function terminalTestConsoleHtml() {
  return `<section class="terminal-test-console" data-terminal-test-console>
    <button class="terminal-test-console-resizer terminal-test-console-resizer--height" type="button" role="separator" aria-label="Resize console height" aria-orientation="horizontal" data-terminal-test-console-resize="height"></button>
    <header>
      <button type="button" data-terminal-test-console-toggle aria-expanded="${terminalTestConsoleOpen}">
        ${icon("terminal")}<span>Console</span><output data-terminal-test-console-count hidden>0</output>${icon("chevron-down")}
      </button>
      <div><button type="button" data-terminal-test-console-copy>Copy</button><button type="button" data-terminal-test-console-clear>Clear</button><button class="terminal-test-console-close" type="button" data-terminal-test-console-close aria-label="Close console" title="Close console">${icon("close")}</button></div>
    </header>
    <div class="terminal-test-console-body" data-terminal-test-console-body>
      <div class="terminal-test-console-list" data-terminal-test-console-list></div>
    </div>
  </section>`;
}

function bindTerminalTestConsole(root) {
  root.querySelector("[data-terminal-test-console-toggle]")?.addEventListener("click", () => {
    terminalTestConsoleOpen = !terminalTestConsoleOpen;
    localStorage.setItem("vibyra.desktop.testConsoleOpen", String(terminalTestConsoleOpen));
    refreshTerminalTestConsole(root);
    syncTerminalTestScale(root);
  });
  root.querySelector("[data-terminal-test-console-close]")?.addEventListener("click", () => {
    terminalTestConsoleOpen = false;
    localStorage.setItem("vibyra.desktop.testConsoleOpen", "false");
    refreshTerminalTestConsole(root);
    syncTerminalTestScale(root);
  });
  root.querySelector("[data-terminal-test-console-clear]")?.addEventListener("click", () => {
    terminalTestConsoleEntries = [];
    refreshTerminalTestConsole(root);
  });
  root.querySelector("[data-terminal-test-console-copy]")?.addEventListener("click", async () => {
    const text = terminalTestConsoleEntries.map((entry) => `${entry.level.toUpperCase()} ${entry.message}`).join("\n");
    if (text) await navigator.clipboard?.writeText(text);
  });
  root.querySelector("[data-terminal-test-console-list]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-terminal-test-ai-fix]");
    if (button) void openTerminalTestErrorInTerminal(Number(button.dataset.terminalTestAiFix));
  });
  const panel = root.querySelector("[data-terminal-test-console]");
  bindTerminalTestConsoleResizer(panel);
  new ResizeObserver(() => {
    if (!terminalTestConsoleOpen || !panel) return;
    terminalTestConsoleHeight = Math.round(panel.getBoundingClientRect().height);
    localStorage.setItem("vibyra.desktop.testConsoleHeight", String(terminalTestConsoleHeight));
  }).observe(panel);
}

function bindTerminalTestConsoleResizer(panel) {
  panel?.querySelectorAll("[data-terminal-test-console-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (!terminalTestConsoleOpen) return;
      const startY = event.clientY;
      const bounds = panel.getBoundingClientRect();
      handle.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        setTerminalTestConsoleHeight(bounds.height + startY - moveEvent.clientY, panel);
      };
      const finish = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
    handle.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        setTerminalTestConsoleHeight(terminalTestConsoleHeight + (event.key === "ArrowUp" ? 40 : -40), panel);
      }
    });
  });
}

function setTerminalTestConsoleHeight(value, panel) {
  const stage = panel.closest(".terminal-test-stage");
  const maximum = Math.max(180, Math.min(360, (stage?.clientHeight || 600) - 140));
  terminalTestConsoleHeight = Math.round(Math.min(maximum, Math.max(150, value)));
  panel.style.height = `${terminalTestConsoleHeight}px`;
  panel.querySelector('[data-terminal-test-console-resize="height"]')?.setAttribute("aria-valuenow", String(terminalTestConsoleHeight));
  localStorage.setItem("vibyra.desktop.testConsoleHeight", String(terminalTestConsoleHeight));
  syncTerminalTestScale(panel.closest("[data-terminal-test-workspace]"));
}

function refreshTerminalTestConsole(root) {
  const panel = root.querySelector("[data-terminal-test-console]");
  if (!panel) return;
  panel.classList.toggle("is-open", terminalTestConsoleOpen);
  panel.style.height = terminalTestConsoleOpen ? `${terminalTestConsoleHeight}px` : "";
  panel.querySelector('[data-terminal-test-console-resize="height"]')?.setAttribute("aria-valuenow", String(terminalTestConsoleHeight));
  panel.querySelector("[data-terminal-test-console-toggle]").setAttribute("aria-expanded", String(terminalTestConsoleOpen));
  const issues = terminalTestConsoleEntries.filter((entry) => entry.level === "warn" || entry.level === "error").length;
  const count = panel.querySelector("[data-terminal-test-console-count]");
  count.textContent = String(issues || terminalTestConsoleEntries.length);
  count.hidden = terminalTestConsoleEntries.length === 0;
  count.classList.toggle("has-issues", issues > 0);
  const list = panel.querySelector("[data-terminal-test-console-list]");
  list.innerHTML = terminalTestConsoleEntries.length
    ? terminalTestConsoleEntries.map(terminalTestConsoleEntryHtml).join("")
    : `<p class="terminal-test-console-empty">${terminalTestProjectId ? "Console output will appear here." : "Project console is available for Vibyra project previews."}</p>`;
  if (terminalTestConsoleOpen) list.scrollTop = list.scrollHeight;
}

function terminalTestConsoleEntryHtml(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const detail = entry.file ? `<small>${escapeHtml(entry.file)}</small>` : "";
  const fix = entry.level === "error" || entry.level === "warn"
    ? `<button type="button" data-terminal-test-ai-fix="${entry.id}">${icon("sparkles")}Fix with AI</button>`
    : "";
  return `<article class="is-${escapeAttribute(entry.level)}"><time>${time}</time><span>${escapeHtml(entry.message || "(empty)")}${detail}</span>${fix}</article>`;
}

async function openTerminalTestErrorInTerminal(entryId) {
  const entry = terminalTestConsoleEntries.find((item) => item.id === entryId);
  if (!entry) return;
  const project = (currentState.projects || []).find((item) => item.id === terminalTestProjectId);
  if (project) {
    selectedProjectId = project.id;
    localStorage.setItem("vibyra.desktop.project", selectedProjectId);
    setupProjectId = project.id;
    localStorage.setItem(setupProjectKey, setupProjectId);
  }
  const location = entry.file ? `\nFile or source: ${entry.file}` : "";
  const prompt = `Fix this preview ${entry.level} in ${project?.name || "the selected project"}. Inspect the relevant files, explain the cause briefly, implement the safest fix, and verify the preview afterward.\n\n${entry.message}${location}`;
  const reusable = terminalTestProjectTerminal(project?.id || "");
  closeTerminalTest();
  if (reusable) {
    await assignTerminalTestFix(reusable, prompt);
    return;
  }
  const terminal = createTerminal(setupModel, true, {
    initialPrompt: prompt,
    projectId: project?.id || terminalTestProjectId || "",
    workspaceMode: "shared",
    allowSharedFallback: true
  });
  if (terminal) {
    terminal.title = `Fix ${project?.name || "preview"}`;
    saveTerminals();
    renderTopbar();
    return;
  }
  terminalRuntimeNotice = terminals.length >= maxTerminals
    ? "Close a terminal, then choose Fix with AI again."
    : terminalRuntimeNotice || "A project terminal could not be opened for this error.";
  render();
}

function terminalTestProjectTerminal(projectId) {
  const reusable = (terminal) => terminal.projectId === projectId
    && terminalTestTerminalCanEdit(terminal)
    && !terminal.pending
    && !terminal.providerBusy
    && !["unavailable", "exited"].includes(terminal.ptyStatus);
  return terminals.find((terminal) => terminal.id === activeTerminalId && reusable(terminal))
    || terminals.find(reusable)
    || null;
}

function terminalTestTerminalCanEdit(terminal) {
  const hasTeamRole = Boolean(String(terminal?.teamId || "").trim() || String(terminal?.teamRoleKey || "").trim());
  if (!hasTeamRole) return true;
  return String(terminal?.teamRoleKey || "").trim().toLowerCase() === "builder"
    || String(terminal?.teamCapability || "").trim().toLowerCase() === "writer";
}

async function assignTerminalTestFix(terminal, prompt) {
  terminal.initialPrompt = prompt;
  terminal.pending = true;
  terminal.updatedAt = Date.now();
  saveTerminals();
  setActiveTerminal(terminal.id);
  try {
    await submitInitialPtyPrompt(terminal);
    terminal.notice = null;
    return true;
  } catch (error) {
    terminal.notice = error instanceof Error ? error.message : "The preview fix could not be sent to this terminal.";
    return false;
  } finally {
    terminal.pending = false;
    terminal.updatedAt = Date.now();
    saveTerminals();
    renderTopbar();
    if (!refreshPtyTerminalsDom()) render();
  }
}

function addTerminalTestConsoleEntry(payload) {
  const level = ["debug", "error", "info", "log", "warn", "system"].includes(payload.level) ? payload.level : "error";
  terminalTestConsoleEntries.push({
    id: ++terminalTestConsoleSequence,
    file: String(payload.file || ""),
    level,
    message: String(payload.message || payload.stack || "Preview error").slice(0, 6000),
    timestamp: Number(payload.timestamp) || Date.now()
  });
  terminalTestConsoleEntries = terminalTestConsoleEntries.slice(-200);
  document.querySelectorAll("[data-terminal-test-workspace]").forEach(refreshTerminalTestConsole);
}

function refreshTerminalTestPreview(root) {
  if (!terminalTestUrl || terminalTestRefreshing) return;
  terminalTestRefreshing = true;
  terminalTestStatus = "Refreshing preview...";
  terminalTestConsoleEntries = [];
  addTerminalTestConsoleEntry({ level: "system", message: "Preview refreshed" });
  refreshTerminalTestWorkspace(root);
  setTerminalTestFrameUrl(root, terminalTestUrl, true);
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !["vibyra-preview-console", "vibyra-preview-error"].includes(data.source)) return;
  const root = document.querySelector("[data-terminal-test-workspace]:not([hidden])");
  const frame = root?.querySelector("[data-terminal-test-frame-content]");
  if (!frame || event.source !== frame.contentWindow) return;
  addTerminalTestConsoleEntry({
    ...data,
    level: data.source === "vibyra-preview-error" ? "error" : data.level
  });
});
