import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { discoverProjectAppDirectories } from "./projectAppDiscovery.mjs";
import { expoPreviewProfile } from "./previewExpo.mjs";
import { previewFrameworkProfile } from "./previewFrameworkProfiles.mjs";
import { runtimePreviewContexts } from "./previewRuntimeAdapters.mjs";

export async function detectPreviewTargets(project) {
  const projectPath = String(project?.path || "").trim();
  if (!projectPath) return [];
  const directories = await discoverProjectAppDirectories(projectPath, ["package.json"]);
  const targets = [];
  for (const directory of directories) {
    const target = await packagePreviewTarget(projectPath, directory);
    if (target) targets.push(target);
  }
  const packageDirectories = new Set(targets.map((target) => target.appDirectory));
  for (const context of await runtimePreviewContexts(projectPath)) {
    if (packageDirectories.has(context.appDirectory)) continue;
    targets.push(runtimeTarget(projectPath, context));
  }
  return targets.sort(compareTargets);
}

export async function resolvePreviewTarget(project, targetId) {
  const targets = await detectPreviewTargets(project);
  return targets.find((target) => target.id === String(targetId || "")) || null;
}

async function packagePreviewTarget(projectPath, appDirectory) {
  const packagePath = resolve(projectPath, appDirectory, "package.json");
  let packageText;
  try {
    packageText = await readFile(packagePath, "utf8");
  } catch {
    return null;
  }
  let pkg;
  try {
    pkg = JSON.parse(packageText);
  } catch {
    return null;
  }
  const profile = expoPreviewProfile(packageText) || previewFrameworkProfile(packageText);
  const identity = packageIdentity(pkg, appDirectory, projectPath);
  if (profile) {
    return {
      id: targetId(appDirectory, profile.id),
      appDirectory,
      name: identity.name,
      kind: identity.kind,
      framework: profile.label,
      profileId: profile.id,
      command: profile.command,
      available: true,
      reason: ""
    };
  }
  const unsupported = unsupportedPackageTarget(pkg, appDirectory, identity);
  return unsupported ? { ...unsupported, id: targetId(appDirectory, unsupported.profileId) } : null;
}

function packageIdentity(pkg, appDirectory, projectPath) {
  const dependencies = packageDependencies(pkg);
  const desktop = hasAny(dependencies, ["electron", "electron-builder", "@tauri-apps/api", "@tauri-apps/cli"]);
  const mobile = hasAny(dependencies, ["react-native", "@capacitor/core", "@ionic/react", "@ionic/vue", "@ionic/angular"]);
  return {
    name: String(pkg?.displayName || pkg?.name || basename(resolve(projectPath, appDirectory)) || "Project app"),
    kind: desktop ? "desktop" : mobile ? "mobile" : "web"
  };
}

function unsupportedPackageTarget(pkg, appDirectory, identity) {
  const dependencies = packageDependencies(pkg);
  if (hasAny(dependencies, ["electron", "electron-builder"])) {
    return unavailable(appDirectory, identity, "electron", "Electron", "This desktop app has no separately runnable browser renderer.");
  }
  if (hasAny(dependencies, ["@tauri-apps/api", "@tauri-apps/cli"])) {
    return unavailable(appDirectory, identity, "tauri", "Tauri", "Tauri runs outside the browser. Add or select its web renderer app to preview it here.");
  }
  if (hasAny(dependencies, ["react-native"])) {
    return unavailable(appDirectory, identity, "react-native", "React Native", "This mobile app has no approved Expo web command.");
  }
  return null;
}

function unavailable(appDirectory, identity, profileId, framework, reason) {
  return { appDirectory, name: identity.name, kind: identity.kind, framework, profileId, command: "", available: false, reason };
}

function runtimeTarget(projectPath, context) {
  const name = basename(context.appPath) || basename(projectPath) || context.profile.label;
  return {
    id: targetId(context.appDirectory, context.profile.id),
    appDirectory: context.appDirectory,
    name,
    kind: context.profile.id === "flutter-web" ? "mobile" : "web",
    framework: context.profile.label,
    profileId: context.profile.id,
    command: context.profile.command,
    available: true,
    reason: ""
  };
}

function packageDependencies(pkg) {
  return { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
}

function hasAny(dependencies, names) {
  return names.some((name) => Object.hasOwn(dependencies, name));
}

function targetId(appDirectory, profileId) {
  return Buffer.from(`${appDirectory}\n${profileId}`, "utf8").toString("base64url");
}

function compareTargets(left, right) {
  if (left.available !== right.available) return left.available ? -1 : 1;
  const leftDepth = left.appDirectory ? left.appDirectory.split("/").length : 0;
  const rightDepth = right.appDirectory ? right.appDirectory.split("/").length : 0;
  return leftDepth - rightDepth || left.name.localeCompare(right.name);
}
