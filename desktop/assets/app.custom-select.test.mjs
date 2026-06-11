import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const assetsDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = dirname(assetsDirectory);
const customSelectSource = readFileSync(join(assetsDirectory, "app.custom-select.js"), "utf8");

test("desktop production source contains no native dropdown controls", () => {
  const forbidden = [
    /<\s*select\b/i,
    /<\s*option\b/i,
    /<\s*optgroup\b/i,
    /<\s*datalist\b/i,
    /createElement\(\s*["']select["']\s*\)/i,
    /\bHTMLSelectElement\b/
  ];
  const offenders = [];
  for (const file of desktopSourceFiles(desktopDirectory)) {
    const source = readFileSync(file, "utf8");
    if (forbidden.some((pattern) => pattern.test(source))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("custom dropdown renders an accessible button and listbox", () => {
  const context = vm.createContext({
    escapeAttribute: escapeHtml,
    escapeHtml,
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    Math
  });
  vm.runInContext(customSelectSource, context);
  const html = vm.runInContext(`customSelectHtml({
    id: "test-picker",
    ariaLabel: "Test picker",
    value: "two",
    options: [
      { value: "one", label: "One", group: "Group" },
      { value: "two", label: "Two", group: "Group" }
    ],
    inputAttributes: { "data-test-value": true }
  })`, context);
  assert.match(html, /data-custom-select-trigger/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /role="option"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /type="hidden"/);
  assert.doesNotMatch(html, /<\s*select\b/i);
});

test("custom dropdown supports keyboard navigation and stable option patching", () => {
  assert.match(customSelectSource, /ArrowDown/);
  assert.match(customSelectSource, /ArrowUp/);
  assert.match(customSelectSource, /Home/);
  assert.match(customSelectSource, /End/);
  assert.match(customSelectSource, /Escape/);
  assert.match(customSelectSource, /dataset\.customSelectOptions !== signature/);
  assert.match(customSelectSource, /new Event\("change", \{ bubbles: true \}\)/);
});

test("profile, terminal settings, and preview use the shared custom dropdown", () => {
  const sources = [
    "app.profile-render.js",
    "app.terminals-render.js",
    "app.terminals-test-view.js"
  ].map((name) => readFileSync(join(assetsDirectory, name), "utf8"));
  for (const source of sources) assert.match(source, /customSelectHtml\(/);
  assert.match(readFileSync(join(assetsDirectory, "app.profile-actions.js"), "utf8"), /bindCustomSelects\(root\)/);
  assert.match(readFileSync(join(assetsDirectory, "app.terminals-controls.js"), "utf8"), /bindCustomSelects\(root\)/);
  assert.match(readFileSync(join(assetsDirectory, "app.terminals-test.js"), "utf8"), /bindCustomSelects\(toolbar\)/);
});

function desktopSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "vendor" || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...desktopSourceFiles(path));
      continue;
    }
    if (entry.name.includes(".test.") || entry.name.startsWith("vendor.")) continue;
    if ([".cjs", ".html", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
