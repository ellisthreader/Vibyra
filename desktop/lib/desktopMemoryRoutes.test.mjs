import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleDesktopMemoryRoutes } from "./desktopMemoryRoutes.mjs";
import { appState } from "./state.mjs";

test.beforeEach(() => {
  appState.desktopAccountToken = "account-token";
});

test("desktop vault routes proxy canonical node paths", async () => {
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return response({ ok: true, node: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" } });
  };

  try {
    const result = await routeRequest("POST", "/desktop/project-memory/nodes", {
      projectId: "project-1",
      type: "document",
      name: "Readme",
      markdown: "# Readme"
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 200);
    assert.match(requests[0].url, /\/api\/project-memory\/project-1\/nodes$/);
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      type: "document",
      name: "Readme",
      parentId: null,
      markdown: "# Readme"
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("desktop import routes send normalized manifests without local paths", async () => {
  let request;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return response({ ok: true, imported: { created: 1, replaced: 0, skipped: 0 } }, 201);
  };

  try {
    const result = await routeRequest("POST", "/desktop/project-memory/imports", {
      projectId: "project-1",
      collisionStrategy: "replace",
      files: [{ path: "Folder\\Note.md", content: "# Note" }]
    });

    assert.equal(result.status, 200);
    assert.match(request.url, /\/api\/project-memory\/project-1\/imports$/);
    assert.deepEqual(JSON.parse(request.options.body), {
      collisionStrategy: "replace",
      files: [{ path: "Folder/Note.md", markdown: "# Note", source: "markdown_import" }]
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("desktop delete route preserves recursive folder intent from the query", async () => {
  let request;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return response({ ok: true, deletedId: "folder-1" });
  };

  try {
    const result = await routeRequest(
      "DELETE",
      "/desktop/project-memory/node?projectId=project-1&nodeId=folder-1&recursive=1"
    );

    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(request.options.body), { recursive: true });
  } finally {
    global.fetch = originalFetch;
  }
});

async function routeRequest(method, path, body) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.headers = { host: "127.0.0.1:3210" };
  req.socket = { remoteAddress: "127.0.0.1" };
  const result = { status: null, payload: null, handled: false };
  const res = {
    writeHead(status) {
      result.status = status;
    },
    end(payload) {
      result.payload = payload ? JSON.parse(String(payload)) : null;
    }
  };
  result.handled = await handleDesktopMemoryRoutes(req, res, new URL(path, "http://127.0.0.1:3210"));
  return result;
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}
