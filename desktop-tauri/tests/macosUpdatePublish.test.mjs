import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { verifyUpdateSignature } from "../scripts/minisign-verify.mjs";
import {
  ARTIFACT_SUFFIX,
  MAC_TARGETS,
  assertPublishable,
  extensionOf,
  feedPath,
  remotePath,
  variablesFor,
} from "../scripts/macos-update-plan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const read = (path) => readFileSync(resolve(desktop, path));

const VERSION = "0.7.6";
const SHA = "a".repeat(64);

function entry(overrides = {}) {
  const filename = `Vibyra-Desktop-${VERSION}-macos-arm64${ARTIFACT_SUFFIX}`;
  return {
    version: VERSION,
    filename,
    path: remotePath(VERSION, "1f4ad82eb2d5", "arm64", filename),
    size: 94_000_000,
    sha256: SHA,
    signature: "dW50cnVzdGVk",
    notes: "",
    publishedAt: "2026-09-21T09:00:00Z",
    ...overrides,
  };
}

test("the shipped public key verifies a package signed with the real key", () => {
  // The same fixture `updater_signing.rs` uses. This asserts the publish
  // script's own verifier agrees with the Rust one the app runs — a script that
  // waved through a mis-signed archive would be worse than no check at all.
  verifyUpdateSignature(
    read("src-tauri/tests/fixtures/updater-fixture.bin"),
    readFileSync(resolve(desktop, "src-tauri/tests/fixtures/updater-fixture.bin.sig"), "utf8"),
    JSON.parse(readFileSync(resolve(desktop, "src-tauri/tauri.conf.json"), "utf8"))
      .plugins.updater.pubkey,
  );
});

test("a tampered package is refused before it is ever uploaded", () => {
  const pubkey = JSON.parse(readFileSync(resolve(desktop, "src-tauri/tauri.conf.json"), "utf8"))
    .plugins.updater.pubkey;
  const signature = readFileSync(
    resolve(desktop, "src-tauri/tests/fixtures/updater-fixture.bin.sig"), "utf8",
  );
  const tampered = Buffer.concat([read("src-tauri/tests/fixtures/updater-fixture.bin"), Buffer.from("!")]);

  assert.throws(() => verifyUpdateSignature(tampered, signature, pubkey), /does not match/);
});

test("an archive signed by a different key names the mismatch", () => {
  // Re-keying is the one mistake with no remote fix: every installed client
  // trusts the old key and would reject the release after downloading it whole.
  const other = Buffer.concat([Buffer.from("Ed"), Buffer.from("0".repeat(16), "hex"), Buffer.alloc(32, 7)]);
  const pubkey = Buffer.from(
    `untrusted comment: x\n${other.toString("base64")}\n`,
  ).toString("base64");

  assert.throws(
    () => verifyUpdateSignature(read("src-tauri/tests/fixtures/updater-fixture.bin"),
      readFileSync(resolve(desktop, "src-tauri/tests/fixtures/updater-fixture.bin.sig"), "utf8"),
      pubkey),
    /trust/,
  );
});

test("the extension rule matches the one PHP applies", () => {
  // pathinfo() takes only the final segment: `.app.tar.gz` is `gz`, which is
  // what `expected_extension` in the updater overlay must be set to.
  assert.equal(extensionOf("Vibyra-Desktop-0.7.6-macos-arm64.app.tar.gz"), "gz");
  assert.equal(extensionOf("releases/macos/0.7.6-abc/arm64/Vibyra.app.tar.gz"), "gz");
  assert.equal(extensionOf("Vibyra.dmg"), "dmg");
});

test("a .dmg can never be published as an update", () => {
  // The original bug in one assertion: the updater cannot install a disk image,
  // and the backend's extension check is the only thing that noticed — silently.
  assert.throws(() => assertPublishable(entry({ filename: "Vibyra.dmg", path: "releases/Vibyra.dmg" })),
    /\.app\.tar\.gz/);
});

test("metadata that would make the feed answer 204 forever is refused", () => {
  assert.throws(() => assertPublishable(entry({ version: "0.7.5.2" })), /SemVer/);
  assert.throws(() => assertPublishable(entry({ sha256: "abc" })), /64 hex/);
  assert.throws(() => assertPublishable(entry({ size: 0 })), /positive byte count/);
  assert.throws(() => assertPublishable(entry({ signature: "  " })), /signature is empty/);
  assert.doesNotThrow(() => assertPublishable(entry()));
});

test("releases are stored under their commit, not their version alone", () => {
  // A re-cut 0.7.6 must not overwrite bytes a notified client is mid-download.
  assert.notEqual(
    remotePath(VERSION, "aaaaaaaaaaaa", "arm64", "v.app.tar.gz"),
    remotePath(VERSION, "bbbbbbbbbbbb", "arm64", "v.app.tar.gz"),
  );
  assert.match(remotePath(VERSION, "abc", "x64", "v.app.tar.gz"), /^releases\/macos\/0\.7\.6-abc\/x64\//);
});

test("the variables written are the updater overlay, never the download", () => {
  // Writing _RELEASE_ here would replace the .dmg the website hands out with a
  // tarball no browser can open.
  const keys = Object.keys(variablesFor(MAC_TARGETS[0], entry()));
  assert.ok(keys.every((key) => key.includes("_UPDATE_")), keys.join(" "));
  assert.ok(keys.every((key) => !key.includes("_RELEASE_")));
  assert.deepEqual(keys.map((key) => key.replace("VIBYRA_MACOS_ARM64_UPDATE_", "")).sort(), [
    "FILENAME", "NOTES", "PATH", "PUBLISHED_AT", "SHA256", "SIGNATURE", "SIZE", "VERSION",
  ]);
});

test("both architectures are published, under the keys the config reads", () => {
  assert.deepEqual(MAC_TARGETS.map((target) => target.platform), ["macos-arm64", "macos-x64"]);

  const config = readFileSync(resolve(desktop, "../backend/config/releases.php"), "utf8");
  for (const target of MAC_TARGETS) {
    for (const key of Object.keys(variablesFor(target, entry()))) {
      assert.ok(config.includes(key), `${key} is not read by backend/config/releases.php`);
    }
  }
});

test("the feed is probed the way Tauri asks, not an invented URL", () => {
  // `{{target}}/{{arch}}/{{bundle_type}}/{{current_version}}` with Rust's arch
  // names — aarch64 and x86_64, not arm64 and x64.
  assert.equal(feedPath(MAC_TARGETS[0], "0.7.5"), "/web-api/updates/darwin/aarch64/app/0.7.5");
  assert.equal(feedPath(MAC_TARGETS[1], "0.7.5"), "/web-api/updates/darwin/x86_64/app/0.7.5");
});
