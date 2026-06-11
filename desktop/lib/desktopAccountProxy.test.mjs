import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  desktopAccountUpstreamPath,
  handleDesktopAccountProxy
} from "./desktopAccountProxy.mjs";
import { appState, PORT } from "./state.mjs";

test("account proxy exposes only the allowlisted route mappings", () => {
  assert.equal(desktopAccountUpstreamPath("GET", "/desktop/account-api/sessions"), "/api/account/sessions");
  assert.equal(desktopAccountUpstreamPath("DELETE", "/desktop/account-api/sessions"), "/api/account/sessions");
  assert.equal(desktopAccountUpstreamPath("POST", "/desktop/account-api/profile"), "/api/account/profile");
  assert.equal(desktopAccountUpstreamPath("DELETE", "/desktop/account-api/account"), "/api/account");
  assert.equal(desktopAccountUpstreamPath("GET", "/desktop/account-api/referral"), "/api/referrals/me");
  for (const action of ["checkout", "change", "portal", "cancel"]) {
    assert.equal(
      desktopAccountUpstreamPath("POST", `/desktop/account-api/billing/${action}`),
      `/api/billing/${action}`
    );
  }
  assert.equal(
    desktopAccountUpstreamPath("POST", "/desktop/account-api/provider-delete/google/start"),
    "/api/auth/desktop/google/start"
  );
  assert.equal(
    desktopAccountUpstreamPath(
      "GET",
      `/desktop/account-api/provider-delete/apple/status/${"a".repeat(64)}`
    ),
    `/api/auth/desktop/apple/status/${"a".repeat(64)}`
  );
  assert.equal(desktopAccountUpstreamPath("GET", "/desktop/account-api/profile"), null);
  assert.equal(
    desktopAccountUpstreamPath("POST", "/desktop/account-api/provider-delete/github/start"),
    null
  );
  assert.equal(
    desktopAccountUpstreamPath("GET", "/desktop/account-api/provider-delete/google/status/not-a-flow"),
    null
  );
  assert.equal(desktopAccountUpstreamPath("GET", "/desktop/account-api/https://attacker.test"), null);
  assert.equal(desktopAccountUpstreamPath("DELETE", "/desktop/account-api/devices/a/b"), null);
});

test("provider deletion start injects purpose and forwards the server-held token", async () => {
  appState.desktopAccountToken = "desktop-account-token";
  let upstream;
  await handleDesktopAccountProxy(
    request("POST", { purpose: "signin", identityToken: "must-not-forward" }),
    response(),
    localUrl("/desktop/account-api/provider-delete/google/start"),
    {
      apiUrl: "https://api.example.test",
      fetchImpl: async (url, init) => {
        upstream = { url, init };
        return fetchResponse('{"ok":true}');
      }
    }
  );

  assert.equal(upstream.url, "https://api.example.test/api/auth/desktop/google/start");
  assert.equal(upstream.init.headers.Authorization, "Bearer desktop-account-token");
  assert.deepEqual(JSON.parse(upstream.init.body), { purpose: "deletion" });
  assert.equal(upstream.init.body.includes("identityToken"), false);
});

test("provider deletion status forwards the server-held token without a body", async () => {
  appState.desktopAccountToken = "desktop-account-token";
  const flowId = "b".repeat(64);
  let upstream;
  await handleDesktopAccountProxy(
    request("GET"),
    response(),
    localUrl(`/desktop/account-api/provider-delete/apple/status/${flowId}`),
    {
      apiUrl: "https://api.example.test",
      fetchImpl: async (url, init) => {
        upstream = { url, init };
        return fetchResponse('{"ok":true,"status":"pending"}');
      }
    }
  );

  assert.equal(upstream.url, `https://api.example.test/api/auth/desktop/apple/status/${flowId}`);
  assert.equal(upstream.init.headers.Authorization, "Bearer desktop-account-token");
  assert.equal(upstream.init.body, undefined);
});

test("account proxy forwards the stored token, JSON body, status, and payload", async () => {
  appState.desktopAccountToken = "desktop-account-token";
  let upstream;
  const res = response();
  await handleDesktopAccountProxy(
    request("POST", { name: "Updated Name" }),
    res,
    localUrl("/desktop/account-api/profile"),
    {
      apiUrl: "https://api.example.test",
      fetchImpl: async (url, init) => {
        upstream = { url, init };
        return fetchResponse('{"ok":true,"user":{"name":"Updated Name"}}', 202);
      }
    }
  );

  assert.equal(upstream.url, "https://api.example.test/api/account/profile");
  assert.equal(upstream.init.headers.Authorization, "Bearer desktop-account-token");
  assert.equal(upstream.init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(upstream.init.body), { name: "Updated Name" });
  assert.equal(res.status, 202);
  assert.equal(res.body, '{"ok":true,"user":{"name":"Updated Name"}}');
});

test("account proxy preserves encoded device IDs as one upstream segment", async () => {
  appState.desktopAccountToken = "token";
  let upstreamUrl;
  await handleDesktopAccountProxy(
    request("DELETE"),
    response(),
    localUrl("/desktop/account-api/devices/office%20pc%2Fprimary"),
    {
      apiUrl: "https://api.example.test",
      fetchImpl: async (url) => {
        upstreamUrl = url;
        return fetchResponse('{"ok":true}');
      }
    }
  );
  assert.equal(upstreamUrl, "https://api.example.test/api/account/devices/office%20pc%2Fprimary");
});

test("account proxy returns structured timeout and connectivity errors", async () => {
  appState.desktopAccountToken = "token";
  const timeoutRes = response();
  await handleDesktopAccountProxy(request("GET"), timeoutRes, localUrl("/desktop/account-api/sessions"), {
    timeoutMs: 5,
    fetchImpl: () => new Promise(() => {})
  });
  assert.equal(timeoutRes.status, 504);
  assert.equal(JSON.parse(timeoutRes.body).code, "account_proxy_timeout");

  const connectivityRes = response();
  await handleDesktopAccountProxy(request("GET"), connectivityRes, localUrl("/desktop/account-api/referral"), {
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    }
  });
  assert.equal(connectivityRes.status, 502);
  assert.equal(JSON.parse(connectivityRes.body).code, "account_proxy_unavailable");
});

test("unsupported account routes are handled without reaching upstream", async () => {
  appState.desktopAccountToken = "token";
  let called = false;
  const res = response();
  const handled = await handleDesktopAccountProxy(
    request("GET"),
    res,
    localUrl("/desktop/account-api/billing/portal/%252e%252e/sessions"),
    { fetchImpl: async () => { called = true; } }
  );
  assert.equal(handled, true);
  assert.equal(called, false);
  assert.equal(res.status, 404);
  assert.equal(JSON.parse(res.body).code, "unsupported_account_route");
});

function request(method, body) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = { origin: `http://127.0.0.1:${PORT}` };
  req.socket = { remoteAddress: "127.0.0.1" };
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", Buffer.from(JSON.stringify(body)));
    req.emit("end");
  });
  return req;
}

function response() {
  return {
    status: 0,
    body: "",
    writeHead(status, responseHeaders) {
      this.status = status;
      this.headers = responseHeaders;
    },
    end(body = "") {
      this.body = String(body);
    }
  };
}

function localUrl(pathname) {
  return new URL(`http://127.0.0.1:${PORT}${pathname}`);
}

function fetchResponse(body, status = 200) {
  return {
    status,
    headers: { get: () => "application/json; charset=utf-8" },
    async text() {
      return body;
    }
  };
}
