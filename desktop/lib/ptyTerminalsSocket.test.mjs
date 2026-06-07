import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

let root;
let pty;

test.before(async () => {
  root = mkdtempSync(join(tmpdir(), "vibyra-pty-socket-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  pty = await import(new URL(`./ptyTerminals.mjs?socket=${Date.now()}`, import.meta.url));
});

test.after(() => {
  for (const session of pty.listPtyTerminals()) pty.closePtyTerminal(session.id);
  rmSync(root, { recursive: true, force: true });
  delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
});

test("PTY socket input errors are contained inside the socket handler", async () => {
  await assert.doesNotReject(() => (
    pty.handlePtySocketMessage("missing-terminal", JSON.stringify({ type: "input", data: "\u001b[0n" }))
  ));
});

test("legacy automatic agent routing stays on the Vibyra wrapper", () => {
  assert.equal(pty.normalizePtyTerminalAgent("official"), "vibyra");
  assert.equal(pty.normalizePtyTerminalAgent("codex"), "codex");
  assert.equal(pty.normalizePtyTerminalAgent("claude"), "claude");
});

test("WebSocket parser preserves split and fragmented masked messages", () => {
  const message = JSON.stringify({ type: "input", data: "x".repeat(160) });
  const frame = maskedFrame(message);
  const first = pty.parsePtyWebSocketFrames(frame.subarray(0, 7));
  assert.deepEqual(first.messages, []);
  assert.equal(first.remaining.length, 7);

  const second = pty.parsePtyWebSocketFrames(
    Buffer.concat([first.remaining, frame.subarray(7)]),
    first.state
  );
  assert.deepEqual(second.messages, [message]);
  assert.equal(second.remaining.length, 0);

  const fragmentOne = maskedFrame(message.slice(0, 60), { fin: false });
  const ping = maskedFrame("still-here", { opcode: 9 });
  const fragmentTwo = maskedFrame(message.slice(60), { opcode: 0 });
  const fragmented = pty.parsePtyWebSocketFrames(Buffer.concat([fragmentOne, ping, fragmentTwo]));
  assert.deepEqual(fragmented.messages, [message]);
  assert.equal(fragmented.pongs[0].toString("utf8"), "still-here");
  assert.equal(fragmented.state.fragmented, false);
});

test("WebSocket parser rejects unmasked and oversized client frames", () => {
  assert.throws(
    () => pty.parsePtyWebSocketFrames(Buffer.from([0x81, 0x02, 0x7b, 0x7d])),
    (error) => error?.code === "PTY_WEBSOCKET_PROTOCOL"
  );

  const oversized = Buffer.alloc(10);
  oversized[0] = 0x81;
  oversized[1] = 0xff;
  oversized.writeBigUInt64BE(1_000_001n, 2);
  assert.throws(
    () => pty.parsePtyWebSocketFrames(oversized),
    (error) => error?.code === "PTY_WEBSOCKET_PROTOCOL"
  );
});

test("input write races and async stream closure become 409 errors", async () => {
  let writable = true;
  const racedSession = fakeSession({
    stdin: {
      get writable() { return writable; },
      write() {
        writable = false;
        return false;
      }
    }
  });
  await assert.rejects(
    () => pty.writePtySessionInput(racedSession, "hello"),
    (error) => error?.status === 409
  );

  const asyncClosedSession = fakeSession({
    stdin: {
      writable: true,
      write() {
        return Promise.reject(Object.assign(new Error("closed"), { code: "EPIPE" }));
      }
    }
  });
  await assert.rejects(
    () => pty.writePtySessionInput(asyncClosedSession, "hello"),
    (error) => error?.status === 409
  );
});

test("resize uses the persistent resize channel without closing the terminal", async () => {
  const calls = [];
  const session = fakeSession({
    stdin: { writable: true, write() { return true; } },
    resize(cols, rows) { calls.push(["resize", cols, rows]); },
    kill(signal) { calls.push(["kill", signal]); }
  });

  assert.equal(
    await pty.resizePtySession(session, { cols: 132, rows: 44 }, { requireRunning: true }),
    true
  );
  assert.deepEqual(calls, [["resize", 132, 44]]);
  assert.equal(session.cols, 132);
  assert.equal(session.rows, 44);
});

test("resize writable-state races become 409 errors", async () => {
  let writable = true;
  const session = fakeSession({
    stdin: {
      get writable() { return writable; },
      write() { return true; }
    },
    resize() {
      writable = false;
      return false;
    }
  });

  await assert.rejects(
    () => pty.resizePtySession(session, { cols: 120, rows: 40 }, { requireRunning: true }),
    (error) => error?.status === 409
  );
  assert.equal(session.cols, 100);
  assert.equal(session.rows, 30);
});

test("input and resize routes reject missing sessions with 409", async () => {
  for (const action of ["input", "resize"]) {
    await assert.rejects(
      () => routeRequest("POST", `/desktop/pty-terminals/missing/${action}`, action === "input"
        ? { input: "hello" }
        : { cols: 120, rows: 40 }),
      (error) => error?.status === 409
    );
  }
});

test("collection creation is idempotent for a browser-owned terminal id", async () => {
  const id = `unavailable-${Date.now()}`;
  const first = withoutProviderExecutables(() => pty.createPtyTerminal({
    id,
    agent: "codex",
    title: "Backend title",
    cols: 90,
    rows: 30
  }));
  const second = withoutProviderExecutables(() => pty.createPtyTerminal({
    id,
    agent: "codex",
    title: "Stale browser title",
    cols: 120,
    rows: 40
  }));

  assert.equal(first.status, "unavailable");
  assert.equal(second.title, "Backend title");
  assert.equal(pty.listPtyTerminals().filter((session) => session.id === id).length, 1);

  const collection = await routeRequest("GET", "/desktop/pty-terminals");
  assert.equal(collection.status, 200);
  assert.equal(collection.payload.sessions.filter((session) => session.id === id).length, 1);
  pty.closePtyTerminal(id);
});

test("PTY sessions retain bounded agentic job metadata", () => {
  const id = `agentic-metadata-${Date.now()}`;
  const session = withoutProviderExecutables(() => pty.createPtyTerminal({
    id,
    agent: "codex",
    jobId: "job 123",
    jobRole: "worker 2",
    initialPrompt: "Implement the assigned slice."
  }));

  assert.equal(session.jobId, "job-123");
  assert.equal(session.jobRole, "worker-2");
  assert.equal(Object.hasOwn(session, "initialPrompt"), false);
  pty.closePtyTerminal(id);
});

test("persistent recovery prioritizes live and unique sessions", () => {
  const exited = Array.from({ length: 12 }, (_, index) => record(
    `exited-${index}`,
    "exited",
    `2026-06-07T10:${String(index).padStart(2, "0")}:00.000Z`
  ));
  const live = record("live-session", "running", "2026-06-07T11:00:00.000Z");
  const duplicateExited = record("live-session", "exited", "2026-06-07T12:00:00.000Z");
  const selected = pty.selectPersistentSessionRecords([...exited, duplicateExited, live]);

  assert.equal(selected.length, 12);
  assert.equal(selected.filter((item) => item.config.terminalId === "live-session").length, 1);
  assert.equal(selected.find((item) => item.config.terminalId === "live-session").state.status, "running");
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
  result.handled = await pty.handlePtyTerminalRoutes(
    req,
    res,
    new URL(path, "http://127.0.0.1:3210")
  );
  return result;
}

function fakeSession(process) {
  return {
    id: "fake",
    status: "running",
    cols: 100,
    rows: 30,
    updatedAt: new Date(0).toISOString(),
    process
  };
}

function record(id, status, updatedAt) {
  return {
    config: { terminalId: id, createdAt: updatedAt },
    state: { status, updatedAt }
  };
}

function maskedFrame(value, options = {}) {
  const body = Buffer.from(value);
  const opcode = options.opcode ?? 1;
  const fin = options.fin === false ? 0 : 0x80;
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  let head;
  if (body.length < 126) {
    head = Buffer.from([fin | opcode, 0x80 | body.length]);
  } else {
    head = Buffer.alloc(4);
    head[0] = fin | opcode;
    head[1] = 0x80 | 126;
    head.writeUInt16BE(body.length, 2);
  }
  const masked = Buffer.from(body);
  for (let index = 0; index < masked.length; index += 1) masked[index] ^= mask[index % 4];
  return Buffer.concat([head, mask, masked]);
}

function withoutProviderExecutables(run) {
  const keys = ["PATH", "VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.PATH = "";
  delete process.env.VIBYRA_CODEX_CLI;
  delete process.env.CODEX_CLI_PATH;
  try {
    return run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
