import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const retired = /#(?:6D3BFF|7E3CFF|8B5CFF|9254FF|F23ACD|C026D3|07070A|12121A)\b/gi;
const legacyVioletOrPink = /#(?:6d3bff|8b5cff|7b2cff|7c3aed|8e3cff|a368ff|c259ff|8e34ff|ff35c8|b33fff|b442ff|c25dff|5d24d8|7c2dff|aa35ff|6c22e8|d7c4ff|8f39ff|dc75ff|b23fff|a855ff|c65bff|ff38c5|c77aff|b15bff|8c36ff|8b5cf6|a855f7|c084fc|d8b4fe|e9d5ff|f3e8ff|9333ea|6d28d9|5b21b6|4c1d95|ec4899|db2777|be185d|9d174d|2e1065|1e1b4b|312e81|8b35ff)\b|rgba?\(\s*(?:109\s*,\s*59\s*,\s*255|139\s*,\s*92\s*,\s*(?:255|246)|123\s*,\s*44\s*,\s*255|124\s*,\s*58\s*,\s*237|168\s*,\s*85\s*,\s*247|236\s*,\s*72\s*,\s*153)/i;
const productionExtensions = /\.(?:ts|tsx)$/;
const approvedExceptionFiles = new Set([
  "src/screens/workspace/data/community.ts",
  "src/screens/workspace/styles/themeLightColors.ts",
  "src/utils/syntaxHighlight.ts"
]);

async function source(path) { return readFile(new URL(path, root), "utf8"); }

async function productionFiles(directory = "src") {
  const entries = await readdir(new URL(`${directory}/`, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await productionFiles(relative));
    else if (productionExtensions.test(entry.name) && !approvedExceptionFiles.has(relative)) files.push(relative);
  }
  return files;
}

test("core mobile chrome contains no retired violet, magenta, or old canvas literals", async () => {
  const files = [
    "App.tsx",
    "app.json",
    "src/styles/theme.ts",
    "src/context/PreferencesContext.tsx",
    "src/components/LoadingScreen.tsx",
    "src/components/VibyraLogo.tsx"
  ];
  for (const file of files) {
    const contents = await source(file);
    assert.deepEqual(contents.match(retired) ?? [], [], file);
  }
});

test("all first-party mobile source contains no legacy violet or pink chrome", async () => {
  const violations = [];
  for (const file of ["App.tsx", ...await productionFiles()]) {
    if (legacyVioletOrPink.test(await source(file))) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("native appearance uses the cobalt mark with light and dark splash foundations", async () => {
  const config = JSON.parse(await source("app.json"));
  const splash = config.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-splash-screen")[1];
  assert.equal(config.expo.userInterfaceStyle, "automatic");
  assert.equal(splash.image, "./src/assets/vibyra-cobalt.png");
  assert.equal(splash.backgroundColor, "#F4F5F7");
  assert.deepEqual(splash.dark, { image: "./src/assets/vibyra-cobalt.png", backgroundColor: "#0E0F12" });
});

test("appearance changes repaint mounted auth and workspace trees", async () => {
  const app = await source("App.tsx");
  assert.doesNotMatch(app, /key=\{prefs\.effectiveScheme\}/);
  assert.match(app, /setStylesScheme\(prefs\.effectiveScheme\)/);
});
