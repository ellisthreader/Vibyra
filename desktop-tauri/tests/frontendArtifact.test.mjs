import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { frontendManifest, verifyFrontend } from "../scripts/frontend-artifact.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "vibyra-frontend-artifact-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function put(path, value) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, typeof value === "string" ? value : JSON.stringify(value));
    return destination;
  }
  put("package.json", { version: "0.7.8" });
  put("package-lock.json", { packages: { "": { version: "0.7.8" } } });
  put("src-tauri/tauri.conf.json", { version: "0.7.8", build: { frontendDist: "../dist" } });
  put("dist/index.html", '<script src="/assets/app.js"></script>');
  put("dist/assets/app.js", 'document.body.textContent = "Vibyra";');
  put("dist/assets/app.css", "body { color: white; }");
  put("dist/assets/inter.woff2", "bundled-font");
  return { root, put };
}

test("every native package verifies the archive's complete frontend bytes", (t) => {
  const { root, put } = fixture(t);
  const manifest = frontendManifest(root, "candidate-revision");
  const path = put("release/frontend-manifest.json", manifest);
  assert.deepEqual(verifyFrontend(root, path, "candidate-revision"), manifest);
  put("dist/assets/app.css", "body { color: black; }");
  assert.throws(() => verifyFrontend(root, path, "candidate-revision"), /differs from the reviewed archive/);
});

test("extra stale chunks and a different source revision fail archive verification", (t) => {
  const { root, put } = fixture(t);
  const path = put("release/frontend-manifest.json", frontendManifest(root, "candidate-revision"));
  assert.throws(() => verifyFrontend(root, path, "other-revision"), /differs from the reviewed archive/);
  put("dist/assets/stale.js", "old source");
  assert.throws(() => verifyFrontend(root, path, "candidate-revision"), /differs from the reviewed archive/);
});

test("Linux cannot silently switch frontend entry or native app version", (t) => {
  const { root, put } = fixture(t);
  put("src-tauri/tauri.linux.conf.json", { build: { frontendDist: "../linux-dist" } });
  assert.throws(() => frontendManifest(root), /linux must use the shared frontend/);
  put("src-tauri/tauri.linux.conf.json", { version: "0.7.7" });
  assert.throws(() => frontendManifest(root), /linux overrides the app version/);
  put("src-tauri/tauri.linux.conf.json", { bundle: { targets: ["appimage"] } });
  assert.doesNotThrow(() => frontendManifest(root));
  put("package.json", { version: "0.7.7" });
  assert.throws(() => frontendManifest(root), /Frontend and native versions differ/);
});
