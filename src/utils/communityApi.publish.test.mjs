import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadApi(request) {
  const cache = new Map();
  const load = async (name) => {
    if (cache.has(name)) return cache.get(name);
    if (name === "appApi") return { appApiRequest: request, getAppApiUrl: () => "https://api.example.com" };
    if (name === "publicDemoUrls") return { sanitizePublicDemoUrl: (value) => value };
    const source = await readFile(new URL(`./${name}.ts`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    const module = { exports: {} };
    cache.set(name, module.exports);
    const dependencies = [...output.matchAll(/require\("\.\/([^"]+)"\)/g)].map((match) => match[1]);
    const resolved = Object.fromEntries(await Promise.all(
      dependencies.map(async (dependency) => [dependency, await load(dependency)])
    ));
    const localRequire = (specifier) => resolved[specifier.replace("./", "")];
    new Function("require", "exports", "module", output)(localRequire, module.exports, module);
    cache.set(name, module.exports);
    return module.exports;
  };
  return load("communityApi");
}

test("listing metadata uses the metadata-only endpoint without publish source fields", async () => {
  let call;
  const api = await loadApi(async (path, options, token) => {
    call = { path, options, token };
    return {
      action: "listing_updated",
      project: { id: "my-project", title: "Updated" },
      publishStatus: { listingState: "listed", sourceProjectId: "source-1" }
    };
  });
  const result = await api.updatePublishedProjectListing({
    authToken: "token",
    description: "Updated description",
    logoImageUrl: "",
    screenshotUrls: [],
    slug: "my project",
    tags: ["Tool"],
    title: "Updated"
  });
  const body = JSON.parse(call.options.body);
  assert.equal(call.path, "/api/projects/my%20project/listing");
  assert.equal(call.options.method, "PATCH");
  assert.equal(call.token, "token");
  assert.equal(body.title, "Updated");
  assert.equal("sourceFiles" in body, false);
  assert.equal("runtimeBundle" in body, false);
  assert.equal(result.action, "listing_updated");
});

test("full-stack publish sends explicit frontend and backend capabilities", async () => {
  let call;
  const api = await loadApi(async (path, options, token) => {
    call = { path, options, token };
    return {
      isPublic: true,
      ok: true,
      project: { id: "full-stack", title: "Full stack" }
    };
  });
  await api.publishProject({
    authToken: "token",
    capabilities: { backend: true, frontend: true },
    description: "React and Laravel",
    previewHtml: "",
    projectId: "desktop-project",
    runtimeBundle: {
      files: [{ body: "{}", path: "composer.json" }, { body: "js", path: "public/build/app.js" }],
      ok: true,
      platform: "laravel",
      status: "pending"
    },
    stack: "React + Laravel",
    tags: ["React", "Laravel"],
    title: "Full stack"
  });

  const body = JSON.parse(call.options.body);
  assert.equal(call.path, "/api/projects/publish");
  assert.deepEqual(body.capabilities, { backend: true, frontend: true });
  assert.equal(body.projectId, "desktop-project");
  assert.equal(body.runtimeBundle.platform, "laravel");
});

test("community reports send authenticated bounded evidence to the report endpoint", async () => {
  let call;
  const api = await loadApi(async (path, options, token) => {
    call = { path, options, token };
    return { ok: true, report: { createdAt: "2026-08-08T12:00:00Z", id: 7, status: "pending" } };
  });

  const result = await api.reportCommunityProject("report-token", "app slug", {
    details: "The app does not open.",
    reason: "broken_app",
    screenshot: "data:image/png;base64,cG5n",
  });

  assert.equal(call.path, "/api/community/projects/app%20slug/reports");
  assert.equal(call.options.method, "POST");
  assert.equal(call.token, "report-token");
  assert.deepEqual(JSON.parse(call.options.body), {
    details: "The app does not open.",
    reason: "broken_app",
    screenshot: "data:image/png;base64,cG5n",
  });
  assert.equal(result.report.status, "pending");
});
