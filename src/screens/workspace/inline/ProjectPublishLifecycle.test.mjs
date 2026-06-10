import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadLifecycle() {
  const source = await readFile(new URL("./ProjectPublishLifecycle.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

test("project menu labels follow listing lifecycle and allowed actions", async () => {
  const { projectPublishMenuLabel } = await loadLifecycle();
  assert.equal(projectPublishMenuLabel(null), "Publish to Explore");
  assert.equal(projectPublishMenuLabel({
    allowedActions: ["publish_release"], candidateReleaseState: "failed",
    listingState: "listed", sourceProjectId: "p1"
  }), "Fix and resubmit");
  assert.equal(projectPublishMenuLabel({
    allowedActions: [], candidateReleaseState: "building",
    listingState: "listed", sourceProjectId: "p1"
  }), "View publishing status");
  assert.equal(projectPublishMenuLabel({
    allowedActions: ["publish_release"], isOpenable: false,
    listingState: "draft", sourceProjectId: "p1"
  }), "Continue publishing");
  assert.equal(projectPublishMenuLabel({
    allowedActions: ["update_listing"], isOpenable: true,
    listingState: "listed", sourceProjectId: "p1"
  }), "Manage listing");
});

test("live releases retain live status while a candidate updates or fails", async () => {
  const { projectPublishStatusLabel } = await loadLifecycle();
  const base = { currentReleaseState: "live", listingState: "listed", sourceProjectId: "p1" };
  assert.equal(projectPublishStatusLabel({ ...base, candidateReleaseState: "building" }), "Live + Updating");
  assert.equal(projectPublishStatusLabel({ ...base, candidateReleaseState: "failed" }), "Live + Update failed");
  assert.equal(projectPublishStatusLabel(base), "Live");
});

test("poll key changes for a new candidate generation", async () => {
  const { publishStatusPollKey } = await loadLifecycle();
  const first = publishStatusPollKey([{
    candidateReleaseState: "building", deploymentCreatedAt: "2026-06-09T10:00:00Z",
    listingState: "listed", sourceProjectId: "p1"
  }]);
  const next = publishStatusPollKey([{
    candidateReleaseState: "building", deploymentCreatedAt: "2026-06-09T10:05:00Z",
    listingState: "listed", sourceProjectId: "p1"
  }]);
  assert.notEqual(first, next);
});

test("fresh publish errors override the status-only screen", async () => {
  const { shouldShowPublishStatusOnly } = await loadLifecycle();
  const pending = {
    sourceProjectId: "project",
    listingState: "pending",
    candidateReleaseState: "queued",
    allowedActions: []
  };

  assert.equal(shouldShowPublishStatusOnly(pending, ""), true);
  assert.equal(shouldShowPublishStatusOnly(pending, "Railway rejected the deployment."), false);
});
