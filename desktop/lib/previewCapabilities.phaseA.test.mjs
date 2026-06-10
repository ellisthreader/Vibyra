import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { applyAgentPlan, makeAgentApplyPlan } from "./agentApply.mjs";
import { approvePairing, startPreview, startPreviewServer } from "./pairingHandlers.mjs";
import {
  issuePreviewCapability,
  previewCredentialAllowsProject,
  previewCredentialTargetId,
  replacePreviewCapability,
  revokeAllPreviewCapabilities,
  revokePreviewCapability
} from "./previewCapabilities.mjs";
import { serveProjectPreview } from "./preview.mjs";
import {
  findFreePort,
  killTrackedPreview,
  makeFakeNpm,
  makeProject,
  requestPreview
} from "./previewTestHelpers.mjs";
import {
  activePairedDevice,
  appState,
  disconnectPhone,
  PHONE_SESSION_TIMEOUT_MS,
  TOKEN
} from "./state.mjs";

test("phone preview handlers issue scoped credentials instead of the global token", async () => {
  const { project, cleanup } = await makeProject("phone-preview-capability-");
  const previous = snapshotState();
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><title>Phone preview</title>");
    appState.cachedProjects = [project];

    const response = await invokeJsonHandler(startPreview, { projectId: project.id });
    const credential = previewCredentialFromUrl(response.body.preview.url);

    assert.equal(response.status, 200);
    assert.notEqual(credential, TOKEN);
    assert.equal(response.body.preview.url.includes(encodeURIComponent(TOKEN)), false);
    assert.equal(previewCredentialAllowsProject(credential, project.id), true);
    assert.equal(previewCredentialAllowsProject(credential, "another-project"), false);
  } finally {
    restoreState(previous);
    revokeAllPreviewCapabilities();
    await cleanup();
  }
});

test("phone preview server URLs use scoped credentials", async () => {
  const { project, cleanup } = await makeProject("phone-preview-server-capability-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  const previous = snapshotState();
  const previousPath = process.env.PATH;
  const previousPort = process.env.VIBYRA_FAKE_PREVIEW_PORT;
  const previousHtml = process.env.VIBYRA_FAKE_PREVIEW_HTML;
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>');
    await writeFile(join(project.path, "src", "main.js"), "console.log('preview');");
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: `vite --host 0.0.0.0 --port ${port}` },
      devDependencies: { vite: "latest" }
    }));
    process.env.PATH = `${fakeNpm.bin}:${previousPath}`;
    process.env.VIBYRA_FAKE_PREVIEW_PORT = String(port);
    process.env.VIBYRA_FAKE_PREVIEW_HTML = '<!doctype html><script type="module" src="/src/main.js"></script>';
    appState.cachedProjects = [project];

    const response = await invokeJsonHandler(startPreviewServer, { projectId: project.id });
    const credential = previewCredentialFromUrl(response.body.preview.url);

    assert.equal(response.status, 200);
    assert.notEqual(credential, TOKEN);
    assert.equal(response.body.preview.url.includes(encodeURIComponent(TOKEN)), false);
    assert.equal(previewCredentialAllowsProject(credential, project.id), true);
  } finally {
    killTrackedPreview(project.id);
    restoreState(previous);
    revokeAllPreviewCapabilities();
    process.env.PATH = previousPath;
    restoreEnv("VIBYRA_FAKE_PREVIEW_PORT", previousPort);
    restoreEnv("VIBYRA_FAKE_PREVIEW_HTML", previousHtml);
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("agent apply preview URLs use a scoped project capability", async () => {
  const { project, cleanup } = await makeProject("agent-apply-preview-capability-");
  const previous = snapshotState();
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><title>Applied preview</title>");
    const outputDir = join(project.path, ".vibyra-agent", "runs");
    const outputPath = join(outputDir, "phase-a.md");
    const plan = makeAgentApplyPlan({
      runId: "phase-a-agent-apply",
      project,
      prompt: "Apply preview security",
      model: "test-model",
      outputDir,
      outputPath,
      generatedFiles: [],
      obsidianRun: null,
      summary: "# Applied",
      responseText: "done",
      requestHost: "vibyra.test"
    });

    const result = await applyAgentPlan(plan);
    const credential = previewCredentialFromUrl(result.preview.url);

    assert.notEqual(credential, TOKEN);
    assert.equal(result.preview.url.includes(encodeURIComponent(TOKEN)), false);
    assert.equal(previewCredentialAllowsProject(credential, project.id), true);
  } finally {
    restoreState(previous);
    revokeAllPreviewCapabilities();
    await cleanup();
  }
});

test("capabilities isolate projects, expire, replace, revoke, and retain legacy compatibility", async () => {
  revokeAllPreviewCapabilities();
  const first = issuePreviewCapability("project-a", { now: 100, ttlMs: 50 });
  assert.equal(previewCredentialAllowsProject(first, "project-a", { now: 149 }), true);
  assert.equal(previewCredentialAllowsProject(first, "project-b", { now: 149 }), false);
  assert.equal(previewCredentialAllowsProject(first, "project-a", { now: 150 }), false);

  const replaced = issuePreviewCapability("project-a");
  const replacement = replacePreviewCapability("project-a", replaced);
  assert.equal(previewCredentialAllowsProject(replaced, "project-a"), false);
  assert.equal(previewCredentialAllowsProject(replacement, "project-a"), true);
  assert.equal(revokePreviewCapability(replacement), true);
  assert.equal(previewCredentialAllowsProject(replacement, "project-a"), false);

  assert.equal(previewCredentialAllowsProject(TOKEN, "project-a", { legacyToken: TOKEN }), true);
  assert.equal(previewCredentialAllowsProject(TOKEN, "project-a"), false);
});

test("preview capabilities may pin a target while project-only callers remain compatible", () => {
  const projectOnly = issuePreviewCapability("project-a");
  const pinned = issuePreviewCapability("project-a", { targetId: "frontend" });
  assert.equal(previewCredentialTargetId(projectOnly), "");
  assert.equal(previewCredentialTargetId(pinned), "frontend");
  assert.equal(previewCredentialAllowsProject(pinned, "project-a"), true);
});

test("legacy global preview tokens can be retired independently", () => {
  const previous = process.env.VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED;
  try {
    process.env.VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED = "false";
    assert.equal(previewCredentialAllowsProject(TOKEN, "project-a", { legacyToken: TOKEN }), false);

    process.env.VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED = "true";
    assert.equal(previewCredentialAllowsProject(TOKEN, "project-a", { legacyToken: TOKEN }), true);
  } finally {
    restoreEnv("VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED", previous);
  }
});

test("disconnect, session expiry, and approved replacement pairing revoke scoped previews", async () => {
  const previous = snapshotState();
  try {
    let credential = issuePreviewCapability("project-a");
    appState.latestPreviewCredential = credential;
    appState.phoneSession = { deviceName: "Phone", connectedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
    appState.pairedDevice = "Phone";
    disconnectPhone();
    assert.equal(previewCredentialAllowsProject(credential, "project-a"), false);
    assert.equal(appState.latestPreviewCredential, null);

    credential = issuePreviewCapability("project-a");
    appState.latestPreviewCredential = credential;
    appState.phoneSession = {
      deviceName: "Phone",
      connectedAt: new Date().toISOString(),
      lastSeenAt: new Date(Date.now() - PHONE_SESSION_TIMEOUT_MS - 1).toISOString()
    };
    appState.pairedDevice = "Phone";
    assert.equal(activePairedDevice(false), null);
    assert.equal(previewCredentialAllowsProject(credential, "project-a"), false);

    credential = issuePreviewCapability("project-a");
    appState.latestPreviewCredential = credential;
    appState.desktopAccount = { id: 7 };
    appState.pendingPair = {
      id: "replacement-pair",
      accountId: 7,
      deviceName: "Replacement Phone",
      status: "pending"
    };
    await approvePairing();
    assert.equal(previewCredentialAllowsProject(credential, "project-a"), false);
    assert.equal(appState.latestPreviewCredential, null);
  } finally {
    restoreState(previous);
    revokeAllPreviewCapabilities();
  }
});

test("legacy global-token preview routes follow the retirement flag", async () => {
  const { project, cleanup } = await makeProject("legacy-preview-token-");
  const previous = process.env.VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED;
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><title>Legacy preview</title>");
    process.env.VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED = "false";
    assert.equal((await requestPreview(project)).status, 401);

    process.env.VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED = "true";
    const enabled = await requestPreview(project);
    assert.equal(enabled.status, 200);
    assert.match(enabled.body, /Legacy preview/);
  } finally {
    restoreEnv("VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED", previous);
    await cleanup();
  }
});

test("revoked scoped preview links are rejected by the preview route", async () => {
  const { project, cleanup } = await makeProject("revoked-preview-capability-");
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><title>Revoked</title>");
    appState.cachedProjects = [project];
    const credential = issuePreviewCapability(project.id);
    revokePreviewCapability(credential);
    const response = await requestProjectPreview(project.id, credential);
    assert.equal(response.status, 401);
  } finally {
    appState.cachedProjects = previousProjects;
    revokeAllPreviewCapabilities();
    await cleanup();
  }
});

function invokeJsonHandler(handler, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.headers = { host: "vibyra.test", "content-type": "application/json" };
  const response = { status: 0, body: null };
  const res = {
    writeHead(status) {
      response.status = status;
    },
    end(value) {
      response.body = JSON.parse(String(value));
    }
  };
  return handler(req, res).then(() => response);
}

async function requestProjectPreview(projectId, credential) {
  const response = { status: 0, body: "" };
  const res = {
    writeHead(status) {
      response.status = status;
    },
    end(body) {
      response.body = String(body || "");
    }
  };
  const url = new URL(
    `/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(credential)}/`,
    "http://vibyra.test"
  );
  await serveProjectPreview(res, url);
  return response;
}

function previewCredentialFromUrl(url) {
  const match = String(url || "").match(/^\/preview\/(?:project|server)\/[^/]+\/([^/]+)\//);
  assert.ok(match, `Expected a scoped preview URL, received ${url}`);
  return decodeURIComponent(match[1]);
}

function snapshotState() {
  return {
    cachedProjects: appState.cachedProjects,
    desktopAccount: appState.desktopAccount,
    events: appState.events,
    latestPreview: appState.latestPreview,
    latestPreviewCredential: appState.latestPreviewCredential,
    pairedDevice: appState.pairedDevice,
    pendingAgentApplies: appState.pendingAgentApplies,
    pendingPair: appState.pendingPair,
    phoneSession: appState.phoneSession,
    selectedProjectId: appState.selectedProjectId
  };
}

function restoreState(previous) {
  Object.assign(appState, previous);
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
