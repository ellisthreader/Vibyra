import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ptySource = await readFile(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const controlsSource = await readFile(new URL("./app.terminals-controls.js", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
const groupSource = await readFile(new URL("./app.terminals-project-groups.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./app.terminals-setup-flow.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("terminal setup opens with a dedicated Solo or Team choice", () => {
  assert.match(ptySource, /let terminalSetupStep = "mode"/);
  assert.match(ptySource, /terminalSetupStep === "mode"/);
  assert.match(ptySource, /choice\("solo"/);
  assert.match(ptySource, /choice\("team"/);
  assert.match(ptySource, /Best for focused builds, fixes, and quick changes/);
  assert.match(ptySource, /Best for larger work split across multiple agents/);
  assert.doesNotMatch(ptySource, /terminal-setup-mode-arrow/);
  assert.match(ptySource, /How do you want to work\?/);
  assert.match(controlsSource, /\[data-terminal-setup-mode\]/);
});

test("setup progress sits above the centered setup card and never enters the nav", () => {
  assert.match(ptySource, /label: "Workspace"/);
  assert.match(ptySource, /label: "Setup"/);
  assert.match(ptySource, /label: "Terminals"/);
  assert.match(ptySource, /terminalSetupStep = "setup"/);
  assert.match(controlsSource, /\["mode", "setup"\]/);
  assert.match(ptySource, /terminal-setup-flow/);
  assert.match(ptySource, /\$\{terminalSetupProgress\("mode"\)\}/);
  assert.match(ptySource, /\$\{terminalSetupProgress\("setup"\)\}/);
  assert.doesNotMatch(ptySource, /terminalSetupProgress\("terminals"\)/);
  assert.doesNotMatch(ptySource, /terminal-tabs-progress/);
  assert.doesNotMatch(runtimeSource, /\.terminal-tabs-progress \[data-terminal-setup-go\]/);
  assert.match(styles, /\.terminal-setup-flow/);
  assert.match(styles, /grid-template-columns: repeat\(3/);
  assert.match(styles, /grid-template-rows: 28px auto/);
  assert.match(styles, /terminal-setup-step-enter/);
  assert.match(styles, /box-shadow: 0 0 0 4px/);
});

test("combined setup offers one through twelve with the real grid preview", () => {
  assert.match(ptySource, /Array\.from\(\{ length: maxTerminals \}/);
  assert.match(ptySource, /terminalSetupGridPreview\(launchCount\)/);
  assert.match(ptySource, /terminalGridMeta\(total\)/);
  assert.match(ptySource, /terminal-setup-grid-preview/);
  assert.match(styles, /--setup-preview-cols/);
  assert.match(styles, /--setup-preview-rows/);
});

test("combined setup keeps reasoning visible and token settings in advanced options", () => {
  assert.match(ptySource, /Terminal amount/);
  assert.match(ptySource, /<p>Project<\/p>/);
  assert.match(ptySource, /<p>Model<\/p>/);
  assert.doesNotMatch(ptySource, /What are we building\?|data-terminal-objective/);
  assert.match(ptySource, /data-terminal-setup-go="\$\{step\.key\}"/);
  assert.doesNotMatch(ptySource, /data-terminal-setup-go="details"/);
  assert.doesNotMatch(ptySource, /Team workspace|Set up your terminals/);
  assert.match(ptySource, /const effort = terminalSetupEffortPicker\(model\)/);
  assert.match(ptySource, /\$\{effort\}/);
  assert.match(ptySource, /Advanced options/);
  assert.match(ptySource, /<details class="terminal-setup-advanced">/);
  assert.match(ptySource, /const advanced = terminalTokenSourcePanel/);
  assert.doesNotMatch(ptySource, /const advanced = `\$\{terminalSetupEffortPicker/);
  assert.doesNotMatch(controlsSource, /data-terminal-objective|initialPrompt:/);
  assert.match(styles, /\.terminal-setup \.terminal-project-select/);
  assert.match(styles, /background: transparent/);
});

test("every new batch resets to the mode choice and loads its focused styles", () => {
  assert.match(groupSource, /openTerminalBatchSetup[\s\S]*resetTerminalSetupFlow/);
  assert.match(styles, /\.terminal-setup-mode-grid/);
  assert.match(styles, /\.terminal-setup-mode-card/);
  assert.doesNotMatch(styles, /\.terminal-setup-mode-card \+ \.terminal-setup-mode-card/);
  assert.match(styles, /\.terminal-setup-mode-card \{[\s\S]*background: transparent/);
  assert.match(styles, /\.terminal-setup-mode-card \{[\s\S]*border: 0/);
  assert.match(styles, /\.terminal-setup-mode-card \{[\s\S]*box-shadow: none/);
  assert.match(styles, /\.terminal-setup-mode-icon svg \{[\s\S]*height: 38px/);
  assert.match(styles, /\.terminal-setup-mode-copy strong \{[\s\S]*font-size: 21px/);
  assert.doesNotMatch(styles, /\.terminal-setup-mode-arrow/);
  assert.doesNotMatch(styles, /radial-gradient|terminal-setup-mode-art/);
  assert.doesNotMatch(ptySource, /terminal-setup-mode-art/);
  assert.match(styles, /@keyframes terminal-setup-enter/);
  assert.match(styles, /@keyframes terminal-setup-card-enter/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(appSource, /app\.terminals-setup-flow\.css/);
});
