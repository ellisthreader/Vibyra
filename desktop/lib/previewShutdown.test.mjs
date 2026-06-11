import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  installPreviewShutdownHandlers,
  requestPreviewShutdown
} from "./previewShutdown.mjs";

test("preview shutdown handlers stop children and exit after server close", () => {
  const processRef = fakeProcess();
  const server = {
    listening: true,
    close(callback) {
      this.listening = false;
      callback();
    }
  };
  let stopCalls = 0;
  const remove = installPreviewShutdownHandlers({
    processRef,
    server,
    stopPreviews: () => { stopCalls += 1; }
  });
  try {
    processRef.emit("SIGTERM");
    processRef.emit("SIGINT");
    assert.equal(stopCalls, 1);
    assert.deepEqual(processRef.exitCalls, [0]);
  } finally {
    remove();
  }
});

test("desktop shutdown requests use the installed shutdown path", () => {
  const processRef = fakeProcess();
  const server = new EventEmitter();
  server.listening = false;
  let stopCalls = 0;
  const remove = installPreviewShutdownHandlers({
    processRef,
    server,
    stopPreviews: () => { stopCalls += 1; }
  });
  try {
    assert.equal(requestPreviewShutdown(server), true);
    assert.equal(stopCalls, 1);
    assert.deepEqual(processRef.exitCalls, [0]);
  } finally {
    remove();
  }
  assert.equal(requestPreviewShutdown(server), false);
});

test("preview shutdown forces upgraded sockets closed after its deadline", async () => {
  const processRef = fakeProcess();
  const server = new EventEmitter();
  server.listening = true;
  server.close = () => {
    server.listening = false;
  };
  let closeAllCalls = 0;
  server.closeAllConnections = () => { closeAllCalls += 1; };
  const socket = new EventEmitter();
  let destroyCalls = 0;
  socket.destroy = () => { destroyCalls += 1; };
  const remove = installPreviewShutdownHandlers({
    processRef,
    server,
    shutdownTimeoutMs: 5,
    stopPreviews: () => {}
  });
  try {
    server.emit("connection", socket);
    processRef.emit("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(destroyCalls, 1);
    assert.equal(closeAllCalls, 1);
    assert.deepEqual(processRef.exitCalls, [0]);
  } finally {
    remove();
  }
});

test("preview shutdown handlers clean up before fatal exits", () => {
  const processRef = fakeProcess();
  let stopCalls = 0;
  const originalError = console.error;
  console.error = () => {};
  const remove = installPreviewShutdownHandlers({
    processRef,
    stopPreviews: () => { stopCalls += 1; }
  });
  try {
    processRef.emit("uncaughtException", new Error("boom"));
    assert.equal(stopCalls, 1);
    assert.deepEqual(processRef.exitCalls, [1]);
  } finally {
    remove();
    console.error = originalError;
  }
});

test("preview shutdown handlers clean up when the bridge server closes independently", () => {
  const processRef = fakeProcess();
  const server = new EventEmitter();
  server.listening = false;
  let stopCalls = 0;
  const remove = installPreviewShutdownHandlers({
    processRef,
    server,
    stopPreviews: () => { stopCalls += 1; }
  });
  try {
    server.emit("close");
    server.emit("close");
    assert.equal(stopCalls, 1);
    assert.deepEqual(processRef.exitCalls, []);
  } finally {
    remove();
  }
});

test("preview shutdown continues when child cleanup throws", () => {
  const processRef = fakeProcess();
  const server = new EventEmitter();
  server.listening = false;
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  const remove = installPreviewShutdownHandlers({
    processRef,
    server,
    stopPreviews: () => { throw new Error("cleanup failed"); }
  });
  try {
    processRef.emit("SIGTERM");
    assert.deepEqual(processRef.exitCalls, [0]);
    assert.equal(errors.length, 1);
  } finally {
    remove();
    console.error = originalError;
  }
});

test("independent server close tolerates preview cleanup errors", () => {
  const processRef = fakeProcess();
  const server = new EventEmitter();
  server.listening = false;
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  const remove = installPreviewShutdownHandlers({
    processRef,
    server,
    stopPreviews: () => { throw new Error("cleanup failed"); }
  });
  try {
    server.emit("close");
    assert.deepEqual(processRef.exitCalls, []);
    assert.equal(errors.length, 1);
  } finally {
    remove();
    console.error = originalError;
  }
});

function fakeProcess() {
  const processRef = new EventEmitter();
  processRef.exitCalls = [];
  processRef.exit = (code) => processRef.exitCalls.push(code);
  return processRef;
}
