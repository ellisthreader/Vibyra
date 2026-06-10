import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const renderSource = await readFile(new URL("./app.terminals-render.js", import.meta.url), "utf8");
const ptySource = await readFile(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const stabilitySource = await readFile(new URL("./app.terminals-setup-stability.js", import.meta.url), "utf8");
const setupStyles = await readFile(new URL("./app.terminals.setup.1.css", import.meta.url), "utf8");
const companionBaseStyles = await readFile(new URL("./app.terminals-companion.css", import.meta.url), "utf8");
const companionStyles = await readFile(new URL("./app.terminals-companion-tools.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("terminal setup preferences preserve the outer setup and companion DOM", () => {
  assert.match(renderSource, /patchTerminalSetupPanel\(existingSetup\)/);
  assert.match(stabilitySource, /currentProgress\.querySelector/);
  assert.match(stabilitySource, /if \(currentStep !== nextStep\) currentProgress\.replaceWith\(nextProgress\)/);
  assert.match(stabilitySource, /currentFlow\.classList\.toggle\("terminal-setup-flow--mode"/);
  assert.match(stabilitySource, /currentPanel\.replaceWith\(nextPanel\)/);
  assert.match(stabilitySource, /classList\.toggle\("terminal-setup--mode"/);
  assert.match(stabilitySource, /classList\.toggle\("terminal-setup--configure"/);
  assert.doesNotMatch(stabilitySource, /setup\.outerHTML|nodes\.content\.innerHTML/);
  assert.match(appSource, /app\.terminals-setup-stability\.js/);
});

test("terminal setup stays safely centered while conditional settings change", () => {
  assert.match(ptySource, /terminal-setup-stage/);
  assert.match(setupStyles, /\.terminal-setup-stage\s*\{[\s\S]*align-items: safe center[\s\S]*overflow: auto/);
  assert.match(setupStyles, /\.terminal-setup\s*\{[\s\S]*overflow: hidden/);
  assert.match(setupStyles, /margin: 24px 0/);
  assert.doesNotMatch(companionStyles, /\.terminal-setup--with-companion \.terminal-setup-panel \{[^}]*align-self: start/);
});

test("setup and opened terminals use the same attached companion tracks", () => {
  assert.match(companionBaseStyles, /\.terminal-page,\s*\.terminal-setup\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 0/);
  assert.match(companionBaseStyles, /\.terminal-companion\s*\{[\s\S]*height: 100%/);
  assert.doesNotMatch(companionBaseStyles, /\.terminal-companion\s*\{\s*animation:/);
});
