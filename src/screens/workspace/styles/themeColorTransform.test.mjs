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
const require = Module.createRequire(import.meta.url);
const { transformColorForLight } = require(path.join(directory, "themeColorTransform.ts"));

test("known first-party graphite and legacy brand colours map explicitly", () => {
  assert.equal(transformColorForLight("#0E0F12", "backgroundColor"), "#F4F5F7");
  assert.equal(transformColorForLight("#101115", "backgroundColor"), "#FBFBFC");
  assert.equal(transformColorForLight("#5B7CFA", "color"), "#315BD8");
  assert.equal(transformColorForLight("#6D3BFF", "color"), "#315BD8");
  assert.equal(transformColorForLight("rgba(91, 124, 250, 0.14)", "backgroundColor"), "rgba(49, 91, 216, 0.09)");
  assert.equal(transformColorForLight("#37C78A", "color"), "#147A57");
});

test("unknown chromatic provider and syntax colours are never heuristically recoloured", () => {
  assert.equal(transformColorForLight("#4285F4", "color"), "#4285F4");
  assert.equal(transformColorForLight("#C678DD", "color"), "#C678DD");
  assert.equal(transformColorForLight("rgb(255, 0, 0)", "backgroundColor"), "rgb(255, 0, 0)");
});
