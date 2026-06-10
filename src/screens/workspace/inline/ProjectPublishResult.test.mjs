import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPublishResults() {
  const lifecycleSource = await readFile(new URL("./ProjectPublishLifecycle.ts", import.meta.url), "utf8");
  const lifecycleOutput = ts.transpileModule(lifecycleSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const lifecycleModule = { exports: {} };
  new Function("exports", "module", lifecycleOutput)(lifecycleModule.exports, lifecycleModule);
  const source = await readFile(new URL("./ProjectPublishResult.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "./ProjectPublishLifecycle") return lifecycleModule.exports;
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

test("under-review publishing always returns visible guidance", async () => {
  const { isPublishReviewLocked, publishResultFromOutcome, publishResultFromStatus, publishStatusLabel } = await loadPublishResults();

  assert.equal(publishResultFromOutcome("under_review").title, "Changes submitted");
  assert.equal(publishResultFromStatus({
    reviewStatus: "under_review",
    sourceProjectId: "project-1",
    visibility: "public"
  }).title, "Checking your project");
  assert.equal(publishStatusLabel({
    reviewStatus: "under_review",
    sourceProjectId: "project-1",
    visibility: "public"
  }), "In review");
  assert.equal(isPublishReviewLocked({
    reviewStatus: "under_review",
    sourceProjectId: "project-1",
    visibility: "public"
  }), false);
});

test("approved runtime publishing reports queue, build, live, and failure states", async () => {
  const { isPublishStatusPending, publishProgressFromStatus, publishResultFromStatus, publishStatusLabel } = await loadPublishResults();
  const base = { reviewStatus: "approved", sourceProjectId: "project-1", visibility: "public" };

  assert.equal(publishResultFromStatus({ ...base, deploymentStatus: "queued" }).title, "Your app is in line");
  assert.equal(publishResultFromStatus({ ...base, deploymentStatus: "building" }).title, "Building your app");
  assert.equal(publishResultFromStatus({ ...base, deploymentStatus: "live", isPublic: true }).title, "Your app is live");
  assert.equal(publishResultFromStatus({ ...base, deploymentStatus: "failed" }).title, "We couldn’t publish this build");
  assert.equal(publishStatusLabel({ ...base, deploymentStatus: "building" }), "Publishing");
  assert.equal(isPublishStatusPending({ ...base, deploymentStatus: "starting" }), true);
  assert.equal(isPublishStatusPending({ ...base, deploymentStatus: "live" }), false);

  const startedAt = "2026-06-09T12:00:00.000Z";
  const queued = publishProgressFromStatus({ ...base, deploymentStatus: "queued", deploymentUpdatedAt: startedAt }, Date.parse("2026-06-09T12:00:30.000Z"));
  const building = publishProgressFromStatus({ ...base, deploymentStatus: "building", deploymentUpdatedAt: startedAt }, Date.parse("2026-06-09T12:01:30.000Z"));
  const delayed = publishProgressFromStatus({ ...base, deploymentStatus: "starting", deploymentUpdatedAt: startedAt }, Date.parse("2026-06-09T13:00:00.000Z"));
  assert.equal(queued.percent, 17);
  assert.equal(queued.estimate, "Most apps are live in about 2–5 minutes.");
  assert.ok(building.percent > queued.percent);
  assert.equal(delayed.percent, 96);
  assert.equal(publishProgressFromStatus({ ...base, deploymentStatus: "live" }).percent, 100);
  assert.equal(publishResultFromStatus({ ...base, deploymentStatus: "queued", safetyRating: "caution", safetyScore: 1 }).message.includes("Safety:"), false);
});

test("action results stay specific instead of being replaced by current status", async () => {
  const { publishResultFromOutcome, publishResultFromStatus } = await loadPublishResults();
  assert.equal(publishResultFromOutcome("published", {}, "first").title, "Publishing started");
  assert.equal(publishResultFromOutcome("published", {}, "update").title, "New version is publishing");

  const updating = {
    candidateReleaseState: "building",
    currentReleaseState: "live",
    listingState: "listed",
    sourceProjectId: "project-1",
    visibility: "public"
  };
  assert.equal(publishResultFromStatus(updating).title, "Live · Updating");
  assert.equal(publishResultFromStatus({ ...updating, candidateError: "Build failed.", candidateReleaseState: "failed" }).title, "Live · Update failed");
});
