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
import {
  terminalProviderAdapterForModel,
  terminalProviderIdForModel
} from "./aiTerminalProviderAdapters.mjs";

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
    ...exactGrant(),
    registryPath, now: 1_000, ttlMs: 100, maxRequestsPerMinute: 1
  });
  assert.ok(verifyTerminalGatewayToken(first.token, exactAuthorization({ registryPath, now: 1_001 })));
  assert.equal(verifyTerminalGatewayToken(first.token, exactAuthorization({ registryPath, now: 1_002 })), null);
  assert.equal(verifyTerminalGatewayToken(first.token, exactAuthorization({ registryPath, now: 1_101 })), null);

  const second = issueTerminalGatewayToken("terminal-2", {
    ...exactGrant(), registryPath, now: 2_000
  });
  assert.equal(revokeTerminalGatewayToken(second.token, { registryPath, now: 2_001 }), true);
  assert.equal(verifyTerminalGatewayToken(second.token, exactAuthorization({ registryPath, now: 2_002 })), null);

  const third = issueTerminalGatewayToken("terminal-3", {
    ...exactGrant(), registryPath, now: 3_000
  });
  issueTerminalGatewayToken("terminal-3", {
    ...exactGrant(), registryPath, now: 3_000
  });
  assert.equal(revokeTerminalGatewayTokensForTerminal("terminal-3", {
    registryPath, now: 3_001
  }), 2);
  assert.equal(verifyTerminalGatewayToken(third.token, { registryPath, now: 3_002 }), null);
});

test("detached workers can renew a terminal token without changing its capabilities", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-renew", {
    ...exactGrant({
      models: ["deepseek/deepseek-v3"],
      runtimeId: "vibyra-agent",
      providerId: "deepseek",
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: "deepseek/deepseek-v3",
      billingModel: "deepseek/deepseek-v3"
    }),
    registryPath,
    now: 1_000,
    ttlMs: 100
  });

  const renewed = renewTerminalGatewayToken(issued.token, {
    registryPath,
    now: 1_050,
    ttlMs: 500
  });
  assert.equal(renewed?.terminalId, "terminal-renew");
  assert.ok(verifyTerminalGatewayToken(issued.token, {
    registryPath,
    now: 1_101,
    model: "deepseek/deepseek-v3",
    runtimeId: "vibyra-agent",
    providerId: "deepseek",
    adapterId: "responses",
    protocol: "openai-responses",
    nativeModel: "deepseek/deepseek-v3",
    billingModel: "deepseek/deepseek-v3"
  }));
  assert.equal(verifyTerminalGatewayToken(issued.token, {
    registryPath,
    now: 1_202,
    model: "deepseek/other",
    runtimeId: "vibyra-agent",
    providerId: "deepseek",
    adapterId: "responses",
    protocol: "openai-responses",
    nativeModel: "deepseek/deepseek-v3",
    billingModel: "deepseek/deepseek-v3"
  }), null);
});

test("expired terminal tokens cannot be renewed", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-expired", {
    ...exactGrant(),
    registryPath,
    now: 1_000,
    ttlMs: 100
  });

  assert.equal(renewTerminalGatewayToken(issued.token, {
    registryPath,
    now: 1_101,
    ttlMs: 500
  }), null);
  assert.equal(
    verifyTerminalGatewayToken(issued.token, exactAuthorization({ registryPath, now: 1_102 })),
    null
  );
});

test("terminal gateway grants fail closed without exact capabilities", () => {
  assert.throws(
    () => issueTerminalGatewayToken("terminal-broad", { model: "openai/gpt-5" }),
    /require exact model, runtime, provider, adapter, protocol/
  );
});

test("gateway request authorization requires an approved local transport and bearer token", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-1", {
    ...exactGrant(), registryPath, now: 1_000
  });

  const forbidden = response();
  assert.equal(authorizeTerminalGatewayRequest(request("192.168.1.9", issued.token), forbidden, {
    ...exactAuthorization(), registryPath, now: 1_001
  }), null);
  assert.equal(forbidden.status, 403);

  const unauthorized = response();
  assert.equal(authorizeTerminalGatewayRequest(request("127.0.0.1", ""), unauthorized, {
    registryPath, now: 1_001
  }), null);
  assert.equal(unauthorized.status, 401);

  const allowed = response();
  assert.equal(authorizeTerminalGatewayRequest(request("::ffff:127.0.0.1", issued.token), allowed, {
    ...exactAuthorization(), registryPath, now: 1_001
  })?.terminalId, "terminal-1");

  const container = response();
  assert.equal(authorizeTerminalGatewayRequest(request("172.17.0.2", issued.token), container, {
    registryPath,
    now: 1_002,
    ...exactAuthorization(),
    allowContainerNetwork: true,
    containerNetworks: [{
      address: "172.17.0.1",
      netmask: "255.255.0.0"
    }]
  })?.terminalId, "terminal-1");

  const lan = response();
  assert.equal(authorizeTerminalGatewayRequest(request("192.168.1.9", issued.token), lan, {
    registryPath,
    now: 1_003,
    ...exactAuthorization(),
    allowContainerNetwork: true,
    containerNetworks: [{
      address: "172.17.0.1",
      netmask: "255.255.0.0"
    }]
  }), null);
  assert.equal(lan.status, 403);
});

test("gateway authorization can accept Gemini API-key headers when explicitly enabled", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-gemini", {
    registryPath,
    now: 1_000,
    models: ["gemini-3.5-flash"],
    runtimeId: "gemini",
    providerId: "google",
    adapterId: "gemini-generate-content",
    protocol: "gemini",
    nativeModel: "gemini-3.5-flash",
    billingModel: "google/gemini-3.5-flash"
  });
  const allowed = response();
  const req = request("127.0.0.1", "");
  req.headers["x-goog-api-key"] = issued.token;

  assert.equal(authorizeTerminalGatewayRequest(req, allowed, {
    registryPath,
    now: 1_001,
    authSchemes: ["x-goog-api-key"],
    model: "gemini-3.5-flash",
    runtimeId: "gemini",
    providerId: "google",
    adapterId: "gemini-generate-content",
    protocol: "gemini",
    nativeModel: "gemini-3.5-flash"
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

test("custom provider Responses grants authorize with registry-derived identities", async () => {
  for (const model of [
    "google/gemma-4-31b-it",
    "deepseek/deepseek-v3.2",
    "meta-llama/llama-4",
    "cohere/command-a"
  ]) {
    const registryPath = await temporaryRegistryPath();
    const providerId = terminalProviderIdForModel(model);
    const runtimeId = terminalProviderAdapterForModel(model)?.runtimeId;
    const issued = issueTerminalGatewayToken(`terminal-${providerId}`, {
      registryPath,
      now: 1_000,
      models: [model],
      runtimeId,
      providerId,
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: model,
      billingModel: model
    });
    const accepted = response();

    const authorization = authorizeTerminalGatewayRequest(
      request("127.0.0.1", issued.token),
      accepted,
      {
        registryPath,
        now: 1_001,
        model,
        runtimeId,
        providerId,
        adapterId: "responses",
        protocol: "openai-responses",
        nativeModel: model
      }
    );

    assert.equal(authorization?.billingModel, model, model);
    assert.equal(accepted.status, null, model);
  }
});

test("Grok Chat Completions grants bind the native and billing models", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-grok", {
    registryPath,
    now: 1_000,
    models: ["x-ai/grok-4.20", "grok-4.20"],
    runtimeId: "grok",
    providerId: "x-ai",
    adapterId: "openai-chat-completions",
    protocol: "openai-chat-completions",
    nativeModel: "grok-4.20",
    billingModel: "x-ai/grok-4.20"
  });
  const accepted = response();

  const authorization = authorizeTerminalGatewayRequest(
    request("127.0.0.1", issued.token),
    accepted,
    {
      registryPath,
      now: 1_001,
      model: "grok-4.20",
      runtimeId: "grok",
      providerId: "x-ai",
      adapterId: "openai-chat-completions",
      protocol: "openai-chat-completions",
      nativeModel: "grok-4.20"
    }
  );

  assert.equal(authorization?.billingModel, "x-ai/grok-4.20");
  assert.equal(accepted.status, null);
});

test("Grok session-title requests may use the fixed native alias without widening billing", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-grok-title", {
    registryPath,
    now: 1_000,
    models: ["x-ai/grok-4.20", "grok-4.20"],
    runtimeId: "grok",
    providerId: "x-ai",
    adapterId: "openai-chat-completions",
    protocol: "openai-chat-completions",
    nativeModel: "grok-4.20",
    billingModel: "x-ai/grok-4.20"
  });
  const accepted = response();

  const authorization = authorizeTerminalGatewayRequest(
    request("127.0.0.1", issued.token),
    accepted,
    {
      registryPath,
      now: 1_001,
      model: "grok-build",
      runtimeId: "grok",
      providerId: "x-ai",
      adapterId: "openai-chat-completions",
      protocol: "openai-chat-completions",
      nativeModel: "grok-build",
      nativeModelAliases: ["grok-build"]
    }
  );

  assert.equal(authorization?.nativeModel, "grok-4.20");
  assert.equal(authorization?.billingModel, "x-ai/grok-4.20");
  assert.equal(accepted.status, null);
});

test("native model aliases cannot cross runtime or provider capabilities", async () => {
  const registryPath = await temporaryRegistryPath();
  const issued = issueTerminalGatewayToken("terminal-grok-alias", {
    registryPath,
    now: 1_000,
    models: ["x-ai/grok-4.20", "grok-4.20"],
    runtimeId: "grok",
    providerId: "x-ai",
    adapterId: "openai-chat-completions",
    protocol: "openai-chat-completions",
    nativeModel: "grok-4.20",
    billingModel: "x-ai/grok-4.20"
  });
  const rejected = response();

  assert.equal(authorizeTerminalGatewayRequest(
    request("127.0.0.1", issued.token),
    rejected,
    {
      registryPath,
      now: 1_001,
      model: "grok-build",
      runtimeId: "claude",
      providerId: "anthropic",
      adapterId: "openai-chat-completions",
      protocol: "openai-chat-completions",
      nativeModel: "grok-build",
      nativeModelAliases: ["grok-build"]
    }
  ), null);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.payload.error.code, "terminal_capability_mismatch");
});

test("same-model capability mismatches do not claim the model changed", async () => {
  const registryPath = await temporaryRegistryPath();
  const model = "deepseek/deepseek-v3.2";
  const issued = issueTerminalGatewayToken("terminal-grok", {
    registryPath,
    now: 1_000,
    models: [model],
    runtimeId: "vibyra-agent",
    providerId: "x-ai",
    adapterId: "responses",
    protocol: "openai-responses",
    nativeModel: model,
    billingModel: model
  });
  const rejected = response();

  assert.equal(authorizeTerminalGatewayRequest(
    request("127.0.0.1", issued.token),
    rejected,
    {
      registryPath,
      now: 1_001,
      model,
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: model
    }
  ), null);
  assert.equal(rejected.status, 400);
  assert.doesNotMatch(rejected.payload.error.message, /Open a new Vibyra terminal/);
  assert.match(rejected.payload.error.message, /provider, model, or protocol/);
});

async function temporaryRegistryPath() {
  return join(await mkdtemp(join(tmpdir(), "vibyra-gateway-")), "auth.json");
}

function exactGrant(overrides = {}) {
  return {
    models: ["openai/gpt-5"],
    runtimeId: "codex",
    providerId: "openai",
    adapterId: "responses",
    protocol: "openai-responses",
    nativeModel: "openai/gpt-5",
    billingModel: "openai/gpt-5",
    ...overrides
  };
}

function exactAuthorization(overrides = {}) {
  return {
    model: "openai/gpt-5",
    runtimeId: "codex",
    providerId: "openai",
    adapterId: "responses",
    protocol: "openai-responses",
    nativeModel: "openai/gpt-5",
    billingModel: "openai/gpt-5",
    ...overrides
  };
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
