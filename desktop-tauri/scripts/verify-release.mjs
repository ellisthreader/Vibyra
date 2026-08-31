import { createHash, createPublicKey, verify as verifyEd25519 } from "node:crypto";
import {
  createReadStream,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const bundles = {
  windows: { suffix: "x64-setup.exe", target: "windows", arch: "x86_64", type: "nsis" },
  appimage: { suffix: "x86_64.AppImage", target: "linux", arch: "x86_64", type: "appimage" },
  deb: { suffix: "amd64.deb", target: "linux", arch: "x86_64", type: "deb" },
};
const fail = (message) => {
  throw new Error(message);
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));

export function readDesktopVersion(root = desktop) {
  const packageVersion = json(resolve(root, "package.json")).version;
  const tauriVersion = json(resolve(root, "src-tauri/tauri.conf.json")).version;
  if (packageVersion !== tauriVersion) {
    fail(`Version mismatch: package.json=${packageVersion}, tauri.conf.json=${tauriVersion}`);
  }
  if (!VERSION_PATTERN.test(packageVersion)) fail(`Invalid release version: ${packageVersion}`);
  return packageVersion;
}
async function hashes(path) {
  const sha256 = createHash("sha256");
  const blake2b = createHash("blake2b512");
  for await (const chunk of createReadStream(path)) {
    sha256.update(chunk);
    blake2b.update(chunk);
  }
  return { sha256: sha256.digest("hex"), blake2b: blake2b.digest() };
}
function signatureParts(value, label = "signature") {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(`${label} is not base64`);
  const lines = Buffer.from(value, "base64").toString("utf8").trim().split(/\r?\n/);
  const packet = Buffer.from(lines[1] ?? "", "base64");
  const global = Buffer.from(lines[3] ?? "", "base64");
  if (!lines[0]?.startsWith("untrusted comment:") ||
      !lines[2]?.startsWith("trusted comment: ") || packet.length !== 74 || global.length !== 64) {
    fail(`${label} is not a minisign payload`);
  }
  return { packet, global, trusted: lines[2].slice("trusted comment: ".length) };
}
function updaterPublicKey() {
  const encoded = json(resolve(desktop, "src-tauri/tauri.conf.json")).plugins?.updater?.pubkey ?? "";
  const lines = Buffer.from(encoded, "base64").toString("utf8").trim().split(/\r?\n/);
  const packet = Buffer.from(lines[1] ?? "", "base64");
  if (packet.length !== 42 || packet.subarray(0, 2).toString() !== "Ed") {
    fail("Configured updater public key is invalid");
  }
  return packet;
}

function updaterSignature(value, label) {
  const { packet, global, trusted } = signatureParts(value, label);
  const publicPacket = updaterPublicKey();
  if (packet.subarray(0, 2).toString() !== "ED") fail(`${label} is not pre-hashed`);
  if (!packet.subarray(2, 10).equals(publicPacket.subarray(2, 10))) fail(`${label} uses another key`);
  const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const key = createPublicKey({
    key: Buffer.concat([derPrefix, publicPacket.subarray(10)]),
    format: "der",
    type: "spki",
  });
  const signature = packet.subarray(10);
  const commentPayload = Buffer.concat([signature, Buffer.from(trusted)]);
  if (!verifyEd25519(null, commentPayload, key, global)) fail(`${label} trusted comment is invalid`);
  return { key, signature };
}
function verifySignature(value, digest, label) {
  const { key, signature } = updaterSignature(value, label);
  if (!verifyEd25519(null, digest, key, signature)) fail(`${label} does not verify this artifact`);
}

function feedUrl(spec, version) {
  const config = json(resolve(desktop, "src-tauri/tauri.conf.json"));
  const endpoints = config.plugins?.updater?.endpoints ?? [];
  if (endpoints.length !== 1) fail("Exactly one updater endpoint is required");
  const rendered = endpoints[0]
    .replace("{{target}}", spec.target)
    .replace("{{arch}}", spec.arch)
    .replace("{{bundle_type}}", spec.type)
    .replace("{{current_version}}", version);
  if (new URL(rendered).protocol !== "https:") fail("Updater endpoint must use HTTPS");
  return rendered;
}

export async function verifyArtifact(bundle, artifactPath, createMetadata = false) {
  const spec = bundles[bundle];
  if (!spec) fail(`Unexpected release bundle: ${bundle}`);
  const version = readDesktopVersion();
  const artifact = resolve(artifactPath);
  const expectedName = `Vibyra-Desktop-${version}-${spec.suffix}`;
  if (basename(artifact) !== expectedName) fail(`Expected ${expectedName}, got ${basename(artifact)}`);
  const sizeBytes = statSync(artifact).size;
  if (sizeBytes < 1) fail(`${expectedName} is empty`);

  const { sha256: digest, blake2b } = await hashes(artifact);
  const checksum = readFileSync(`${artifact}.sha256`, "utf8").trim();
  const checksumMatch = checksum.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
  if (!checksumMatch || checksumMatch[1] !== digest) fail(`${expectedName} checksum is invalid`);
  if (basename(checksumMatch[2]) !== expectedName) fail(`${expectedName} checksum names another file`);

  const signature = readFileSync(`${artifact}.sig`, "utf8").trim();
  verifySignature(signature, blake2b, `${expectedName} signature`);
  const metadata = {
    schemaVersion: 1,
    bundle,
    target: spec.target,
    arch: spec.arch,
    bundleType: spec.type,
    version,
    filename: expectedName,
    sizeBytes,
    sha256: digest,
    signature,
    updateFeedUrl: feedUrl(spec, version),
  };
  const metadataPath = `${artifact}.metadata.json`;
  if (createMetadata) writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const stored = json(metadataPath);
  if (JSON.stringify(stored) !== JSON.stringify(metadata)) fail(`${expectedName} metadata is stale`);
  return metadata;
}

function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

async function verifyReleaseSet(root) {
  const metadataFiles = filesUnder(resolve(root)).filter((path) => path.endsWith(".metadata.json"));
  if (metadataFiles.length !== Object.keys(bundles).length) {
    fail(`Expected ${Object.keys(bundles).length} release metadata files, got ${metadataFiles.length}`);
  }
  const seen = new Set();
  for (const path of metadataFiles) {
    const bundle = json(path).bundle;
    if (!bundles[bundle] || seen.has(bundle)) fail(`Duplicate or unexpected bundle metadata: ${bundle}`);
    await verifyArtifact(bundle, path.slice(0, -".metadata.json".length));
    seen.add(bundle);
  }
  for (const bundle of Object.keys(bundles)) if (!seen.has(bundle)) fail(`Missing ${bundle} release`);
  return [...seen].sort();
}

function validateFeedPayload(payload, label) {
  if (!VERSION_PATTERN.test(payload.version ?? "")) fail(`${label} returned an invalid version`);
  if (typeof payload.url !== "string" || new URL(payload.url).protocol !== "https:") {
    fail(`${label} returned a non-HTTPS artifact URL`);
  }
  updaterSignature(payload.signature ?? "", `${label} signature`);
  if (Number.isNaN(Date.parse(payload.pub_date ?? ""))) fail(`${label} returned an invalid pub_date`);
}

export async function smokeUpdateFeeds(fetcher = fetch) {
  const version = readDesktopVersion();
  const statuses = [];
  const request = (spec, current) => fetcher(feedUrl(spec, current), {
    headers: { Accept: "application/json", "User-Agent": "Vibyra-release-verifier" },
    signal: AbortSignal.timeout(15_000),
  });
  for (const [bundle, spec] of Object.entries(bundles)) {
    const old = await request(spec, "0.0.0");
    if (old.status !== 200) fail(`${bundle} feed did not offer an update to an old client`);
    validateFeedPayload(await old.json(), bundle);
    const candidate = await request(spec, version);
    if (candidate.status !== 204) fail(`${bundle} feed says ${version} is stale`);
    const future = await request(spec, "999999.0.0");
    if (future.status !== 204) fail(`${bundle} feed offered an update to a newer client`);
    statuses.push(`${bundle}:200/204/204`);
  }
  return statuses;
}

async function main([command, ...args]) {
  if (command === "version") console.log(readDesktopVersion());
  else if (command === "artifact") console.log(JSON.stringify(await verifyArtifact(args[0], args[1], true)));
  else if (command === "set") console.log(`Verified release bundles: ${(await verifyReleaseSet(args[0])).join(", ")}`);
  else if (command === "feed") console.log(`Verified updater feeds: ${(await smokeUpdateFeeds()).join(", ")}`);
  else fail("Usage: verify-release.mjs <version|artifact|set|feed> [arguments]");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
