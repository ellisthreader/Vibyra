async function prepareTerminalWorkspaceLaunch(projectId) {
  const preflight = await terminalWorkspaceRequest("preflight", { projectId });
  if (!preflight) return false;
  if (preflight.clean) return true;
  return terminalCheckpointApproval(preflight);
}

async function terminalWorkspaceRequest(action, body, quiet = false) {
  try {
    const response = await fetch(`/desktop/pty-terminals/workspace/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Vibyra could not check this project.");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vibyra could not check this project.";
    if (quiet) return { ok: false, error: message };
    await terminalCheckpointMessage({
      title: "Separate branches are not ready",
      message
    });
    return null;
  }
}

function terminalCheckpointApproval(preflight) {
  return new Promise((resolve) => {
    const count = Number(preflight.changedFiles) || 0;
    const projectName = String(preflight.project?.name || "this project");
    const overlay = terminalCheckpointOverlay({
      title: "Save a local checkpoint?",
      message: `${projectName} has ${count} changed file${count === 1 ? "" : "s"}. Vibyra needs a local save point before it can give each terminal separate files.`,
      detail: "This stays on your computer. Nothing is uploaded to GitHub.",
      primary: "Save checkpoint and continue",
      cancel: "Not now"
    });
    const finish = (result) => {
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector("[data-checkpoint-cancel]")?.addEventListener("click", () => finish(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(false);
    });
    overlay.querySelector("[data-checkpoint-confirm]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const cancel = overlay.querySelector("[data-checkpoint-cancel]");
      const status = overlay.querySelector("[data-checkpoint-status]");
      button.disabled = true;
      if (cancel) cancel.disabled = true;
      button.textContent = "Saving locally...";
      const result = await terminalWorkspaceRequest("checkpoint", { projectId: preflight.project?.id }, true);
      if (result?.clean) {
        finish(true);
        return;
      }
      button.disabled = false;
      if (cancel) cancel.disabled = false;
      button.textContent = "Try again";
      if (status) status.textContent = result?.error || "The checkpoint was not created. Your files are unchanged.";
    });
    overlay.querySelector("[data-checkpoint-confirm]")?.focus();
  });
}

function terminalCheckpointMessage({ title, message }) {
  return new Promise((resolve) => {
    const overlay = terminalCheckpointOverlay({
      title,
      message,
      detail: "No files were changed.",
      primary: "Close"
    });
    const close = () => {
      overlay.remove();
      resolve();
    };
    overlay.querySelector("[data-checkpoint-confirm]")?.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector("[data-checkpoint-confirm]")?.focus();
  });
}

function terminalCheckpointOverlay(options) {
  document.querySelector(".terminal-checkpoint-backdrop")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop open terminal-checkpoint-backdrop";
  overlay.innerHTML = `<section class="modal terminal-checkpoint-dialog" role="dialog" aria-modal="true" aria-labelledby="terminal-checkpoint-title"><span class="terminal-checkpoint-icon">${icon("split")}</span><div class="terminal-checkpoint-copy"><h2 id="terminal-checkpoint-title">${escapeHtml(options.title)}</h2><p>${escapeHtml(options.message)}</p><small>${escapeHtml(options.detail || "")}</small><em data-checkpoint-status aria-live="polite"></em></div><div class="terminal-checkpoint-actions">${options.cancel ? `<button class="secondary-button" type="button" data-checkpoint-cancel>${escapeHtml(options.cancel)}</button>` : ""}<button class="primary-button" type="button" data-checkpoint-confirm>${escapeHtml(options.primary)}</button></div></section>`;
  document.body.appendChild(overlay);
  return overlay;
}
