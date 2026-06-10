import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadWebAdapter() {
  const source = await readFile(new URL("./secretStorage.web.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("web adapter retains localStorage compatibility", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  try {
    const { secretStorage } = await loadWebAdapter();
    await secretStorage.write("web-secret");
    assert.equal(await secretStorage.read(), "web-secret");
    await secretStorage.delete();
    assert.equal(await secretStorage.read(), null);
  } finally {
    delete globalThis.localStorage;
  }
});
