import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  authorizeTerminalGatewayRequest,
  issueTerminalGatewayToken,
  renewTerminalGatewayToken,
  revokeTerminalGatewayToken,
  revokeTerminalGatewayTokensForTerminal,
  verifyTerminalGatewayToken
} from "./terminalGatewayAuth.mjs";

test("issues persisted terminal-scoped tokens with mode-0600 storage", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-1", {
    registryPath,
    now: 1_000,
    ttlMs: 5_000,
    models: ["openai/gpt-5"],
    runtimeId: "codex",
    providerId: "openai",
    adapterId: "openai-responses",
    protocol: "responses",
    nativeModel: "gpt-5",
    billingModel: "openai/gpt-5",
    maxRequestsPerMinute: 2
  });

  assert.match(issued.token, /^vibyra-terminal-/);
  assert.equal((await stat(registryPath)).mode & 0o777, 0o600);
  assert.doesNotMatch(await readFile(registryPath, "utf8"), new RegExp(issued.token));
  const verified = verifyTerminalGatewayToken(issued.token, {
    registryPath,
    now: 2_000,
    model: "openai/gpt-5",
    runtimeId: "codex",
    providerId: "openai",
    adapterId: "openai-responses",
    protocol: "responses",
    nativeModel: "gpt-5",
    billingModel: "openai/gpt-5"
  });
  assert.equal(verified?.terminalId, "terminal-1");
  assert.equal(verified?.runtimeId, "codex");
  assert.equal(verifyTerminalGatewayToken(issued.token, {
    registryPath,
    now: 2_001,
    model: "openai/gpt-5",
    runtimeId: "claude",
    providerId: "openai",
    adapterId: "openai-responses",
    protocol: "responses",
    nativeModel: "gpt-5",
    billingModel: "openai/gpt-5"
  }), null);
  assert.equal(verifyTerminalGatewayToken(issued.token, {
    registryPath,
    now: 2_002
  }), null);
});

test("enforces expiry, rate limits, and token or terminal revocation", async () => {
  const registryPath = await temporaryRegistryPath();
  const first = issueTerminalGatewayToken("terminal-1", {
    registryPath, now: 1_000, ttlMs: 100, maxRequestsPerMinute: 1
  });
  assert.ok(verifyTerminalGatewayToken(first.token, { registryPath, now: 1_001 }));
  assert.equal(verifyTerminalGatewayToken(first.token, { registryPath, now: 1_002 }), null);
  assert.equal(verifyTerminalGatewayToken(first.token, { registryPath, now: 1_101 }), null);

  const second = issueTerminalGatewayToken("terminal-2", { registryPath, now: 2_000 });
  assert.equal(revokeTerminalGatewayToken(second.token, { registryPath, now: 2_001 }), true);
  assert.equal(verifyTerminalGatewayToken(second.token, { registryPath, now: 2_002 }), null);

  const third = issueTerminalGatewayToken("terminal-3", { registryPath, now: 3_000 });
  issueTerminalGatewayToken("terminal-3", { registryPath, now: 3_000 });
  assert.equal(revokeTerminalGatewayTokensForTerminal("terminal-3", {
    registryPath, now: 3_001
  }), 2);
  assert.equal(verifyTerminalGatewayToken(third.token, { registryPath, now: 3_002 }), null);
});

test("detached workers can renew a terminal token without changing its capabilities", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-renew", {
    registryPath,
    now: 1_000,
    ttlMs: 100,
    models: ["deepseek/deepseek-v3"],
    runtimeId: "vibyra-agent"
  });

  const renewed = renewTerminalGatewayToken(issued.token, {
    registryPath,
    now: 1_200,
    ttlMs: 500
  });
  assert.equal(renewed?.terminalId, "terminal-renew");
  assert.ok(verifyTerminalGatewayToken(issued.token, {
    registryPath,
    now: 1_201,
    model: "deepseek/deepseek-v3",
    runtimeId: "vibyra-agent"
  }));
  assert.equal(verifyTerminalGatewayToken(issued.token, {
    registryPath,
    now: 1_202,
    model: "deepseek/other",
    runtimeId: "vibyra-agent"
  }), null);
});

test("gateway request authorization requires loopback and bearer token", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-1", { registryPath, now: 1_000 });

  const forbidden = response();
  assert.equal(authorizeTerminalGatewayRequest(request("192.168.1.9", issued.token), forbidden, {
    registryPath, now: 1_001
  }), null);
  assert.equal(forbidden.status, 403);

  const unauthorized = response();
  assert.equal(authorizeTerminalGatewayRequest(request("127.0.0.1", ""), unauthorized, {
    registryPath, now: 1_001
  }), null);
  assert.equal(unauthorized.status, 401);

  const allowed = response();
  assert.equal(authorizeTerminalGatewayRequest(request("::ffff:127.0.0.1", issued.token), allowed, {
    registryPath, now: 1_001
  })?.terminalId, "terminal-1");
});

test("gateway authorization can accept Gemini API-key headers when explicitly enabled", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-gemini", {
    registryPath,
    now: 1_000,
    runtimeId: "gemini",
    providerId: "google",
    adapterId: "gemini-generate-content",
    protocol: "gemini"
  });
  const allowed = response();
  const req = request("127.0.0.1", "");
  req.headers["x-goog-api-key"] = issued.token;

  assert.equal(authorizeTerminalGatewayRequest(req, allowed, {
    registryPath,
    now: 1_001,
    authSchemes: ["x-goog-api-key"],
    runtimeId: "gemini",
    providerId: "google",
    adapterId: "gemini-generate-content",
    protocol: "gemini"
  })?.terminalId, "terminal-gemini");
});

test("native routes recover the stored billing model without client duplication", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-claude", {
    registryPath,
    now: 1_000,
    models: ["claude-haiku-4-5"],
    runtimeId: "claude",
    providerId: "anthropic",
    adapterId: "anthropic-messages",
    protocol: "anthropic-messages",
    nativeModel: "claude-haiku-4-5",
    billingModel: "anthropic/claude-haiku-4.5"
  });

  const allowed = response();
  const authorization = authorizeTerminalGatewayRequest(
    request("127.0.0.1", issued.token),
    allowed,
    {
      registryPath,
      now: 1_001,
      model: "claude-haiku-4-5",
      runtimeId: "claude",
      providerId: "anthropic",
      adapterId: "anthropic-messages",
      protocol: "anthropic-messages",
      nativeModel: "claude-haiku-4-5"
    }
  );

  assert.equal(authorization?.billingModel, "anthropic/claude-haiku-4.5");
});

test("valid tokens report model switches as capability errors instead of login failures", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-claude", {
    registryPath,
    now: 1_000,
    models: ["claude-haiku-4-5"],
    runtimeId: "claude",
    providerId: "anthropic",
    adapterId: "anthropic-messages",
    protocol: "anthropic-messages",
    nativeModel: "claude-haiku-4-5",
    billingModel: "anthropic/claude-haiku-4.5"
  });
  const rejected = response();

  assert.equal(authorizeTerminalGatewayRequest(
    request("127.0.0.1", issued.token),
    rejected,
    {
      registryPath,
      now: 1_001,
      model: "claude-sonnet-4-6",
      errorProtocol: "anthropic",
      runtimeId: "claude",
      providerId: "anthropic",
      adapterId: "anthropic-messages",
      protocol: "anthropic-messages",
      nativeModel: "claude-sonnet-4-6"
    }
  ), null);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.payload.error.code, "terminal_capability_mismatch");
  assert.equal(rejected.payload.error.type, "invalid_request_error");
  assert.match(rejected.payload.error.message, /locked to claude-haiku-4-5/);
});

async function temporaryRegistryPath() {
  return join(await mkdtemp(join(tmpdir(), "vibyra-gateway-")), "auth.json");
}

function request(remoteAddress, token) {
  return {
    headers: { authorization: token ? `Bearer ${token}` : "" },
    socket: { remoteAddress }
  };
}

function response() {
  return {
    status: null,
    body: "",
    writeHead(status) { this.status = status; },
    end(body = "") {
      this.body = String(body);
      this.payload = this.body ? JSON.parse(this.body) : null;
    }
  };
}
