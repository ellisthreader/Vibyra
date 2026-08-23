import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const stylesDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(stylesDirectory, "workspaceStyleCascade.fixture.json");
const require = createRequire(import.meta.url);

function installTypeScriptLoader() {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "react-native") {
      return {
        Platform: { OS: "web", select: (options) => options.web ?? options.default },
        StyleSheet: {
          absoluteFillObject: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
          create: (styles) => styles,
          hairlineWidth: 1
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  Module._extensions[".ts"] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020
      }
    }).outputText;
    module._compile(output, filename);
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

installTypeScriptLoader();

test("workspace style cascade preserves every winner and light-theme transform", () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const { workspaceStyleSources } = require(path.join(stylesDirectory, "workspaceStyleSources.ts"));
  const { transformStyleMap } = require(path.join(stylesDirectory, "themeTransform.ts"));
  const { setStylesScheme, styles } = require(path.join(stylesDirectory, "index.ts"));
  const resolved = {};
  const winners = {};
  let definitionCount = 0;

  for (const source of workspaceStyleSources) {
    for (const [key, value] of Object.entries(source.styles)) {
      definitionCount += 1;
      resolved[key] = value;
      winners[key] = source.name;
    }
  }

  const light = transformStyleMap(resolved);
  const actualEntries = Object.keys(resolved).map((key) => ({
    dark: stable(resolved[key]),
    key,
    light: stable(light[key]),
    winner: winners[key]
  }));

  assert.equal(definitionCount, fixture.definitionCount);
  assert.deepEqual(workspaceStyleSources.map(({ name }) => name), fixture.sourceOrder);
  assert.deepEqual(actualEntries, fixture.entries);

  setStylesScheme("dark");
  assert.deepEqual(Object.keys(styles), fixture.entries.map(({ key }) => key));
  assert.deepEqual(fixture.entries.map(({ key }) => stable(styles[key])), fixture.entries.map(({ dark }) => dark));
  setStylesScheme("light");
  assert.deepEqual(fixture.entries.map(({ key }) => stable(styles[key])), fixture.entries.map(({ light }) => light));
  assert.equal(fixture.entries.every(({ key }) => key in styles), true);
  setStylesScheme("dark");
});
