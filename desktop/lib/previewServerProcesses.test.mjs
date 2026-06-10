import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { previewServicesForProject } from "./previewServices.mjs";
import { stopTrackedPreviewServer, trackPreviewServer } from "./previewServerProcesses.mjs";
import { appState } from "./state.mjs";

test("one preview child exit cleans up only its target service", () => {
  const projectId = "preview-process-exit";
  const first = fakeChild();
  const second = fakeChild();
  try {
    trackPreviewServer(projectId, "first", {
      process: first,
      state: "running",
      url: "http://127.0.0.1:5101"
    });
    trackPreviewServer(projectId, "second", {
      process: second,
      state: "running",
      url: "http://127.0.0.1:5102"
    });

    first.emit("exit", 0);

    assert.equal(first.killCalls, 1);
    assert.equal(second.killCalls, 0);
    assert.equal(previewServicesForProject(projectId).length, 1);
    assert.equal(previewServicesForProject(projectId)[0].targetId, "second");
    assert.equal(appState.previewServers[projectId].targetId, "second");
  } finally {
    stopTrackedPreviewServer(projectId, "first");
    stopTrackedPreviewServer(projectId, "second");
  }
});

function fakeChild() {
  const child = new EventEmitter();
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
  };
  return child;
}
