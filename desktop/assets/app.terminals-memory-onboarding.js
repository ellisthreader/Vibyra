let terminalMemoryDiscoveredVaultCache = null;

function terminalMemoryOnboardingHtml() {
  const disabled = terminalMemoryState.loading ? "disabled" : "";
  return `<section class="terminal-memory-onboarding" aria-labelledby="terminal-memory-start-title">
    <div class="terminal-memory-onboarding-copy">
      <span class="terminal-memory-onboarding-mark">${icon("archive")}</span>
      <div>
        <small>Project vault</small>
        <h2 id="terminal-memory-start-title">Add project memory</h2>
        <p>Bring in the notes that explain how this project works.</p>
      </div>
    </div>
    ${terminalMemoryDiscoveryHtml()}
    <div class="terminal-memory-onboarding-options">
      <label class="terminal-memory-import-option primary ${disabled ? "disabled" : ""}" data-terminal-memory-pick="vault">
        <input type="file" accept=".md,text/markdown" multiple webkitdirectory directory data-terminal-memory-vault-input ${disabled}>
        ${icon("folder")}
        <span><strong>Obsidian vault</strong><small>Keep folders and linked notes together.</small></span>
        ${icon("chevron")}
      </label>
      <label class="terminal-memory-import-option ${disabled ? "disabled" : ""}" data-terminal-memory-pick="markdown">
        <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple data-terminal-memory-markdown-input ${disabled}>
        ${icon("document")}
        <span><strong>Markdown files</strong><small>Import individual .md, .markdown, or text notes.</small></span>
        ${icon("chevron")}
      </label>
    </div>
    <p class="terminal-memory-onboarding-privacy">${icon("lock")} Only note content is imported. Local paths and Obsidian settings stay private.</p>
    <p class="terminal-memory-onboarding-status" data-terminal-memory-status aria-live="polite">${escapeHtml(terminalMemoryState.status)}</p>
  </section>`;
}

function terminalMemoryDiscoveryHtml() {
  if (!window.vibyraDesktopMemory?.discoverObsidian) return "";
  const status = terminalMemoryState.discoveryStatus;
  const vaults = terminalMemoryState.discoveredVaults;
  if (status === "found" && vaults.length) {
    return `<section class="terminal-memory-detected-vaults" aria-labelledby="terminal-memory-found-title">
      <small id="terminal-memory-found-title">Found on this computer</small>
      <div class="terminal-memory-detected-vault-list">
        ${vaults.map((vault) => `<button type="button" data-terminal-memory-discovered="${escapeAttribute(vault.id)}">
          ${icon("archive")}
          <span><strong>${escapeHtml(vault.name)}</strong><small>${escapeHtml(vault.location || "This computer")}</small></span>
          <b>${Number(vault.noteCount || 0)} ${Number(vault.noteCount || 0) === 1 ? "note" : "notes"}</b>
        </button>`).join("")}
      </div>
    </section>`;
  }
  if (status === "scanning" || status === "idle") {
    return `<div class="terminal-memory-vault-scan">${icon("search")}<span>Looking for Obsidian vaults...</span></div>`;
  }
  if (status === "error") {
    return `<button class="terminal-memory-find-vaults" type="button" data-terminal-memory-discover>
      ${icon("search")}
      <span><strong>Look for Obsidian vaults</strong><small>${escapeHtml(terminalMemoryState.discoveryError || "Automatic search was unavailable.")}</small></span>
      ${icon("chevron")}
    </button>`;
  }
  return "";
}

function bindTerminalMemoryOnboardingEvents(root) {
  bindTerminalMemoryNativePickers(root);
  root.querySelectorAll("[data-terminal-memory-discovered]").forEach((button) => {
    button.addEventListener("click", () => void importTerminalMemoryDiscoveredVault(button.dataset.terminalMemoryDiscovered));
  });
  root.querySelector("[data-terminal-memory-discover]")?.addEventListener("click", () => {
    terminalMemoryState.discoveryStatus = "idle";
    void discoverTerminalMemoryVaults();
  });
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
  void discoverTerminalMemoryVaults();
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

async function discoverTerminalMemoryVaults() {
  if (!window.vibyraDesktopMemory?.discoverObsidian || terminalMemoryState.discoveryStatus !== "idle") return;
  if (Array.isArray(terminalMemoryDiscoveredVaultCache)) {
    terminalMemoryState.discoveredVaults = terminalMemoryDiscoveredVaultCache;
    terminalMemoryState.discoveryStatus = terminalMemoryDiscoveredVaultCache.length ? "found" : "empty";
    terminalMemoryRefresh();
    return;
  }
  terminalMemoryState.discoveryStatus = "scanning";
  terminalMemoryState.discoveryError = "";
  terminalMemoryRefresh();
  try {
    const vaults = await window.vibyraDesktopMemory.discoverObsidian();
    terminalMemoryState.discoveredVaults = Array.isArray(vaults) ? vaults : [];
    terminalMemoryDiscoveredVaultCache = terminalMemoryState.discoveredVaults;
    terminalMemoryState.discoveryStatus = terminalMemoryState.discoveredVaults.length ? "found" : "empty";
  } catch (error) {
    terminalMemoryState.discoveryStatus = "error";
    terminalMemoryState.discoveryError = terminalMemoryError(error, "Choose a vault manually instead.");
  }
  terminalMemoryRefresh();
}
