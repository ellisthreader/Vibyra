import assert from "node:assert/strict";
import test from "node:test";
import { requestDesktopAuth } from "./desktopAuthProxy.mjs";

test("desktop auth proxy forwards only supported account fields", async () => {
  let request;
  const result = await requestDesktopAuth("login", {
    email: "user@example.test",
    password: "secret12",
    deviceName: "Office PC",
    installId: "desktop-install",
    publicIp: "203.0.113.7",
    ignored: "value"
  }, async (url, init) => {
    request = { url, init };
    return jsonResponse({ token: "token", user: { id: 7 } });
  });

  assert.match(request.url, /\/api\/auth\/login$/);
  assert.deepEqual(JSON.parse(request.init.body), {
    email: "user@example.test",
    password: "secret12",
    deviceName: "Office PC",
    installId: "desktop-install",
    publicIp: "203.0.113.7"
  });
  assert.equal(result.token, "token");
});

test("desktop auth proxy preserves backend validation errors", async () => {
  await assert.rejects(
    requestDesktopAuth("login", {}, async () => jsonResponse({
      error: "Invalid email or password."
    }, 422)),
    (error) => error?.status === 422 && error.message === "Invalid email or password."
  );
});

test("desktop auth proxy reports upstream connectivity failures clearly", async () => {
  await assert.rejects(
    requestDesktopAuth("login", {}, async () => {
      throw new TypeError("fetch failed");
    }),
    (error) => error?.status === 502 && /internet connection/i.test(error.message)
  );
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
