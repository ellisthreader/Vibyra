function terminalTestTopbarHtml() {
  const presets = terminalTestPresetOptions();
  return `<header class="terminal-test-toolbar terminal-test-toolbar--sidebar" data-terminal-test-toolbar aria-label="Live preview controls">
    <div class="terminal-test-toolbar-center">
      <div class="terminal-test-device-control">${icon("desktop")}${customSelectHtml({ id: "terminal-test-preset", ariaLabel: "Preview resolution", value: terminalTestPreset, options: presets, inputAttributes: { "data-terminal-test-preset": true } })}<small data-terminal-test-auto hidden>Auto</small></div>
      <div class="terminal-test-app-control" data-terminal-test-app-control hidden>${icon("grid")}${customSelectHtml({ id: "terminal-test-target", ariaLabel: "Detected app", value: terminalTestTargetId, options: [], inputAttributes: { "data-terminal-test-target": true } })}</div>
      <div class="terminal-test-custom" data-terminal-test-custom><label>W<input type="number" min="240" max="3840" data-terminal-test-width></label><label>H<input type="number" min="320" max="2160" data-terminal-test-height></label></div>
      <button class="terminal-test-rotate" type="button" data-terminal-test-rotate aria-label="Rotate preview" title="Rotate preview">${icon("rotate-device")}</button>
    </div>
    <div class="terminal-test-actions">
      <span class="terminal-test-canvas-zoom" aria-label="Preview zoom controls"><button type="button" data-terminal-test-zoom-out aria-label="Zoom out" title="Zoom out">${icon("minus")}</button><button type="button" data-terminal-test-fit aria-label="Fit preview" title="Fit preview"><output data-terminal-test-zoom-value>Fit</output></button><button type="button" data-terminal-test-zoom-in aria-label="Zoom in" title="Zoom in">${icon("plus")}</button></span>
      <details class="terminal-test-address"><summary aria-label="Preview address" title="Preview address">${icon("link")}</summary><form data-terminal-test-url-form><label>Preview address</label><div><input data-terminal-test-url inputmode="url" placeholder="http://localhost:3000" aria-label="Preview URL"><button type="submit">Load</button></div></form></details>
      <button type="button" data-terminal-test-refresh aria-label="Refresh preview" title="Refresh">${icon("refresh")}</button>
    </div>
  </header>`;
}

function terminalTestWorkspaceHtml() {
  return `<section class="terminal-test-workspace" data-terminal-test-workspace aria-label="Live preview">
    ${terminalTestTopbarHtml()}
    <div class="terminal-test-stage">
    <div class="terminal-test-canvas" data-terminal-test-canvas>
      <div class="terminal-test-frame" data-terminal-test-frame><iframe data-terminal-test-frame-content title="Project preview" referrerpolicy="no-referrer"></iframe><div class="terminal-test-inspector" data-terminal-test-inspector hidden></div>${terminalTestRunnerHtml()}</div>
      <div class="terminal-test-empty" data-terminal-test-empty><span class="terminal-test-empty-icon">${icon("preview")}</span><strong data-terminal-test-empty-title></strong><p data-terminal-test-empty-message></p><div class="terminal-test-targets" data-terminal-test-targets></div></div>
      <footer class="terminal-test-footer" data-terminal-test-footer hidden><button class="terminal-test-run" type="button" data-terminal-test-start-server><span>Run preview</span></button><small data-terminal-test-approval-note>Runs locally only after your approval.</small></footer>
    </div>
    ${terminalTestConsoleHtml()}
    </div>
  </section>`;
}

function terminalTestPresetOptions() {
  return terminalTestPresets.map((preset) => ({
    value: preset.key,
    label: `${preset.label} · ${preset.width} × ${preset.height}`,
    group: preset.group
  }));
}
