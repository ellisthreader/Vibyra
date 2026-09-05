import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function moduleUrl(name) {
  let code = await readFile(new URL(name + ".ts", import.meta.url), "utf8");
  for (const match of [...code.matchAll(/from "(\.\/[^\"]+)"/g)]) {
    code = code.replaceAll(`"${match[1]}"`, `"${await moduleUrl(match[1])}"`);
  }
  const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}
const { cloudStateChanges } = await import(await moduleUrl("./cloudStateDelta"));
const { createCloudStateTransport } = await import(await moduleUrl("./cloudStateTransport"));
const { AppApiError } = await import(await moduleUrl("./appApiErrors"));

test("one changed message sends its changed text, not forty histories", () => {
  const before = { appState: { chatThreads: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [
    `t${i}`, Array.from({ length: 80 }, (_, m) => ({ id: `m${m}`, text: "x".repeat(2000) }))
  ])) } };
  const after = structuredClone(before);
  after.appState.chatThreads.t0[79].text += "new";
  const changes = cloudStateChanges(before, after);
  assert.equal(changes.length, 2);
  assert.deepEqual(changes[0].path, ["appState", "chatThreads", "t0", "79", "id"]);
  assert.deepEqual(changes[1].path, ["appState", "chatThreads", "t0", "79", "text"]);
  assert.ok(JSON.stringify(changes).length < 5000);
});

test("array insertions and deletions remain atomic", () => {
  const before = { appState: { thread: [{ id: "a" }, { id: "b" }] } };
  const after = { appState: { thread: [{ id: "b" }] } };
  assert.deepEqual(cloudStateChanges(before, after)[0].path, ["appState", "thread"]);
});

test("negotiation supports old servers and isolates accounts", async () => {
  const requests = [];
  const send = createCloudStateTransport(async (path, body, token) => { requests.push({ path, token }); return { ok: true }; });
  await send('{"appState":{"title":"one"}}', "a");
  await send('{"appState":{"title":"two"}}', "a");
  await send('{"appState":{"title":"three"}}', "b");
  assert.ok(requests.every((r) => r.path === "/api/session/state"));
  assert.equal(requests[2].token, "b");
});

test("a conflict never falls back to overwriting the full state", async () => {
  const paths = [];
  const send = createCloudStateTransport(async (path) => {
    paths.push(path);
    if (path.endsWith("/delta")) throw new AppApiError("conflict", 409, path, {});
    return { ok: true, syncVersion: 1 };
  });
  await send('{"appState":{"title":"one"}}', "a");
  await assert.rejects(send('{"appState":{"title":"two"}}', "a"), /conflict/);
  assert.deepEqual(paths, ["/api/session/state", "/api/session/state/delta"]);
});

test("a lost acknowledgement retries the same delta and server rollback falls back safely", async () => {
  const requests = [];
  let fail = true;
  const send = createCloudStateTransport(async (path, body) => {
    requests.push({ path, body });
    if (path.endsWith("/delta") && fail) { fail = false; throw Error("network interruption"); }
    return { ok: true, syncVersion: 1 };
  });
  await send('{"appState":{"title":"one"}}', "a");
  await assert.rejects(send('{"appState":{"title":"two"}}', "a"));
  await send('{"appState":{"title":"two"}}', "a");
  assert.equal(requests[1].body, requests[2].body);
  const old = createCloudStateTransport(async (path) => {
    if (path.endsWith("/delta")) throw new AppApiError("not found", 404, path, {});
    return { ok: true, syncVersion: 1 };
  });
  await old('{"appState":{"title":"one"}}', "a");
  await old('{"appState":{"title":"two"}}', "a");
});

test("a newer snapshot first replays an unacknowledged save", async () => {
  const requests = [];
  let interrupt = true;
  const send = createCloudStateTransport(async (path, body) => {
    requests.push(JSON.parse(body));
    if (path.endsWith("/delta") && interrupt) { interrupt = false; throw Error("lost response"); }
    return { ok: true, syncVersion: 1 };
  });
  await send('{"appState":{"title":"one"}}', "a");
  await assert.rejects(send('{"appState":{"title":"two"}}', "a"));
  await send('{"appState":{"title":"three"}}', "a");
  assert.deepEqual(requests[1], requests[2]);
  assert.equal(requests[3].changes[0].before, "two");
  assert.equal(requests[3].changes[0].value, "three");
});
