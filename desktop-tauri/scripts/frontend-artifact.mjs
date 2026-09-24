// Release jobs embed one frontend archive. Its digest is independent of OS,
// native packaging, signatures and CPU architecture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function filesIn(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.ok(!entry.isSymbolicLink(), `Frontend artifacts must not contain symlinks: ${entry.name}`);
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? filesIn(join(directory, entry.name), `${path}/`) : [path];
  }).sort();
}

export function frontendManifest(root, revision = process.env.GITHUB_SHA || "local") {
  const config = readJson(join(root, "src-tauri/tauri.conf.json"));
  const pkg = readJson(join(root, "package.json"));
  const lock = readJson(join(root, "package-lock.json"));
  assert.equal(pkg.version, config.version, "Frontend and native versions differ.");
  assert.equal(lock.packages[""].version, config.version, "The dependency lock version differs.");
  assert.equal(config.build.frontendDist, "../dist", "Every desktop platform must embed the shared dist.");
  for (const platform of ["macos", "linux", "windows"]) {
    const path = join(root, `src-tauri/tauri.${platform}.conf.json`);
    if (!existsSync(path)) continue;
    const override = readJson(path);
    assert.ok(!override.version || override.version === config.version, `${platform} overrides the app version.`);
    const buildKeys = Object.keys(override.build ?? {});
    const expectedKeys = platform === "macos" ? ["beforeBundleCommand"] : [];
    assert.deepEqual(buildKeys, expectedKeys,
      `${platform} must use the shared frontend build configuration.`);
    if (platform === "macos") {
      assert.equal(override.build.beforeBundleCommand,
        "python3 scripts/build-agent-command-helper.py",
        "macos must build the reviewed Agent command helper.");
    }
  }
  const dist = join(root, "dist");
  const files = filesIn(dist).map((path) => ({ path, sha256: sha256(readFileSync(join(dist, path))) }));
  assert.ok(files.some(({ path }) => path === "index.html"), "The frontend has no index.html.");
  assert.ok(files.some(({ path }) => path.endsWith(".js")), "The frontend has no JavaScript.");
  return {
    format: 1, version: config.version, revision,
    lockSha256: sha256(readFileSync(join(root, "package-lock.json"))),
    frontendSha256: sha256(JSON.stringify(files)), files,
  };
}

export function verifyFrontend(root, manifestPath, revision) {
  const expected = readJson(manifestPath);
  const actual = frontendManifest(root, revision);
  assert.deepEqual(actual, expected, "Frontend artifact differs from the reviewed archive/version/revision. Rebuild the shared frontend job.");
  return actual;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const path = join(root, "release/frontend-manifest.json");
  const command = process.argv[2];
  let manifest;
  if (command === "create") {
    manifest = frontendManifest(root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  } else if (command === "verify") {
    manifest = verifyFrontend(root, path);
  } else {
    throw new Error("Usage: node scripts/frontend-artifact.mjs create|verify");
  }
  console.log(`Shared frontend ${manifest.version}: ${manifest.frontendSha256} (${manifest.files.length} assets)`);
}
