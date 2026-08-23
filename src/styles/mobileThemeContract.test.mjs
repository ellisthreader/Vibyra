import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
Module._extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  module._compile(output, filename);
};

const { darkColors, lightColors } = Module.createRequire(import.meta.url)(path.join(directory, "theme.ts"));

const expectedDark = {
  background: "#0E0F12", rail: "#13151A", surface: "#181A20", elevated: "#20232A",
  workspace: "#101115", surfaceTint: "#1B1E25", border: "#2B2F38", text: "#F5F7FA",
  muted: "#A6ADBA", dim: "#747C8A", accent: "#5B7CFA", accentHover: "#7490FF",
  accentSoft: "rgba(91, 124, 250, 0.14)", action: "#4667E8", actionPressed: "#3D5ACF",
  onAction: "#FFFFFF", success: "#37C78A", warning: "#E8A94B", error: "#F06472"
};
const expectedLight = {
  background: "#F4F5F7", rail: "#FAFAFB", surface: "#FFFFFF", elevated: "#F0F2F5",
  workspace: "#FBFBFC", surfaceTint: "#F3F5FA", border: "#D9DDE4", text: "#171A21",
  muted: "#626A78", dim: "#7A8290", accent: "#315BD8", accentHover: "#2449B8",
  accentSoft: "rgba(49, 91, 216, 0.09)", action: "#315BD8", actionPressed: "#2449B8",
  onAction: "#FFFFFF", success: "#147A57", warning: "#A96812", error: "#C9364B"
};

function channel(hex, offset) { return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255; }
function luminance(hex) {
  const linear = (value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(channel(hex, 1)) + 0.7152 * linear(channel(hex, 3)) + 0.0722 * linear(channel(hex, 5));
}
function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

test("mobile palettes expose identical semantic roles and exact approved values", () => {
  assert.deepEqual(Object.keys(darkColors).sort(), Object.keys(lightColors).sort());
  for (const [key, value] of Object.entries(expectedDark)) assert.equal(darkColors[key], value, `dark ${key}`);
  for (const [key, value] of Object.entries(expectedLight)) assert.equal(lightColors[key], value, `light ${key}`);
});

test("focus cobalt is separate from the accessible dark filled action", () => {
  assert.notEqual(darkColors.accent, darkColors.action);
  assert.ok(contrast(darkColors.onAction, darkColors.action) >= 4.5);
  assert.ok(contrast(lightColors.onAction, lightColors.action) >= 4.5);
});

test("status roles stay semantic while legacy magenta aliases resolve to cobalt", () => {
  assert.equal(darkColors.magenta, darkColors.accent);
  assert.equal(lightColors.magenta, lightColors.accent);
  assert.notEqual(darkColors.success, darkColors.accent);
  assert.notEqual(lightColors.warning, lightColors.accent);
  assert.notEqual(lightColors.error, lightColors.accent);
});
