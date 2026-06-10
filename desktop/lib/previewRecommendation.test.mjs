import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { previewCategory, recommendPreviewViewport } from "./previewRecommendation.mjs";

test("preview recommendations choose a portrait phone for mobile projects", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-preview-mobile-"));
  try {
    await writeFile(join(path, "package.json"), JSON.stringify({ dependencies: { expo: "latest" } }));
    await writeFile(join(path, "app.json"), JSON.stringify({ expo: { orientation: "portrait" } }));
    const result = await recommendPreviewViewport({
      path,
      detectedBrief: { kindId: "website", frameworkLabel: "Expo React Native" }
    });
    assert.equal(result.preset, "iphone-15");
    assert.equal(result.orientation, "portrait");
    assert.match(result.label, /Phone.*Expo React Native/);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test("preview recommendations respect explicit mobile landscape orientation", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-preview-landscape-"));
  try {
    await writeFile(join(path, "app.json"), JSON.stringify({ expo: { orientation: "landscape" } }));
    const result = await recommendPreviewViewport({
      path,
      detectedBrief: { kindId: "mobile-app", frameworkLabel: "Expo React Native" }
    });
    assert.equal(result.preset, "iphone-15");
    assert.equal(result.orientation, "landscape");
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test("preview recommendations prefer desktop and game signals over generic web metadata", () => {
  assert.equal(previewCategory("website", '{"devDependencies":{"@tauri-apps/api":"latest"}}'), "desktop-app");
  assert.equal(previewCategory("website", '{"dependencies":{"phaser":"latest"}}'), "game");
  assert.equal(previewCategory("saas", "{}"), "saas");
});

test("root projects containing both Expo and Electron still preview as the mobile app", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-preview-mixed-"));
  try {
    await writeFile(join(path, "package.json"), JSON.stringify({
      dependencies: { expo: "latest", "react-native": "latest" },
      devDependencies: { electron: "latest" }
    }));
    const result = await recommendPreviewViewport({
      path,
      detectedBrief: { kindId: "api", frameworkLabel: "Laravel" }
    });
    assert.equal(result.preset, "iphone-15");
    assert.equal(result.label, "Phone · Expo React Native");
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test("browser games default to a 16:9 Full HD viewport", async () => {
  const result = await recommendPreviewViewport({
    path: "",
    detectedBrief: { kindId: "game", frameworkLabel: "Phaser" }
  });
  assert.equal(result.preset, "full-hd");
  assert.equal(result.orientation, "landscape");
});
