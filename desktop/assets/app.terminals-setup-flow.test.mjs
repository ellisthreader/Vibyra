import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ptySource = await readFile(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const controlsSource = await readFile(new URL("./app.terminals-controls.js", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
const groupSource = await readFile(new URL("./app.terminals-project-groups.js", import.meta.url), "utf8");
const storeSource = await readFile(new URL("./app.terminals-store.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./app.terminals-setup-flow.css", import.meta.url), "utf8");
const setupStyles = await readFile(new URL("./app.terminals.setup.2.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("terminal setup opens with clear independent or coordinated choices", () => {
  assert.match(ptySource, /let terminalSetupStep = "mode"/);
  assert.match(ptySource, /terminalSetupStep === "mode"/);
  assert.match(ptySource, /choice\("solo", "grid", "Independent agents"/);
  assert.match(ptySource, /choice\("team", "teamwork", "Coordinated team"/);
  assert.match(ptySource, /Each agent gets its own terminal and works on a separate task/);
  assert.match(ptySource, /Give Vibyra one goal; it assigns roles and coordinates the agents/);
  assert.doesNotMatch(ptySource, /terminal-setup-mode-arrow/);
  assert.match(ptySource, /How should your AI agents work\?/);
  assert.doesNotMatch(ptySource, />Solo<|>Team</);
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

test("Solo owns batch count while Team uses automatic or explicit planned size", () => {
  assert.match(ptySource, /team \? terminalTeamSetupHtml\(launchCount, setupCapacity\) : ""/);
  assert.match(ptySource, /team \? "" : terminalSoloSetupHtml\(launchCount, setupCapacity\)/);
  assert.match(ptySource, /function terminalSoloSetupHtml/);
  assert.match(ptySource, /terminalSetupGridPreview\(total\)/);
  assert.match(ptySource, /\[1, 2, 3, 4, 6, 12\]/);
  assert.match(ptySource, /data-terminal-custom-count/);
  assert.match(controlsSource, /createTerminals\(count, setupModel, launchOptions\)/);
  assert.match(storeSource, /function revealTerminalBatch\(count = 1\)/);
  assert.match(storeSource, /createTerminals[\s\S]*revealTerminalBatch\(total\)/);
  assert.match(ptySource, /const staggerStarts = total > 1/);
  assert.match(ptySource, /deferStart: staggerStarts/);
  assert.match(ptySource, /schedulePtyBatchStarts\(created\)/);
  assert.match(ptySource, /setTimeout\(start, Math\.min\(index \* delayMs, 4500\)\)/);
  assert.match(storeSource, /terminalLayout = "grid"/);
  assert.match(storeSource, /fullscreenTerminalId = ""/);
  assert.match(storeSource, /localStorage\.removeItem\(terminalFullscreenKey\)/);
  assert.match(storeSource, /localStorage\.setItem\(layoutKey, terminalLayout\)/);
  assert.match(controlsSource, /teamSize: setupTeamSize/);
  assert.match(controlsSource, /count = teamPlan\.teamSize/);
  assert.match(controlsSource, /\[data-terminal-team-size\]/);
  assert.match(controlsSource, /Math\.min\(count, capacity\)/);
});

test("combined Team setup keeps workspace safety and reasoning visible", () => {
  assert.match(ptySource, /<p>Project<\/p>/);
  assert.match(ptySource, /<p>Model<\/p>/);
  assert.doesNotMatch(ptySource, /data-terminal-objective/);
  assert.match(ptySource, /terminalTeamSetupHtml/);
  assert.match(ptySource, /data-terminal-setup-go="\$\{step\.key\}"/);
  assert.doesNotMatch(ptySource, /data-terminal-setup-go="details"/);
  assert.doesNotMatch(ptySource, /Team workspace|Set up your terminals/);
  assert.match(ptySource, /const effort = terminalSetupEffortPicker\(model\)/);
  assert.match(ptySource, /terminalTeamSizePicker\(setupCapacity\)/);
  assert.match(ptySource, /terminalWorkspaceSetupPicker\(team \? 2 : launchCount\)/);
  assert.match(ptySource, /\? `\$\{terminalTeamSizePicker\(setupCapacity\)\}\$\{access\}\$\{payment\}`/);
  assert.match(ptySource, /: payment;/);
  assert.match(ptySource, /\$\{workspace\}/);
  assert.match(ptySource, /\$\{effort\}/);
  assert.match(ptySource, /Advanced options/);
  assert.match(ptySource, /data-terminal-advanced-toggle/);
  assert.match(ptySource, /aria-expanded="\$\{terminalSetupAdvancedOpen\}"/);
  assert.match(controlsSource, /await requestTerminalTeamPlan/);
  assert.match(controlsSource, /createTerminalTeam\(teamPlan, setupModel/);
  assert.match(controlsSource, /previewTerminalTeamPlan\(root, teamPlan\)/);
  assert.match(ptySource, /data-terminal-team-cancel/);
  assert.match(controlsSource, /cancelTerminalTeamPlanning\(root\)/);
  assert.doesNotMatch(controlsSource, /data-terminal-objective/);
  assert.match(styles, /\.terminal-setup \.terminal-project-select/);
  assert.match(styles, /background: transparent/);
});

test("advanced setup options animate open and closed while preserving setup state", () => {
  assert.match(ptySource, /let terminalSetupAdvancedOpen = false/);
  assert.match(controlsSource, /terminalSetupAdvancedOpen = !terminalSetupAdvancedOpen/);
  assert.match(controlsSource, /classList\.toggle\("open", terminalSetupAdvancedOpen\)/);
  assert.match(setupStyles, /\.terminal-setup-advanced-panel\s*\{[\s\S]*grid-template-rows: 0fr/);
  assert.match(setupStyles, /\.terminal-setup-advanced\.open \.terminal-setup-advanced-panel\s*\{[\s\S]*grid-template-rows: 1fr/);
  assert.match(setupStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("combined setup applies one truthful access mode to the whole terminal batch", () => {
  assert.match(ptySource, /terminalFullAccessSupported/);
  assert.match(ptySource, /\["codex", "claude", "gemini", "qwen", "kimi", "mistral", "grok", "vibyra-agent"\]\.includes\(runtime\)/);
  assert.match(ptySource, /<p>Access<\/p>/);
  assert.match(ptySource, /Keeps approvals and workspace sandboxing enabled/);
  assert.match(ptySource, /Disables approvals and sandboxing for every terminal in this batch/);
  assert.match(controlsSource, /permissionMode: terminalPermissionModeForSetup/);
  assert.match(controlsSource, /\[data-terminal-permission-mode\]/);
  assert.match(controlsSource, /localStorage\.setItem\(setupPermissionModeKey, setupPermissionMode\)/);
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
