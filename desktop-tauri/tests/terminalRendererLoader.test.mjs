import assert from "node:assert/strict";
import test from "node:test";

import { loadTerminalFonts } from "../src/lib/terminalFont.ts";
import { createRendererLoader } from "../src/lib/terminalRendererLoader.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("renderer attachment waits for a delayed addon and runs once per terminal", async () => {
  const addon = deferred();
  const loaded = [];
  class TestAddon {}
  const terminal = {};
  const attach = createRendererLoader(() => addon.promise, (target, instance) => {
    loaded.push({ target, instance });
  });

  const first = attach(terminal);
  const duplicate = attach(terminal);
  assert.equal(first, duplicate);
  assert.equal(loaded.length, 0);

  addon.resolve(TestAddon);
  const instance = await first;
  assert.ok(instance instanceof TestAddon);
  assert.deepEqual(loaded, [{ target: terminal, instance }]);
});

test("software rendering resolves without attaching an addon", async () => {
  let loads = 0;
  const attach = createRendererLoader(
    async () => null,
    () => {
      loads += 1;
    },
  );

  assert.equal(await attach({}), null);
  assert.equal(loads, 0);
});

test("a terminal disposed during startup is skipped and can retry on remount", async () => {
  const addon = deferred();
  let connected = true;
  let loads = 0;
  class TestAddon {}
  const terminal = {};
  const attach = createRendererLoader(
    () => addon.promise,
    () => {
      loads += 1;
    },
    () => connected,
  );

  const first = attach(terminal);
  connected = false;
  addon.resolve(TestAddon);
  assert.equal(await first, null);
  assert.equal(loads, 0);

  connected = true;
  assert.ok(await attach(terminal) instanceof TestAddon);
  assert.equal(loads, 1);
});

test("terminal font readiness explicitly loads regular and bold metrics", async () => {
  const requested = [];
  await loadTerminalFonts({
    async load(font, sample) {
      requested.push([font, sample]);
      return [{}];
    },
  });

  assert.deepEqual(requested, [
    ['400 13px "JetBrains Mono Variable"', "W"],
    ['700 13px "JetBrains Mono Variable"', "W"],
  ]);
});

test("terminal font readiness waits for both requested weights", async () => {
  const regular = deferred();
  const bold = deferred();
  let complete = false;
  const loading = loadTerminalFonts({
    load(font) {
      return font.startsWith("400") ? regular.promise : bold.promise;
    },
  }).then(() => {
    complete = true;
  });

  regular.resolve([{}]);
  await Promise.resolve();
  assert.equal(complete, false);
  bold.resolve([{}]);
  await loading;
  assert.equal(complete, true);
});

test("one rejected font weight cannot release a later font swap", async () => {
  const bold = deferred();
  let complete = false;
  const loading = loadTerminalFonts({
    load(font) {
      return font.startsWith("400") ? Promise.reject(new Error("missing")) : bold.promise;
    },
  }).finally(() => {
    complete = true;
  });

  await Promise.resolve();
  assert.equal(complete, false);
  bold.resolve([{}]);
  await assert.rejects(loading, /bundled terminal font/);
  assert.equal(complete, true);
});

test("terminal font readiness waits for CSS faces before requesting weights", async () => {
  const ready = deferred();
  const requested = [];
  const loading = loadTerminalFonts({
    ready: ready.promise,
    async load(font) {
      requested.push(font);
      return [{}];
    },
  });

  await Promise.resolve();
  assert.deepEqual(requested, []);
  ready.resolve();
  await loading;
  assert.equal(requested.length, 2);
});

test("an empty font match is not treated as ready", async () => {
  await assert.rejects(
    loadTerminalFonts({
      async load(font) {
        return font.startsWith("400") ? [] : [{}];
      },
    }),
    /bundled terminal font/,
  );
});
