import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(
  new URL("./app.terminals-chrome-polish.css", import.meta.url),
  "utf8"
);

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "m").exec(styles)?.[1] || "";
}

test("polish covers terminal chrome and setup interaction surfaces", () => {
  [
    ".terminal-tabs",
    ".terminal-tab.active",
    ".terminal-focus-head",
    ".terminal-tile-head",
    ".terminal-status.running",
    ".terminal-window-actions > button",
    ".terminal-notice",
    ".terminal-setup-panel"
  ].forEach((selector) => assert.match(styles, new RegExp(selector.replaceAll(".", "\\."))));

  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});

test("grid and PTY hosts preserve zero-gap edge-to-edge rendering", () => {
  assert.match(rule(".terminal-pty-lines"), /padding:\s*0\s*!important/);
  assert.match(rule(".grid-mode .terminal-stage"), /gap:\s*0/);

  const tileRule = rule(".grid-mode .terminal-tile");
  assert.match(tileRule, /border:\s*0/);
  assert.match(tileRule, /border-radius:\s*0/);
});

test("motion is restrained and disabled for reduced-motion users", () => {
  assert.match(styles, /@keyframes terminal-polish-notice-in/);
  assert.match(styles, /@keyframes terminal-polish-setup-in/);

  const reducedMotion = styles.match(
    /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/
  )?.[1] || "";
  assert.match(reducedMotion, /animation:\s*none/);
  assert.match(reducedMotion, /transition:\s*none/);
  assert.doesNotMatch(styles, /backdrop-filter|filter:\s*blur|text-shadow/i);
});

test("active terminal chrome stays neutral and avoids decorative gradients", () => {
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(rule(".terminal-tab.active"), /var\(--terminal-accent/);
  assert.match(rule(".terminal-status.running"), /box-shadow:\s*none/);
});

test("polish never transforms or sizes xterm-owned elements", () => {
  assert.doesNotMatch(styles, /\.terminal-xterm|\.xterm(?:-screen|-viewport|-rows)?\b/);
  assert.doesNotMatch(styles, /contain:\s*(?:size|layout)/);
});
