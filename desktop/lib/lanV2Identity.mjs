import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const IDENTITY_VERSION = 1;
const VALIDATION_MESSAGE = Buffer.from("vibyra-lan-v2-desktop-identity", "utf8");

export function loadOrCreateDesktopIdentity({
  filePath = defaultDesktopIdentityPath(),
  now = () => new Date(),
  generateKeyPair = generateKeyPairSync
} = {}) {
  const existing = readIdentity(filePath);
  if (existing) return existing;

  const { privateKey, publicKey } = generateKeyPair("ed25519");
  const identity = normalizeIdentity({
    version: IDENTITY_VERSION,
    createdAt: now().toISOString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" })
  });
  writeIdentity(filePath, identity);
  return identity;
}

export function defaultDesktopIdentityPath() {
  return process.env.VIBYRA_LAN_V2_IDENTITY_PATH
    || join(process.env.VIBYRA_AGENT_HOME || homedir(), ".vibyra-agent", "lan-v2-identity.json");
}

export function desktopIdentityFingerprint(publicKeyPem) {
  const publicKey = createPublicKey(publicKeyPem);
  const der = publicKey.export({ format: "der", type: "spki" });
  return createHash("sha256").update(der).digest("base64url");
}

function readIdentity(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return normalizeIdentity(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function normalizeIdentity(value) {
  if (Number(value?.version) !== IDENTITY_VERSION) {
    throw new Error("Unsupported LAN V2 desktop identity version");
  }
  const privateKeyPem = String(value.privateKeyPem || "");
  const publicKeyPem = String(value.publicKeyPem || "");
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(publicKeyPem);
  const signature = sign(null, VALIDATION_MESSAGE, privateKey);
  if (!verify(null, VALIDATION_MESSAGE, publicKey, signature)) {
    throw new Error("LAN V2 desktop identity key pair does not match");
  }
  return {
    version: IDENTITY_VERSION,
    desktopId: desktopIdentityFingerprint(publicKeyPem),
    createdAt: String(value.createdAt || ""),
    privateKeyPem,
    publicKeyPem
  };
}

function writeIdentity(filePath, identity) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({
    version: identity.version,
    createdAt: identity.createdAt,
    privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem
  }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, filePath);
  chmodSync(filePath, 0o600);
}
