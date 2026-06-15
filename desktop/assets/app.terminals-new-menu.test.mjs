import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync(new URL("./app.terminals-layout.js", import.meta.url), "utf8");
const modelStyles = readFileSync(new URL("./app.terminals.model.1.css", import.meta.url), "utf8");
const setupResponsiveStyles = readFileSync(new URL("./app.terminals.setup.2.css", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("./app.terminals-state.js", import.meta.url), "utf8");
const renderSource = readFileSync(new URL("./app.terminals-render.js", import.meta.url), "utf8");
const controlsSource = readFileSync(new URL("./app.terminals-controls.js", import.meta.url), "utf8");
const modelsSource = readFileSync(new URL("./app.terminals-models.js", import.meta.url), "utf8");
const ptyRuntimeSource = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
const ptySource = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const themeSource = readFileSync(new URL("./app.theme-terminals.css", import.meta.url), "utf8");
const themeControlsSource = readFileSync(new URL("./app.theme-terminals-controls.css", import.meta.url), "utf8");

test("new terminal menu is anchored to the plus button", () => {
  assert.match(layoutSource, /positionTerminalNewMenu\(\)/);
  assert.match(layoutSource, /buttonRect\.left/);
  assert.match(layoutSource, /buttonRect\.bottom \+ gap/);
  assert.match(layoutSource, /terminalFixedContainingRect\(menu\)/);
  assert.match(layoutSource, /viewportLeft - containingRect\.left/);
  assert.match(layoutSource, /viewportTop - containingRect\.top/);
  assert.match(layoutSource, /styles\.transform !== "none"/);
  assert.match(modelStyles, /left: var\(--terminal-new-menu-left/);
  assert.match(modelStyles, /top: var\(--terminal-new-menu-top/);
  assert.match(layoutSource, /terminal-model-picker--positioned/);
  assert.match(modelStyles, /visibility: hidden/);
  assert.match(modelStyles, /\.terminal-model-picker--positioned/);
  assert.doesNotMatch(modelStyles, /left: 50vw/);
});

test("terminal starter model picker overlays without moving the setup card", () => {
  assert.match(layoutSource, /positionTerminalSetupMenu\(\)/);
  assert.match(layoutSource, /\[data-terminal-setup-model-toggle\]/);
  assert.match(layoutSource, /buttonRect\.right - menuRect\.width/);
  assert.match(layoutSource, /companionLeft/);
  assert.match(layoutSource, /const viewportTop = buttonRect\.bottom \+ gap/);
  assert.match(layoutSource, /window\.innerHeight - viewportTop - edge/);
  assert.match(layoutSource, /--terminal-setup-menu-left/);
  assert.match(layoutSource, /--terminal-setup-menu-top/);
  assert.match(layoutSource, /--terminal-setup-menu-max-height/);
  assert.doesNotMatch(
    layoutSource.slice(layoutSource.indexOf("function positionTerminalSetupMenu"), layoutSource.indexOf("function positionTerminalNewMenu")),
    /buttonRect\.top - menuRect\.height/
  );
  assert.match(modelStyles, /\.terminal-model-select-wrap \.terminal-model-picker \{[\s\S]*position: fixed/);
  assert.match(modelStyles, /\.terminal-model-picker \{[\s\S]*display: flex/);
  assert.match(modelStyles, /\.terminal-model-picker \{[\s\S]*flex-direction: column/);
  assert.match(modelStyles, /--terminal-setup-menu-max-height/);
  assert.match(setupResponsiveStyles, /--terminal-setup-menu-max-height/);
  assert.match(setupResponsiveStyles, /\.terminal-model-select-wrap \.terminal-model-scroll \{[\s\S]*max-height: none/);
  assert.match(modelStyles, /\.terminal-model-select-wrap \.terminal-model-picker\.terminal-model-picker--positioned/);
  assert.doesNotMatch(modelStyles, /\.terminal-model-select-wrap \.terminal-model-picker \{[\s\S]*position: static/);
});

test("PTY controls do not double-bind terminal menu buttons", () => {
  assert.match(controlsSource, /function bindTerminalClick/);
  assert.match(controlsSource, /dataset\.terminalClickBound/);
  assert.match(ptyRuntimeSource, /dataset\.terminalClickBound \|\| node\.dataset\.ptyClickBound/);
});

test("terminal options group user-facing context and separate close", () => {
  const optionsSource = ptySource.slice(
    ptySource.indexOf("settingsMenu = function ptySettingsMenu"),
    ptySource.indexOf("terminalTopbarSubtitle = function"),
  );
  assert.match(ptySource, /data-terminal-rename-form/);
  assert.match(controlsSource, /method: "PATCH"/);
  assert.match(controlsSource, /bindTerminalRenameControls/);
  assert.match(optionsSource, /aria-label="Save terminal name"/);
  assert.match(optionsSource, /"Project"/);
  assert.match(optionsSource, /"Workspace"/);
  assert.match(optionsSource, /"Access"/);
  assert.match(optionsSource, /terminal-menu-technical/);
  assert.match(optionsSource, /terminal-close-row/);
  assert.doesNotMatch(optionsSource, /terminalTokenSourcePanel/);
  assert.doesNotMatch(optionsSource, />Advanced</);
});

test("terminal chrome uses Vibyra purple instead of provider green", () => {
  assert.match(themeSource, /\.terminal-provider-openai \{ --terminal-accent: #8b5cff/);
  assert.match(themeSource, /\.terminal-menu,[\s\S]*--terminal-accent: #8b5cff/);
  assert.match(themeControlsSource, /--terminal-status-running: #8b5cff/);
});

test("terminal setup persists and forwards model-aware reasoning effort", () => {
  assert.match(stateSource, /vibyra\.desktop\.terminalSetupEffort/);
  assert.match(renderSource, /data-terminal-setup-effort/);
  assert.match(renderSource, /Reasoning effort/);
  assert.match(modelsSource, /supportsReasoning/);
  assert.match(modelsSource, /label: "Low"/);
  assert.match(modelsSource, /label: "Medium"/);
  assert.match(modelsSource, /label: "High"/);
  assert.match(modelsSource, /label: "Extra high"/);
  assert.match(modelsSource, /return "default"/);
  assert.match(controlsSource, /localStorage\.setItem\(setupEffortKey, setupEffort\)/);
  assert.match(controlsSource, /terminalEffortForModel\(selectedSetupModel\(\), setupEffort\)/);
});
