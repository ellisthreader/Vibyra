import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./app.terminals-memory-fullscreen.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./app.terminals-memory-fullscreen.css", import.meta.url), "utf8");
const contentStyles = await readFile(new URL("./app.terminals-memory-fullscreen-content.css", import.meta.url), "utf8");
const renderSource = await readFile(new URL("./app.terminals-memory-render.js", import.meta.url), "utf8");

test("expanded Memory renders a full Obsidian-style application shell", () => {
  assert.match(source, /terminal-memory-appbar/);
  assert.match(source, /terminal-memory-ribbon/);
  assert.match(source, /terminal-memory-vault-pane/);
  assert.match(source, /terminal-memory-main-pane/);
  assert.match(source, /terminal-memory-links-pane/);
  assert.match(source, /terminal-memory-app-import-menu/);
  assert.doesNotMatch(source, /data-terminal-memory-ai|sparkles/);
  assert.doesNotMatch(source, /data-terminal-memory-new-(note|folder)|New (note|folder)/i);
  assert.match(styles, /grid-template-columns: 42px clamp\(220px, 20vw, 300px\) minmax\(0, 1fr\) clamp\(190px, 17vw, 250px\)/);
});

test("fullscreen explorer and links use canonical vault data", () => {
  assert.match(source, /terminalMemoryTreeHtml\(\)/);
  assert.match(source, /terminalMemoryGraphModel\(terminalMemoryState\.nodes\)/);
  assert.match(source, /data-terminal-memory-open-node/);
  assert.match(contentStyles, /terminal-memory-links-pane/);
});

test("fullscreen Notes stays inside the content row without top clipping", () => {
  assert.match(contentStyles, /\.terminal-memory-pane-content\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\);[^}]*overflow:\s*hidden/s);
  assert.match(contentStyles, /\.terminal-memory-pane-content > \.terminal-memory-graph,[\s\S]*\.terminal-memory-pane-content > \.terminal-memory-document,[\s\S]*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(contentStyles, /\.terminal-memory-pane-content > \.terminal-memory-graph,[\s\S]*\{[^}]*height:\s*100%/s);
});

test("compact Memory delegates to the expanded renderer only while fullscreen", () => {
  assert.match(renderSource, /terminalMemoryIsFullscreen\(\)/);
  assert.match(renderSource, /terminalMemoryFullscreenHtml\(terminal\)/);
  assert.match(renderSource, /terminalMemoryImportMenuHtml/);
  assert.doesNotMatch(renderSource, /data-terminal-memory-ai|sparkles/);
  assert.doesNotMatch(renderSource, /data-terminal-memory-new-(note|folder)|New (note|folder)/i);
});
