import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { send } from "./http.mjs";

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REQUESTS_PER_MINUTE = 120;

export function issueTerminalGatewayToken(terminalId, options = {}) {
  const id = normalizedTerminalId(terminalId);
  const now = options.now ?? Date.now();
  const token = `vibyra-terminal-${randomBytes(32).toString("base64url")}`;
  const registry = readRegistry(options.registryPath, now);
  registry.tokens[tokenHash(token)] = {
    terminalId: id,
    issuedAt: now,
    expiresAt: now + boundedPositiveInteger(options.ttlMs, DEFAULT_TTL_MS, MAX_TTL_MS),
    models: normalizedModels(options.models ?? (options.model ? [options.model] : [])),
    runtimeId: normalizedConstraint(options.runtimeId),
    providerId: normalizedConstraint(options.providerId),
    adapterId: normalizedConstraint(options.adapterId),
    protocol: normalizedConstraint(options.protocol),
    nativeModel: normalizedConstraint(options.nativeModel),
    billingModel: normalizedConstraint(options.billingModel),
    maxRequestsPerMinute: positiveInteger(
      options.maxRequestsPerMinute,
      DEFAULT_REQUESTS_PER_MINUTE
    ),
    requests: []
  };
  writeRegistry(registry, options.registryPath);
  return {
    token,
    terminalId: id,
    expiresAt: new Date(registry.tokens[tokenHash(token)].expiresAt).toISOString()
  };
}

export function verifyTerminalGatewayToken(token, options = {}) {
  return verifyTerminalGatewayTokenResult(token, options).authorization;
}

export function renewTerminalGatewayToken(token, options = {}) {
  const value = String(token || "").trim();
  if (!value) return null;
  const now = options.now ?? Date.now();
  const registry = readRegistry(options.registryPath, now, { pruneExpired: false });
  const hash = tokenHash(value);
  const storedHash = Object.keys(registry.tokens).find((candidate) => secureEqual(candidate, hash));
  if (!storedHash || !validRecord(registry.tokens[storedHash])) return null;
  registry.tokens[storedHash].expiresAt = now
    + boundedPositiveInteger(options.ttlMs, DEFAULT_TTL_MS, MAX_TTL_MS);
  writeRegistry(registry, options.registryPath);
  return {
    terminalId: registry.tokens[storedHash].terminalId,
    expiresAt: new Date(registry.tokens[storedHash].expiresAt).toISOString()
  };
}

function verifyTerminalGatewayTokenResult(token, options = {}) {
  const value = String(token || "").trim();
  if (!value) return { authorization: null, reason: "invalid" };

  const now = options.now ?? Date.now();
  const registry = readRegistry(options.registryPath, now);
  const hash = tokenHash(value);
  const storedHash = Object.keys(registry.tokens).find((candidate) => secureEqual(candidate, hash));
  if (!storedHash) return { authorization: null, reason: "invalid" };

  const record = registry.tokens[storedHash];
  const model = String(options.model || "").trim();
  const nativeModelAliases = normalizedModels(options.nativeModelAliases);
  const nativeModelAlias = nativeModelAliases.includes(model)
    && constraintMatches(record.runtimeId, options.runtimeId)
    && constraintMatches(record.providerId, options.providerId);
  const authorizedNativeModel = nativeModelAlias ? record.nativeModel : options.nativeModel;
  if (record.expiresAt <= now) {
    delete registry.tokens[storedHash];
    writeRegistry(registry, options.registryPath);
    return { authorization: null, reason: "expired" };
  }
  if (
    (record.models.length && !record.models.includes(model) && !nativeModelAlias)
    || !constraintMatches(record.runtimeId, options.runtimeId)
    || !constraintMatches(record.providerId, options.providerId)
    || !constraintMatches(record.adapterId, options.adapterId)
    || !constraintMatches(record.protocol, options.protocol)
    || !constraintMatches(record.nativeModel, authorizedNativeModel)
    || (
      options.billingModel !== undefined
      && !constraintMatches(record.billingModel, options.billingModel)
    )
  ) {
    return { authorization: null, reason: "capability", record, model };
  }

  const windowStart = now - 60_000;
  record.requests = record.requests.filter((timestamp) => timestamp > windowStart);
  if (options.consume !== false && record.requests.length >= record.maxRequestsPerMinute) {
    return { authorization: null, reason: "rate-limit", record };
  }
  if (options.consume !== false) {
    record.requests.push(now);
    writeRegistry(registry, options.registryPath);
  }
  return { reason: "", authorization: {
    terminalId: record.terminalId,
    expiresAt: new Date(record.expiresAt).toISOString(),
    models: [...record.models],
    runtimeId: record.runtimeId,
    providerId: record.providerId,
    adapterId: record.adapterId,
    protocol: record.protocol,
    nativeModel: record.nativeModel,
    billingModel: record.billingModel
  } };
}

export function revokeTerminalGatewayToken(token, options = {}) {
  const registry = readRegistry(options.registryPath, options.now ?? Date.now());
  const hash = tokenHash(String(token || "").trim());
  const storedHash = Object.keys(registry.tokens).find((candidate) => secureEqual(candidate, hash));
  if (!storedHash) return false;
  delete registry.tokens[storedHash];
  writeRegistry(registry, options.registryPath);
  return true;
}

export function revokeTerminalGatewayTokensForTerminal(terminalId, options = {}) {
  const id = normalizedTerminalId(terminalId);
  const registry = readRegistry(options.registryPath, options.now ?? Date.now());
  let revoked = 0;
  for (const [hash, record] of Object.entries(registry.tokens)) {
    if (record.terminalId !== id) continue;
    delete registry.tokens[hash];
    revoked += 1;
  }
  if (revoked) writeRegistry(registry, options.registryPath);
  return revoked;
}

export function authorizeTerminalGatewayRequest(req, res, options = {}) {
  if (!isAllowedGatewayRequest(req, options)) {
    sendGatewayError(res, 403, {
      code: "terminal_gateway_forbidden",
      message: "The terminal gateway is only available on this computer."
    }, options.errorProtocol);
    return null;
  }
  const result = verifyTerminalGatewayTokenResult(requestToken(req, options), options);
  if (result.authorization) return result.authorization;
  if (result.reason === "capability") {
    const expected = String(result.record?.nativeModel || result.record?.models?.[0] || "").trim();
    const requested = String(result.model || options.model || "").trim();
    const changedModel = expected && requested && expected !== requested;
    sendGatewayError(res, 400, {
      code: "terminal_capability_mismatch",
      message: changedModel
        ? `This terminal is locked to ${expected}. Open a new Vibyra terminal to use ${requested}; /model cannot change its billing authorization.`
        : "This request does not match the provider, model, or protocol authorized for this terminal."
    }, options.errorProtocol);
    return null;
  }
  if (result.reason === "rate-limit") {
    sendGatewayError(res, 429, {
      code: "terminal_gateway_rate_limit",
      message: "This terminal is sending requests too quickly. Try again shortly."
    }, options.errorProtocol);
    return null;
  }
  if (!result.authorization) {
    sendGatewayError(res, 401, {
      code: "terminal_gateway_unauthorized",
      message: "Missing, expired, or invalid terminal gateway token."
    }, options.errorProtocol);
    return null;
  }
  return result.authorization;
}

function sendGatewayError(res, status, error, protocol = "") {
  if (protocol === "anthropic") {
    send(res, status, {
      type: "error",
      error: {
        type: status === 429 ? "rate_limit_error" : "invalid_request_error",
        ...error
      }
    });
    return;
  }
  if (protocol === "gemini") {
    send(res, status, {
      error: {
        code: status,
        message: error.message,
        status: status === 429 ? "RESOURCE_EXHAUSTED" : "FAILED_PRECONDITION",
        details: [{ code: error.code }]
      }
    });
    return;
  }
  send(res, status, { error });
}

function readRegistry(pathOverride, now, options = {}) {
  const path = pathOverride || defaultRegistryPath();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const tokens = parsed?.tokens && typeof parsed.tokens === "object" ? parsed.tokens : {};
    for (const [hash, record] of Object.entries(tokens)) {
      if (!validRecord(record) || (options.pruneExpired !== false && record.expiresAt <= now)) {
        delete tokens[hash];
      }
    }
    return { version: 1, tokens };
  } catch {
    return { version: 1, tokens: {} };
  }
}

function writeRegistry(registry, pathOverride) {
  const path = pathOverride || defaultRegistryPath();
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(registry)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

function defaultRegistryPath() {
  return join(process.env.VIBYRA_AGENT_HOME || join(homedir(), ".vibyra-agent"), "terminal-gateway-auth.json");
}

function bearerToken(header) {
  const match = String(header || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function requestToken(req, options) {
  const schemes = Array.isArray(options.authSchemes) && options.authSchemes.length
    ? options.authSchemes
    : ["bearer"];
  for (const scheme of schemes) {
    if (scheme === "bearer") {
      const token = bearerToken(req.headers?.authorization);
      if (token) return token;
    }
    if (scheme === "x-goog-api-key") {
      const token = String(req.headers?.["x-goog-api-key"] || "").trim();
      if (token) return token;
    }
  }
  return "";
}

function isAllowedGatewayRequest(req, options) {
  const address = normalizedIpv4Address(req.socket?.remoteAddress);
  if (isLoopbackAddress(address)) return true;
  if (!options.allowContainerNetwork) return false;
  const networks = Array.isArray(options.containerNetworks)
    ? options.containerNetworks
    : dockerBridgeNetworks();
  return networks.some((network) => sameIpv4Subnet(address, network.address, network.netmask));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function dockerBridgeNetworks() {
  return Object.entries(networkInterfaces())
    .filter(([name]) => name === "docker0" || name.startsWith("br-"))
    .flatMap(([, entries]) => entries || [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => ({ address: entry.address, netmask: entry.netmask }));
}

function normalizedIpv4Address(value) {
  const address = String(value || "").trim();
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function sameIpv4Subnet(remoteAddress, localAddress, netmask) {
  const remote = ipv4Integer(remoteAddress);
  const local = ipv4Integer(localAddress);
  const mask = ipv4Integer(netmask);
  return remote !== null && local !== null && mask !== null
    && (remote & mask) === (local & mask);
}

function ipv4Integer(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    result = ((result << 8) | octet) >>> 0;
  }
  return result;
}

function normalizedTerminalId(terminalId) {
  const value = String(terminalId || "").trim();
  if (!value || value.length > 200) throw new TypeError("A valid terminalId is required.");
  return value;
}

function normalizedModels(models) {
  if (!Array.isArray(models)) return [];
  return [...new Set(models.map((model) => String(model || "").trim()).filter(Boolean))];
}

function normalizedConstraint(value) {
  return String(value || "").trim().slice(0, 200);
}

function constraintMatches(expected, actual) {
  const required = normalizedConstraint(expected);
  if (!required) return true;
  return required === normalizedConstraint(actual);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function boundedPositiveInteger(value, fallback, maximum) {
  return Math.min(positiveInteger(value, fallback), maximum);
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validRecord(record) {
  return record
    && typeof record.terminalId === "string"
    && Number.isFinite(record.expiresAt)
    && Array.isArray(record.models)
    && optionalString(record.runtimeId)
    && optionalString(record.providerId)
    && optionalString(record.adapterId)
    && optionalString(record.protocol)
    && optionalString(record.nativeModel)
    && optionalString(record.billingModel)
    && Number.isInteger(record.maxRequestsPerMinute)
    && Array.isArray(record.requests);
}

function optionalString(value) {
  return value === undefined || typeof value === "string";
}
