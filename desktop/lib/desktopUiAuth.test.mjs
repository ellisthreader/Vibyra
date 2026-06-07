import test from "node:test";
import assert from "node:assert/strict";
import { authorizeDesktopUi } from "./desktopUiAuth.mjs";
import { PORT } from "./state.mjs";

test("desktop UI auth allows the local desktop origin", () => {
  assert.equal(authorizeDesktopUi(request(`http://127.0.0.1:${PORT}`), response()), true);
});

test("desktop UI auth rejects foreign browser origins on loopback", () => {
  const res = response();
  assert.equal(authorizeDesktopUi(request("https://attacker.example"), res), false);
  assert.equal(res.status, 403);
});

function request(origin) {
  return { headers: { origin }, socket: { remoteAddress: "127.0.0.1" } };
}

function response() {
  return {
    status: 0,
    writeHead(status) { this.status = status; },
    end() {}
  };
}
