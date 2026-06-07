import test from "node:test";
import assert from "node:assert/strict";
import { appState } from "./state.mjs";
import { addDesktopProjectMemory, desktopMemoryContext, getDesktopProjectMemory } from "./desktopProjectMemory.mjs";

test("desktop project memory proxies canonical project entries", async () => {
  appState.desktopAccountToken = "account-token";
  let request = null;
  const memory = await addDesktopProjectMemory("project-1", "Keep routes focused.", async (url, options) => {
    request = { url: String(url), options };
    return response({ ok: true, memory: { entries: [{ id: "user-1", text: "Keep routes focused.", source: "user" }], updatedAt: "2026-06-07T00:00:00Z" } });
  });

  assert.match(request.url, /\/api\/project-memory\/project-1\/entries$/);
  assert.equal(request.options.headers.Authorization, "Bearer account-token");
  assert.deepEqual(JSON.parse(request.options.body), { text: "Keep routes focused." });
  assert.equal(memory.entries[0].text, "Keep routes focused.");
});

test("desktop memory context excludes project brief entries", async () => {
  appState.desktopAccountToken = "account-token";
  const context = await desktopMemoryContext("project-1", async () => response({
    ok: true,
    memory: {
      entries: [
        { id: "brief-1", text: "Project direction", source: "brief" },
        { id: "user-1", text: "Use compact terminal rows.", source: "user" }
      ]
    }
  }));

  assert.deepEqual(context, [{ title: "Project memory", body: "Use compact terminal rows." }]);
});

test("desktop project memory requires a desktop account", async () => {
  appState.desktopAccountToken = null;
  await assert.rejects(() => getDesktopProjectMemory("project-1", async () => response({})), /Log in/);
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}
