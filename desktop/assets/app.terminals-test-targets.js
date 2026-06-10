function clearTerminalTestTargets() {
  terminalTestTargets = [];
  terminalTestTargetId = "";
  terminalTestServices = {};
  terminalTestActiveTargetId = "";
  terminalTestTargetPendingId = "";
}

function selectTerminalTestTarget(targetId) {
  if (terminalTestLoading || terminalTestTargetPendingId) return;
  selectTerminalTestViewport(targetId);
  terminalTestLaunch = terminalTestSelectedTarget();
  terminalTestUrl = "";
  terminalTestLaunchError = "";
  syncTerminalTestWorkspace();
  if (terminalTestServiceRunning()) void activateTerminalProjectPreview(terminalTestTargetId);
}

function refreshTerminalTestTargetControl(toolbar) {
  const control = toolbar.querySelector("[data-terminal-test-app-control]");
  const select = toolbar.querySelector("[data-terminal-test-target]");
  control.hidden = terminalTestTargets.length < 2;
  select.innerHTML = terminalTestTargets.map((target) => (
    `<option value="${escapeAttribute(target.id)}">${escapeHtml(target.name)} · ${escapeHtml(target.framework)}${terminalTestServiceRunning(terminalTestService(target.id)) ? " · Running" : target.available ? "" : " · unavailable"}</option>`
  )).join("");
  select.value = terminalTestTargetId;
}

function refreshTerminalTestTargets(empty) {
  const host = empty.querySelector("[data-terminal-test-targets]");
  host.hidden = terminalTestTargets.length === 0;
  host.innerHTML = terminalTestTargets.map((target) => terminalTestTargetHtml(target)).join("");
}

function terminalTestTargetHtml(target) {
  const selected = target.id === terminalTestTargetId;
  const path = target.appDirectory || "Project root";
  const detail = target.available ? target.command : target.reason;
  const iconName = target.kind === "mobile" ? "phone" : target.kind === "desktop" ? "desktop" : "preview";
  const service = terminalTestService(target.id);
  const running = terminalTestServiceRunning(service);
  const starting = terminalTestServiceStarting(service);
  return `<button class="terminal-test-target ${selected ? "is-selected" : ""}" type="button" data-terminal-test-target-id="${escapeAttribute(target.id)}" aria-pressed="${selected}">
    <span class="terminal-test-target-icon">${icon(iconName)}</span>
    <span><strong>${escapeHtml(target.name)}</strong><small>${escapeHtml(target.framework)} · ${escapeHtml(path)}</small><code>${escapeHtml(detail)}</code></span>
    <span class="terminal-test-target-state ${running ? "is-running" : starting ? "is-starting" : ""}"><i></i><small>${running ? "Running" : starting ? "Starting" : target.available ? "" : "Unavailable"}</small></span>
  </button>`;
}

function refreshTerminalTestFooter(root) {
  const footer = root.querySelector("[data-terminal-test-footer]");
  const button = footer.querySelector("[data-terminal-test-start-server]");
  const note = footer.querySelector("[data-terminal-test-approval-note]");
  const action = terminalTestTargetAction();
  footer.hidden = !action || terminalTestLoading;
  button.disabled = Boolean(terminalTestTargetPendingId);
  button.dataset.action = action?.kind || "";
  button.querySelector("span").textContent = action?.label || "";
  button.classList.toggle("is-stop", action?.kind === "stop");
  note.hidden = action?.kind !== "run";
}

function setTerminalTestFrameUrl(root, value, force = false) {
  const shell = root.querySelector("[data-terminal-test-frame]");
  const frame = root.querySelector("[data-terminal-test-frame-content]");
  const empty = root.querySelector("[data-terminal-test-empty]");
  const url = terminalTestNormalizeUrl(value);
  const runnerVisible = terminalTestLoading || Boolean(terminalTestLaunchError);
  shell.hidden = !url && !runnerVisible;
  frame.hidden = !url;
  empty.hidden = Boolean(url) || runnerVisible;
  const unavailableReason = terminalTestLaunch && terminalTestLaunch.available === false ? terminalTestLaunch.reason : "";
  empty.querySelector("[data-terminal-test-empty-title]").textContent = terminalTestTargets.length
    ? `${terminalTestTargets.length} app${terminalTestTargets.length === 1 ? "" : "s"} found`
    : unavailableReason ? "This project has no browser preview yet" : "";
  empty.querySelector("[data-terminal-test-empty-message]").textContent = terminalTestTargets.length
    ? "Choose an app. Running services stay available while you switch."
    : unavailableReason;
  refreshTerminalTestTargets(empty);
  refreshTerminalTestFooter(root);
  if (!url || (!force && frame.dataset.url === url)) return;
  frame.dataset.url = url;
  frame.setAttribute("sandbox", terminalTestSandbox(url));
  frame.title = `Live preview at ${url}`;
  frame.src = force ? `${url}${url.includes("?") ? "&" : "?"}vibyraReload=${Date.now()}` : url;
}
