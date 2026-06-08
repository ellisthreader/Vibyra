const terminalTaskActivityTimers = {};

function terminalTaskActivitySummary(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 92 ? `${text.slice(0, 89)}...` : text;
}

function terminalTaskActivityStart(terminal, prompt) {
  if (!terminal) return;
  clearTimeout(terminalTaskActivityTimers[terminal.id]);
  terminal.taskActivity = {
    phase: "assigning",
    summary: terminalTaskActivitySummary(prompt),
    startedAt: Date.now(),
    outputAt: 0
  };
  terminalTaskActivityScheduleClear(terminal, 15000);
  terminalTaskActivityRefresh(terminal);
}

function terminalTaskActivityAccepted(terminal) {
  if (!terminal?.taskActivity) return;
  terminal.taskActivity.phase = "accepted";
  terminalTaskActivityScheduleClear(terminal, 45000);
  terminalTaskActivityRefresh(terminal);
}

function terminalTaskActivityOutput(terminal, data) {
  if (!terminal?.taskActivity || !String(data || "").trim()) return;
  terminal.taskActivity.phase = "working";
  terminal.taskActivity.outputAt = Date.now();
  terminalTaskActivityScheduleClear(terminal, 12000);
}

function terminalTaskActivityFailed(terminal) {
  terminalTaskActivityClear(terminal);
}

function terminalTaskActivityScheduleClear(terminal, delay) {
  clearTimeout(terminalTaskActivityTimers[terminal.id]);
  terminalTaskActivityTimers[terminal.id] = setTimeout(() => {
    terminalTaskActivityClear(terminal);
  }, delay);
}

function terminalTaskActivityClear(terminal) {
  if (!terminal) return;
  clearTimeout(terminalTaskActivityTimers[terminal.id]);
  delete terminalTaskActivityTimers[terminal.id];
  delete terminal.taskActivity;
  terminalTaskActivityRefresh(terminal);
}

function terminalTaskActivityHtml(terminal) {
  const activity = terminal?.taskActivity;
  if (!activity) return "";
  const assigning = activity.phase === "assigning";
  const working = activity.phase === "working";
  const label = assigning ? "Assigning task" : working ? "Vibyra is working" : "Task accepted";
  return `<div class="terminal-task-activity ${assigning ? "is-assigning" : working ? "is-working" : "is-accepted"}" data-terminal-task-activity role="status" aria-live="polite">
    <span class="terminal-task-motion" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="terminal-task-copy"><strong>${label}</strong><small>${escapeHtml(activity.summary || "Working in this terminal")}</small></span>
    <span class="terminal-task-live" aria-hidden="true">LIVE</span>
  </div>`;
}

function terminalTaskActivityRefresh(terminal) {
  if (typeof activePage !== "undefined" && activePage !== "terminals") return;
  const article = nodes?.content?.querySelector?.(`[data-terminal="${CSS.escape(terminal.id)}"]`);
  if (article) {
    const current = article.querySelector("[data-terminal-task-activity]");
    const html = terminalTaskActivityHtml(terminal);
    article.classList.toggle("is-ai-working", Boolean(html));
    if (!html) current?.remove();
    else if (current && current.dataset.activitySignature !== terminalTaskActivitySignature(terminal)) current.outerHTML = html;
    else article.querySelector(".terminal-focus-head, .terminal-tile-head")?.insertAdjacentHTML("afterend", html);
    article.querySelector("[data-terminal-task-activity]")?.setAttribute("data-activity-signature", terminalTaskActivitySignature(terminal));
  }
  const status = terminalStatusState(terminal);
  document.querySelectorAll(`[data-terminal-drag="${CSS.escape(terminal.id)}"] .terminal-status`).forEach((node) => {
    node.className = `terminal-status ${status.key}`;
    node.setAttribute("aria-label", status.label);
    node.setAttribute("title", status.label);
  });
}

function terminalTaskActivitySignature(terminal) {
  const activity = terminal?.taskActivity;
  return activity ? `${activity.phase}:${activity.summary}` : "";
}
