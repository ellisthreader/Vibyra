function terminalWorkspaceDisplay(terminal) {
  const projectId = String(terminal?.projectId || "");
  if (!projectId) return null;
  const mode = normalizeTerminalWorkspaceMode(terminal?.workspaceMode);
  const branchName = String(terminal?.branchName || "");
  const fallback = String(terminal?.workspaceNotice || "");
  if (mode === "worktree") {
    return {
      key: branchName ? "isolated" : "preparing",
      label: branchName ? "Separate branch" : "Preparing branch",
      detail: branchName,
      explanation: branchName
        ? `This terminal edits ${branchName} in its own local Git worktree. Other terminals cannot overwrite these files directly.`
        : "Vibyra is preparing a separate local Git branch for this terminal."
    };
  }
  if (fallback) {
    const fallbackCopy = terminalWorkspaceFallbackCopy(fallback);
    return {
      key: "fallback",
      label: "Shared for now",
      detail: fallbackCopy.detail,
      explanation: fallbackCopy.explanation
    };
  }
  return {
    key: "shared",
    label: "Shared folder",
    detail: "",
    explanation: "This terminal edits the original project folder. Parallel terminals may edit the same files."
  };
}

function terminalWorkspaceFallbackCopy(message) {
  const fallback = String(message || "");
  if (/clean repository|saved Git checkpoint|not saved in Git/i.test(fallback)) {
    return {
      detail: "Save project changes first",
      explanation: "This project has changes that are not saved in Git yet, so Vibyra kept this terminal in the shared folder. Your files were not deleted. Save a local project checkpoint, then reopen the terminals and choose Separate branches. GitHub is not required. Until then, parallel terminals can edit the same files."
    };
  }
  if (/not inside a Git repository/i.test(fallback)) {
    return {
      detail: "Git is not set up",
      explanation: "Separate branches need local Git version history. This terminal opened in the shared folder instead. Set up Git for the project, then reopen the terminals and choose Separate branches. A GitHub account is not required."
    };
  }
  if (/Full PC cannot use Git worktree mode/i.test(fallback)) {
    return {
      detail: "Choose a project",
      explanation: "Separate branches work with a Git project, not Full PC. Choose a project folder or continue in the shared folder."
    };
  }
  return {
    detail: "Separate branches unavailable",
    explanation: "Vibyra could not create a separate local branch, so this terminal opened in the shared folder. Your files were not moved or deleted. Parallel terminals can edit the same files."
  };
}

function terminalWorkspaceIndicator(terminal) {
  const state = terminalWorkspaceDisplay(terminal);
  if (!state) return "";
  const detail = state.detail ? `<span>${escapeHtml(state.detail)}</span>` : "";
  const title = state.detail ? `${state.label}: ${state.detail}` : state.label;
  return `<button class="terminal-workspace-indicator ${state.key}" type="button" data-terminal-workspace-info="${escapeAttribute(terminal.id)}" data-workspace-signature="${escapeAttribute(terminalWorkspaceSignature(terminal))}" title="${escapeAttribute(title)}" aria-label="${escapeAttribute(`${title}. Click for details.`)}">${icon(state.key === "isolated" || state.key === "preparing" ? "split" : "folder")}<strong>${escapeHtml(state.label)}</strong>${detail}</button>`;
}

function terminalWorkspaceSignature(terminal) {
  return [
    String(terminal?.projectId || ""),
    normalizeTerminalWorkspaceMode(terminal?.workspaceMode),
    String(terminal?.branchName || ""),
    String(terminal?.workspaceNotice || "")
  ].join("|");
}

function bindTerminalWorkspaceIndicators(root = document) {
  root.querySelectorAll?.("[data-terminal-workspace-info]").forEach((button) => {
    if (button.dataset.workspaceInfoBound) return;
    button.dataset.workspaceInfoBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const terminal = findTerminal(button.dataset.terminalWorkspaceInfo);
      const state = terminalWorkspaceDisplay(terminal);
      if (!terminal || !state) return;
      terminal.notice = state.explanation;
      terminal.updatedAt = Date.now();
      saveTerminals();
      if (activePage === "terminals" && typeof refreshPtyTerminalsDom === "function" && refreshPtyTerminalsDom()) {
        renderTopbar();
        if (typeof bindPtyTopbarControls === "function") bindPtyTopbarControls();
        return;
      }
      forceTerminalRender = true;
      render();
    });
  });
}

function refreshTerminalWorkspaceIndicator(article, terminal) {
  const expected = terminalWorkspaceSignature(terminal);
  const current = article.querySelector("[data-terminal-workspace-info]");
  if (!terminal.projectId) {
    current?.remove();
    return true;
  }
  if (current?.dataset.workspaceSignature === expected) return true;
  const html = terminalWorkspaceIndicator(terminal);
  if (current) current.outerHTML = html;
  else {
    const target = article.querySelector(".terminal-meta, .terminal-window-actions, .terminal-settings-button");
    if (!target) return false;
    target.insertAdjacentHTML(target.classList.contains("terminal-meta") ? "beforeend" : "beforebegin", html);
  }
  bindTerminalWorkspaceIndicators(article);
  return true;
}
