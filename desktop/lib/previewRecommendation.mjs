import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WEB_APP_DIRECTORIES } from "./projectAppRoots.mjs";

const SIGNAL_FILES = [
  "package.json",
  "app.json",
  "manifest.json",
  "public/manifest.json",
  "src-tauri/tauri.conf.json"
];

export async function recommendPreviewViewport(project) {
  const signals = await previewSignals(project?.path);
  const brief = project?.detectedBrief ?? {};
  const category = previewCategory(brief.kindId, signals);
  const preset = presetForCategory(category);
  const orientation = orientationForCategory(category, signals);
  const framework = signalFramework(signals) || String(brief.frameworkLabel || "").trim();
  return {
    preset,
    orientation,
    category,
    label: recommendationLabel(category, framework),
    reason: framework ? `Detected ${framework}` : `Detected ${category.replace("-", " ")} project`
  };
}

export function previewCategory(kindId, signals = "") {
  const text = String(signals).toLowerCase();
  if (hasAny(text, ["\"expo\"", "\"react-native\"", "@capacitor/", "@ionic/", "flutter"])) return "mobile-app";
  if (hasAny(text, ["@tauri-apps/", "\"electron\"", "electron-builder", "src-tauri"])) return "desktop-app";
  if (hasAny(text, ["\"phaser\"", "\"three\"", "pixi.js", "@babylonjs/", "project.godot", "projectsettings"])) return "game";
  if (["mobile-app", "desktop-app", "game", "website", "saas", "api"].includes(kindId)) return kindId;
  return "website";
}

function signalFramework(signals) {
  const text = String(signals).toLowerCase();
  if (hasAny(text, ["\"expo\"", "\"react-native\""])) return "Expo React Native";
  if (text.includes("@tauri-apps/")) return "Tauri";
  if (hasAny(text, ["\"electron\"", "electron-builder"])) return "Electron";
  if (text.includes("\"phaser\"")) return "Phaser";
  if (text.includes("\"three\"")) return "Three.js";
  return "";
}

function presetForCategory(category) {
  if (category === "mobile-app") return "iphone-15";
  if (category === "game") return "full-hd";
  if (category === "website") return "laptop";
  return "desktop";
}

function orientationForCategory(category, signals) {
  const explicit = String(signals).match(/["']?orientation["']?\s*:\s*["'](landscape|portrait)(?:-[^"']+)?["']/i)?.[1];
  if (explicit) return explicit.toLowerCase();
  return category === "mobile-app" ? "portrait" : "landscape";
}

function recommendationLabel(category, framework) {
  const target = {
    "mobile-app": "Phone",
    "desktop-app": "Desktop",
    game: "Game",
    website: "Laptop",
    saas: "Desktop",
    api: "Desktop"
  }[category] || "Laptop";
  return framework ? `${target} · ${framework}` : target;
}

async function previewSignals(projectPath) {
  if (!projectPath) return "";
  const reads = [];
  for (const directory of WEB_APP_DIRECTORIES) {
    for (const file of SIGNAL_FILES) reads.push(readOptional(resolve(projectPath, directory, file)));
  }
  return (await Promise.all(reads)).filter(Boolean).join("\n").slice(0, 120000);
}

async function readOptional(path) {
  try {
    return (await readFile(path, "utf8")).slice(0, 12000);
  } catch {
    return "";
  }
}

function hasAny(text, values) {
  return values.some((value) => text.includes(value));
}
