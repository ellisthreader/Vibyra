import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { assertExtractedRuntime, clearAppDirs, currentAppImage } from "../scripts/linux-appimage.mjs";
import { desktopExec, installLinuxLauncher } from "../scripts/linux-launcher.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "vibyra-linux-packaging-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, path, bytes = "fixture") {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  return destination;
}

test("install cannot pick a stale version or another CPU's recently built image", (t) => {
  const root = fixture(t);
  const config = { productName: "Vibyra", version: "0.7.8" };
  put(root, "Vibyra_0.7.7_amd64.AppImage");
  put(root, "Vibyra_0.7.8_aarch64.AppImage");
  assert.throws(() => currentAppImage(root, config, "x64"), /Missing current x64 bundle/);
  const current = put(root, "Vibyra_0.7.8_amd64.AppImage");
  assert.equal(currentAppImage(root, config, "x64"), current);
  assert.throws(() => currentAppImage(root, config, "unsupported"), /Unsupported/);
});

test("clean bundle staging retains prior AppImages and non-AppDir data", (t) => {
  const root = fixture(t);
  put(root, "Vibyra.AppDir/old-runtime");
  put(root, "Vibyra_0.7.7_amd64.AppImage");
  put(root, "other/data");
  clearAppDirs(root);
  assert.equal(existsSync(join(root, "Vibyra.AppDir")), false);
  assert.equal(existsSync(join(root, "Vibyra_0.7.7_amd64.AppImage")), true);
  assert.equal(existsSync(join(root, "other/data")), true);
});

test("a thin AppImage cannot pass just because its host has WebKit installed", (t) => {
  const root = fixture(t);
  put(root, "usr/bin/Vibyra", Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  assert.throws(() => assertExtractedRuntime(root), /missing WebKitGTK/);
  const runtime = [
    "usr/lib/libwebkit2gtk-4.1.so.0", "usr/lib/libjavascriptcoregtk-4.1.so.0",
    "usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebProcess",
    "usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitNetworkProcess",
    "usr/lib/gstreamer-1.0/libgstcoreelements.so",
  ];
  for (const file of runtime) put(root, file);
  assert.doesNotThrow(() => assertExtractedRuntime(root));
  rmSync(join(root, runtime[3]));
  assert.throws(() => assertExtractedRuntime(root), /WebKit network process/);
  put(root, runtime[3]);
  put(root, "usr/bin/Vibyra", "not ELF");
  assert.throws(() => assertExtractedRuntime(root), /not a Linux ELF/);
});

test("Linux menu launches the installed path with the same application icon", (t) => {
  const root = fixture(t);
  put(root, "src-tauri/icons/128x128@2x.png", "cobalt-icon");
  const destination = join(root, "My Apps/Vibyra.AppImage");
  const dataHome = join(root, "data");
  const launcher = installLinuxLauncher({ root, destination, dataHome });
  const desktop = readFileSync(launcher, "utf8");
  assert.ok(desktop.includes(`Exec=${desktopExec(destination)}\n`));
  assert.ok(desktop.includes("Icon=vibyra\n"));
  assert.equal(readFileSync(join(dataHome, "icons/hicolor/256x256/apps/vibyra.png"), "utf8"), "cobalt-icon");
  assert.throws(() => desktopExec("/tmp/a\nExec=other"), /invalid control/);
  assert.equal(desktopExec('/tmp/100%/$cash".AppImage'), '"/tmp/100%%/\\\\$cash\\\\".AppImage"');
});
