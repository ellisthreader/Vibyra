function terminalMemoryOnboardingHtml() {
  const disabled = terminalMemoryState.loading ? "disabled" : "";
  return `<section class="terminal-memory-onboarding" aria-labelledby="terminal-memory-start-title">
    <div class="terminal-memory-onboarding-copy">
      <span class="terminal-memory-onboarding-mark">${icon("archive")}</span>
      <div>
        <small>Project vault</small>
        <h2 id="terminal-memory-start-title">Import your project memory</h2>
        <p>Choose an Obsidian vault or folder of Markdown notes.</p>
      </div>
    </div>
    <div class="terminal-memory-onboarding-options">
      <label class="terminal-memory-import-option primary ${disabled ? "disabled" : ""}" data-terminal-memory-pick="vault">
        <input type="file" accept=".md,text/markdown" multiple webkitdirectory directory data-terminal-memory-vault-input ${disabled}>
        ${icon("share")}
        <span><strong>Import</strong><small>Select your memory vault folder.</small></span>
        ${icon("chevron")}
      </label>
    </div>
    <p class="terminal-memory-onboarding-privacy">${icon("lock")} Local folder paths and Obsidian settings are never uploaded.</p>
    <p class="terminal-memory-onboarding-status" data-terminal-memory-status aria-live="polite">${escapeHtml(terminalMemoryState.status)}</p>
  </section>`;
}

function bindTerminalMemoryOnboardingEvents(root) {
  bindTerminalMemoryNativePickers(root);
  const onboarding = root.querySelector(".terminal-memory-onboarding");
  onboarding?.addEventListener("dragover", (event) => {
    event.preventDefault();
    onboarding.classList.add("dragging");
  });
  onboarding?.addEventListener("dragleave", () => onboarding.classList.remove("dragging"));
  onboarding?.addEventListener("drop", (event) => {
    event.preventDefault();
    onboarding.classList.remove("dragging");
    void importTerminalMemoryFiles(event.dataTransfer?.files, "markdown");
  });
}

function bindTerminalMemoryNativePickers(root) {
  if (!window.vibyraDesktopMemory?.pick) return;
  root.querySelectorAll("[data-terminal-memory-pick]").forEach((control) => {
    if (control.dataset.terminalMemoryNativeBound) return;
    control.dataset.terminalMemoryNativeBound = "1";
    const input = control.querySelector("input[type=file]");
    if (input) {
      input.disabled = true;
      input.hidden = true;
    }
    control.addEventListener("click", (event) => {
      event.preventDefault();
      void pickTerminalMemoryFiles(control.dataset.terminalMemoryPick || "vault");
    });
  });
}
