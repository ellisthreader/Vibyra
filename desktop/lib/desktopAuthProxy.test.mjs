import assert from "node:assert/strict";
import test from "node:test";
import {
  pollDesktopProviderAuth,
  requestDesktopAuth,
  startDesktopProviderAuth
} from "./desktopAuthProxy.mjs";

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
  let attempts = 0;
  await assert.rejects(
    requestDesktopAuth("login", {}, async () => {
      attempts += 1;
      throw new TypeError("fetch failed");
    }),
    (error) => error?.status === 502
      && /account service/i.test(error.message)
      && error.cause?.message === "fetch failed"
  );
  assert.equal(attempts, 2);
});

test("desktop auth proxy recovers from a transient fetch failure", async () => {
  let attempts = 0;
  const result = await requestDesktopAuth("login", {}, async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("temporary DNS failure");
    return jsonResponse({ token: "token", user: { id: 7 } });
  });

  assert.equal(attempts, 2);
  assert.equal(result.token, "token");
});

test("desktop provider auth starts and polls through the configured backend", async () => {
  const requests = [];
  const started = await startDesktopProviderAuth("google", {
    deviceName: "Office PC",
    installId: "desktop-install",
    publicIp: "203.0.113.7",
    ignored: "value"
  }, async (url, init) => {
    requests.push({ url, init });
    return jsonResponse({ flowId: "a".repeat(64), authUrl: "https://accounts.google.test/auth" });
  });
  const completed = await pollDesktopProviderAuth("google", started.flowId, async (url, init) => {
    requests.push({ url, init });
    return jsonResponse({ status: "complete", token: "token", user: { id: 7 } });
  });

  assert.match(requests[0].url, /\/api\/auth\/desktop\/google\/start$/);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    deviceName: "Office PC",
    installId: "desktop-install",
    publicIp: "203.0.113.7"
  });
  assert.match(requests[1].url, new RegExp(`/api/auth/desktop/google/status/${"a".repeat(64)}$`));
  assert.equal(completed.token, "token");
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
