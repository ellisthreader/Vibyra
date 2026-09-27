// What publishing a Mac update consists of, as data. Pure, so the shape of a
// release can be tested without touching Railway or the network.
//
// Every rule here mirrors one in `ReleaseArtifact::ready()` on the backend. A
// value that fails there does not produce an error — the feed simply answers
// 204 forever and every Mac silently stays on the build it has. That silence is
// why these are assertions rather than comments.

export const MAC_TARGETS = [
  { arch: "arm64", platform: "macos-arm64", prefix: "VIBYRA_MACOS_ARM64" },
  { arch: "x64", platform: "macos-x64", prefix: "VIBYRA_MACOS_X64" },
];

/** The updater artifact, as distinct from the .dmg a browser downloads. */
export const ARTIFACT_SUFFIX = ".app.tar.gz";

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/i;

/**
 * Releases are stored under the commit they were built from, never under the
 * version alone: a re-cut 0.7.6 must not overwrite the bytes an already-notified
 * client is part-way through downloading.
 */
export function remotePath(version, revision, arch, filename) {
  return `releases/macos/${version}-${revision}/${arch}/${filename}`;
}

/**
 * The backend reads `pathinfo($path, PATHINFO_EXTENSION)`, so only the segment
 * after the final dot counts — `.app.tar.gz` is `gz`, and the config's
 * `expected_extension` for the updater overlay must agree.
 */
export function extensionOf(name) {
  const base = name.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

export function assertPublishable(entry) {
  const problems = [];
  if (!SEMVER.test(entry.version ?? "")) {
    problems.push(`version ${JSON.stringify(entry.version)} is not SemVer — the feed rejects it`);
  }
  if (!SHA256.test(entry.sha256 ?? "")) {
    problems.push("sha256 must be 64 hex characters");
  }
  if (!(entry.size > 0)) {
    problems.push("size must be a positive byte count");
  }
  if (!(entry.signature ?? "").trim()) {
    // The app verifies before it installs, so an unsigned release is one every
    // client downloads in full and then refuses.
    problems.push("signature is empty — the .sig file was not produced");
  }
  if (!entry.filename?.endsWith(ARTIFACT_SUFFIX)) {
    problems.push(`filename must end in ${ARTIFACT_SUFFIX}, not a .dmg`);
  }
  if (extensionOf(entry.filename ?? "") !== "gz" || extensionOf(entry.path ?? "") !== "gz") {
    problems.push("path and filename must both end in .gz to match expected_extension");
  }
  if (problems.length > 0) {
    throw new Error(`${entry.arch ?? "artifact"}: ${problems.join("; ")}`);
  }
}

/**
 * The Railway variables for one architecture. `_UPDATE_` rather than
 * `_RELEASE_`: these feed the updater overlay and must not disturb the .dmg
 * metadata the public download page serves.
 */
export function variablesFor(target, entry) {
  assertPublishable({ ...entry, arch: target.arch });
  return {
    [`${target.prefix}_UPDATE_VERSION`]: entry.version,
    [`${target.prefix}_UPDATE_PATH`]: entry.path,
    [`${target.prefix}_UPDATE_FILENAME`]: entry.filename,
    [`${target.prefix}_UPDATE_SIZE`]: String(entry.size),
    [`${target.prefix}_UPDATE_SHA256`]: entry.sha256,
    [`${target.prefix}_UPDATE_SIGNATURE`]: entry.signature.trim(),
    [`${target.prefix}_UPDATE_NOTES`]: entry.notes ?? "",
    [`${target.prefix}_UPDATE_PUBLISHED_AT`]: entry.publishedAt,
  };
}

/** `{{target}}/{{arch}}/{{bundle_type}}/{{current_version}}` as Tauri sends it,
 * so the script can ask the live feed the same question the app asks. */
export function feedPath(target, currentVersion) {
  const arch = target.arch === "arm64" ? "aarch64" : "x86_64";
  return `/web-api/updates/darwin/${arch}/app/${currentVersion}`;
}
