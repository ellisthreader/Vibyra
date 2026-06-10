function screenshotEditorMarkup() {
  return `<section class="screenshot-editor" data-screenshot-editor role="dialog" aria-modal="true" aria-labelledby="screenshot-title">
    <header class="screenshot-header">
      <div class="screenshot-title">
        <button class="screenshot-icon-button" type="button" data-screenshot-close aria-label="Close screenshot editor">${icon("close")}</button>
        <span><strong id="screenshot-title">Screenshot</strong><small>Crop and mark up your capture</small></span>
      </div>
      <div class="screenshot-tools" role="toolbar" aria-label="Screenshot tools">
        ${screenshotToolButton("crop", "Crop", "contract")}
        ${screenshotToolButton("box", "Box", "square")}
        ${screenshotToolButton("pen", "Pen", "edit")}
        <span class="screenshot-divider"></span>
        ${["#ff6677", "#8b5cff", "#f8f7fe", "#38bdf8"].map(screenshotColorButton).join("")}
      </div>
      <div class="screenshot-history">
        <button class="screenshot-icon-button" type="button" data-screenshot-undo aria-label="Undo" title="Undo (Ctrl+Z)">${screenshotUndoIcon()}</button>
        <button class="screenshot-text-button" type="button" data-screenshot-reset>Reset</button>
      </div>
    </header>
    <main class="screenshot-stage">
      <div class="screenshot-canvas-shell"><canvas data-screenshot-canvas aria-label="Screenshot editing canvas"></canvas></div>
      <p class="screenshot-hint" data-screenshot-hint>Drag to crop</p>
    </main>
    <footer class="screenshot-footer">
      <span class="screenshot-status" data-screenshot-status aria-live="polite">F9 captures from anywhere</span>
      <div class="screenshot-actions">
        <button class="screenshot-secondary-button" type="button" data-screenshot-apply-crop hidden>Apply crop</button>
        <button class="screenshot-secondary-button" type="button" data-screenshot-copy>${icon("copy")}<span>Copy</span></button>
        <button class="screenshot-primary-button" type="button" data-screenshot-save>${icon("download")}<span>Save</span></button>
      </div>
    </footer>
  </section>`;
}

function screenshotToolButton(tool, label, iconName) {
  return `<button class="screenshot-tool" type="button" data-screenshot-tool="${tool}" aria-pressed="false">${icon(iconName)}<span>${label}</span></button>`;
}

function screenshotColorButton(color) {
  return `<button class="screenshot-color" type="button" data-screenshot-color="${color}" aria-label="Use ${color}" aria-pressed="false" style="--screenshot-color:${color}"></button>`;
}

function screenshotUndoIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 8 5 12l4 4M5 12h8a6 6 0 1 1 0 12"/></svg>`;
}

function ensureScreenshotEditor() {
  let root = document.querySelector("[data-screenshot-editor]");
  if (root) return root;
  const host = document.createElement("div");
  host.className = "screenshot-editor-host";
  host.innerHTML = screenshotEditorMarkup();
  document.body.append(host);
  root = host.firstElementChild;
  bindScreenshotEditorActions(root);
  bindScreenshotCanvasTools();
  return root;
}

function updateScreenshotControls() {
  const root = document.querySelector("[data-screenshot-editor]");
  if (!root) return;
  root.querySelectorAll("[data-screenshot-tool]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.screenshotTool === screenshotState.tool));
  });
  root.querySelectorAll("[data-screenshot-color]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.screenshotColor === screenshotState.color));
  });
  const undo = root.querySelector("[data-screenshot-undo]");
  if (undo) undo.disabled = screenshotState.history.length <= 1;
  const apply = root.querySelector("[data-screenshot-apply-crop]");
  if (apply) apply.hidden = !screenshotState.crop;
  const hint = root.querySelector("[data-screenshot-hint]");
  if (hint) hint.textContent = {
    crop: screenshotState.crop ? "Apply the crop or drag again" : "Drag to crop",
    box: "Drag to frame an area",
    pen: "Draw to highlight anything"
  }[screenshotState.tool];
}

function bindScreenshotEditorActions(root) {
  root.querySelector("[data-screenshot-close]")?.addEventListener("click", closeScreenshotEditor);
  root.querySelector("[data-screenshot-undo]")?.addEventListener("click", () => void undoScreenshotMutation());
  root.querySelector("[data-screenshot-reset]")?.addEventListener("click", () => void resetScreenshotDocument());
  root.querySelector("[data-screenshot-apply-crop]")?.addEventListener("click", () => void applyScreenshotCrop());
  root.querySelector("[data-screenshot-copy]")?.addEventListener("click", () => void copyScreenshot());
  root.querySelector("[data-screenshot-save]")?.addEventListener("click", () => void saveScreenshot());
  root.querySelectorAll("[data-screenshot-tool]").forEach((button) => {
    button.addEventListener("click", () => selectScreenshotTool(button.dataset.screenshotTool));
  });
  root.querySelectorAll("[data-screenshot-color]").forEach((button) => {
    button.addEventListener("click", () => selectScreenshotColor(button.dataset.screenshotColor));
  });
}
