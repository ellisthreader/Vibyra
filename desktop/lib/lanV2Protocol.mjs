import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify
} from "node:crypto";

export const LAN_V2_PROTOCOL = 2;
export const LAN_V2_REPLAY_WINDOW = 64;

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function createPairingTranscript(input) {
  const transcript = {
    protocol: LAN_V2_PROTOCOL,
    accountId: boundedString(input.accountId, "accountId", 128),
    assertionId: boundedString(input.assertionId, "assertionId", 160),
    desktopId: boundedString(input.desktopId, "desktopId", 128),
    desktopEphemeralKey: boundedString(input.desktopEphemeralKey, "desktopEphemeralKey", 256),
    expiresAt: validIsoDate(input.expiresAt, "expiresAt"),
    issuedAt: validIsoDate(input.issuedAt, "issuedAt"),
    phoneDeviceId: boundedString(input.phoneDeviceId, "phoneDeviceId", 128),
    phoneEphemeralKey: boundedString(input.phoneEphemeralKey, "phoneEphemeralKey", 256),
    requestId: boundedString(input.requestId, "requestId", 128)
  };
  if (Date.parse(transcript.expiresAt) <= Date.parse(transcript.issuedAt)) {
    throw new Error("Pairing transcript expiry must be after issue time");
  }
  return transcript;
}

export function transcriptDigest(transcript) {
  return createHash("sha256").update(canonicalJson(createPairingTranscript(transcript))).digest();
}

export function signPairingTranscript(transcript, privateKeyPem) {
  return sign(null, transcriptDigest(transcript), createPrivateKey(privateKeyPem)).toString("base64url");
}

export function verifyPairingTranscript(transcript, signature, publicKeyPem) {
  try {
    return verify(
      null,
      transcriptDigest(transcript),
      createPublicKey(publicKeyPem),
      Buffer.from(String(signature || ""), "base64url")
    );
  } catch {
    return false;
  }
}

export function createEphemeralKeyPair(generateKeyPair = generateKeyPairSync) {
  const { privateKey, publicKey } = generateKeyPair("x25519");
  return {
    privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url"),
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64url")
  };
}

export function deriveSessionKeys({
  privateKey,
  peerPublicKey,
  transcript,
  role
}) {
  if (role !== "desktop" && role !== "phone") throw new Error("LAN V2 role must be desktop or phone");
  const sharedSecret = diffieHellman({
    privateKey: createPrivateKey({
      key: Buffer.from(privateKey, "base64url"),
      format: "der",
      type: "pkcs8"
    }),
    publicKey: createPublicKey({
      key: Buffer.from(peerPublicKey, "base64url"),
      format: "der",
      type: "spki"
    })
  });
  const salt = transcriptDigest(transcript);
  const phoneToDesktop = Buffer.from(hkdfSync(
    "sha256",
    sharedSecret,
    salt,
    Buffer.from("vibyra-lan-v2/phone-to-desktop", "utf8"),
    32
  ));
  const desktopToPhone = Buffer.from(hkdfSync(
    "sha256",
    sharedSecret,
    salt,
    Buffer.from("vibyra-lan-v2/desktop-to-phone", "utf8"),
    32
  ));
  sharedSecret.fill(0);
  return role === "desktop"
    ? { receiveKey: phoneToDesktop, sendKey: desktopToPhone }
    : { receiveKey: desktopToPhone, sendKey: phoneToDesktop };
}

export function encryptRpcEnvelope({
  key,
  sessionId,
  route,
  requestId,
  sequence,
  timestamp = new Date().toISOString(),
  idempotencyKey = "",
  payload,
  randomBytesImpl = randomBytes
}) {
  const metadata = envelopeMetadata({
    sessionId,
    route,
    requestId,
    sequence,
    timestamp,
    idempotencyKey
  });
  const nonce = randomBytesImpl(12);
  const cipher = createCipheriv("aes-256-gcm", normalizeAesKey(key), nonce);
  cipher.setAAD(Buffer.from(canonicalJson(metadata), "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(canonicalJson(payload), "utf8")),
    cipher.final()
  ]);
  return {
    ...metadata,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url")
  };
}

export function decryptRpcEnvelope(envelope, key) {
  const metadata = envelopeMetadata(envelope);
  const nonce = decodeExact(envelope.nonce, 12, "nonce");
  const tag = decodeExact(envelope.tag, 16, "tag");
  const ciphertext = decodeBounded(envelope.ciphertext, 12_000_000, "ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", normalizeAesKey(key), nonce);
  decipher.setAAD(Buffer.from(canonicalJson(metadata), "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return {
    metadata,
    payload: JSON.parse(plaintext.toString("utf8"))
  };
}

export class ReplayWindow {
  constructor(size = LAN_V2_REPLAY_WINDOW) {
    if (!Number.isSafeInteger(size) || size < 1 || size > 1024) {
      throw new Error("Replay window size is invalid");
    }
    this.size = size;
    this.highest = 0;
    this.seen = new Set();
  }

  accept(sequence) {
    const value = validSequence(sequence);
    if (this.seen.has(value)) throw protocolError("LAN_V2_REPLAY", "RPC sequence was already used");
    if (this.highest && value <= this.highest - this.size) {
      throw protocolError("LAN_V2_SEQUENCE_OLD", "RPC sequence is outside the replay window");
    }
    this.seen.add(value);
    if (value > this.highest) this.highest = value;
    const floor = Math.max(1, this.highest - this.size + 1);
    for (const item of this.seen) {
      if (item < floor) this.seen.delete(item);
    }
    return value;
  }
}

export function lanV2Enabled() {
  return envFlag("VIBYRA_LAN_V2_ENABLED", false);
}

export function lanV2Required() {
  return envFlag("VIBYRA_LAN_V2_REQUIRED", false);
}

function envelopeMetadata(input) {
  return {
    protocol: LAN_V2_PROTOCOL,
    sessionId: boundedString(input.sessionId, "sessionId", 160),
    route: validRoute(input.route),
    requestId: boundedString(input.requestId, "requestId", 160),
    sequence: validSequence(input.sequence),
    timestamp: validIsoDate(input.timestamp, "timestamp"),
    idempotencyKey: optionalBoundedString(input.idempotencyKey, "idempotencyKey", 160)
  };
}

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot contain non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw new Error("Canonical JSON cannot contain undefined");
      result[key] = canonicalValue(value[key]);
    }
    return result;
  }
  throw new Error("Canonical JSON contains an unsupported value");
}

function normalizeAesKey(value) {
  const key = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (key.length !== 32) throw new Error("LAN V2 AES key must be 32 bytes");
  return key;
}

function decodeExact(value, bytes, label) {
  const result = Buffer.from(boundedString(value, label, bytes * 2), "base64url");
  if (result.length !== bytes) throw new Error(`LAN V2 ${label} length is invalid`);
  return result;
}

function decodeBounded(value, maxBytes, label) {
  const encoded = boundedString(value, label, Math.ceil(maxBytes * 4 / 3) + 8);
  const result = Buffer.from(encoded, "base64url");
  if (result.length > maxBytes) throw new Error(`LAN V2 ${label} is too large`);
  return result;
}

function validRoute(value) {
  const route = boundedString(value, "route", 512);
  if (!route.startsWith("/") || route.startsWith("//") || /[\r\n#]/.test(route)) {
    throw new Error("LAN V2 route is invalid");
  }
  return route;
}

function validSequence(value) {
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("LAN V2 sequence is invalid");
  return sequence;
}

function validIsoDate(value, label) {
  const date = boundedString(value, label, 40);
  if (!Number.isFinite(Date.parse(date))) throw new Error(`${label} must be an ISO date`);
  return new Date(date).toISOString();
}

function boundedString(value, label, maxLength) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maxLength) throw new Error(`${label} is invalid`);
  return result;
}

function optionalBoundedString(value, label, maxLength) {
  const result = String(value ?? "").trim();
  if (result.length > maxLength) throw new Error(`${label} is invalid`);
  return result;
}

function protocolError(code, message) {
  return Object.assign(new Error(message), { code });
}

function envFlag(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}
