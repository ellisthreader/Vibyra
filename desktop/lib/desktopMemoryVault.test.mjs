import test from "node:test";
import assert from "node:assert/strict";
import { appState } from "./state.mjs";
import {
  createDesktopMemoryNode,
  deleteDesktopMemoryNode,
  getDesktopMemoryVault,
  importDesktopMemoryManifest,
  normalizeMemoryImportManifest,
  updateDesktopMemoryNode
} from "./desktopMemoryVault.mjs";

test.beforeEach(() => {
  appState.desktopAccountToken = "account-token";
});

test("desktop memory vault proxies authenticated reads", async () => {
  let request;
  const payload = await getDesktopMemoryVault("project / one", async (url, options) => {
    request = { url: String(url), options };
    return response({ ok: true, vault: { revision: 3, nodes: [] } });
  });

  assert.match(request.url, /\/api\/project-memory\/project%20%2F%20one\/vault$/);
  assert.equal(request.options.headers.Authorization, "Bearer account-token");
  assert.equal(payload.vault.revision, 3);
});

test("desktop memory vault creates and updates bounded nodes", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    return response({ ok: true, node: { id: "node-1" } });
  };

  await createDesktopMemoryNode("project-1", {
    type: "document",
    name: "Architecture",
    parentId: "folder-1",
    markdown: "# Architecture"
  }, fetchImpl);
  await updateDesktopMemoryNode("project-1", "node/1", {
    version: 2,
    name: "System architecture",
    markdown: "# System"
  }, fetchImpl);

  assert.match(requests[0].url, /\/project-1\/nodes$/);
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    type: "document",
    name: "Architecture",
    parentId: "folder-1",
    markdown: "# Architecture"
  });
  assert.match(requests[1].url, /\/project-1\/nodes\/node%2F1$/);
  assert.equal(requests[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    version: 2,
    name: "System architecture",
    markdown: "# System"
  });
});

test("desktop memory vault deletes with optimistic version and recursive intent", async () => {
  let request;
  await deleteDesktopMemoryNode("project-1", "folder-1", { version: 4, recursive: true }, async (url, options) => {
    request = { url: String(url), options };
    return response({ ok: true });
  });

  assert.equal(request.options.method, "DELETE");
  assert.deepEqual(JSON.parse(request.options.body), { version: 4, recursive: true });
});

test("memory imports normalize relative Markdown manifests", async () => {
  let request;
  await importDesktopMemoryManifest("project-1", {
    collisionStrategy: "keep both",
    files: [
      { path: "Guides\\Start.md", content: "# Start" },
      { path: "README.MD", content: "Home", source: "obsidian_import" }
    ]
  }, async (url, options) => {
    request = { url: String(url), options };
    return response({ ok: true, imported: 2 });
  });

  assert.match(request.url, /\/project-1\/imports$/);
  assert.deepEqual(JSON.parse(request.options.body), {
    collisionStrategy: "keep_both",
    files: [
      { path: "Guides/Start.md", markdown: "# Start", source: "markdown_import" },
      { path: "README.MD", markdown: "Home", source: "obsidian_import" }
    ]
  });
});

test("memory imports reject filesystem paths, traversal, hidden metadata, and non-Markdown files", () => {
  const invalid = [
    { files: [{ path: "/home/user/Vault/Note.md", content: "x" }] },
    { files: [{ path: "../Note.md", content: "x" }] },
    { files: [{ path: ".obsidian/config.md", content: "x" }] },
    { files: [{ path: "image.png", content: "x" }] },
    { vaultPath: "/home/user/Vault", files: [{ path: "Note.md", content: "x" }] },
    { files: [{ path: "Note.md", content: "x", sourcePath: "/home/user/Vault/Note.md" }] }
  ];
  for (const manifest of invalid) {
    assert.throws(() => normalizeMemoryImportManifest(manifest), { status: 422 });
  }
});

test("memory imports enforce duplicate and content limits before fetching", async () => {
  assert.throws(() => normalizeMemoryImportManifest({
    files: [
      { path: "Note.md", content: "one" },
      { path: "note.md", content: "two" }
    ]
  }), /Duplicate/);

  await assert.rejects(() => importDesktopMemoryManifest("project-1", {
    files: [{ path: "Large.md", content: "a".repeat(512_001) }]
  }, async () => {
    assert.fail("invalid manifests must not reach fetch");
  }), { status: 422 });
});

test("memory node mutations require valid versions and changes", async () => {
  await assert.rejects(() => updateDesktopMemoryNode("project-1", "node-1", { version: 1 }), /at least one/);
  await assert.rejects(() => deleteDesktopMemoryNode("project-1", "node-1", { version: 0 }), { status: 422 });
  await assert.rejects(() => createDesktopMemoryNode("project-1", { type: "asset", name: "Logo" }), /folder or document/);
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}
