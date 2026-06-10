import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadApi(request) {
  const source = await readFile(new URL("./communityApi.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "./appApi") return { appApiRequest: request, getAppApiUrl: () => "https://api.example.com" };
    if (specifier === "./publicDemoUrls") return { sanitizePublicDemoUrl: (value) => value };
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
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
