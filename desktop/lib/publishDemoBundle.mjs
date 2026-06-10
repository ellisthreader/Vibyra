import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { contentTypeFor, previewEntryPath, previewMountDirectory } from "./previewStatic.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { referencesFromFile } from "./publishDemoBundleRefs.mjs";
import { laravelViteStaticShellEntry } from "./publishDemoBundleLaravel.mjs";
import { WEB_APP_DIRECTORIES } from "./projectAppRoots.mjs";

const DEFAULT_LIMITS = { maxFiles: 180, maxTotalBytes: 8_000_000, maxFileBytes: 2_000_000 };
const BUILD_PACKAGE_DIRECTORIES = WEB_APP_DIRECTORIES;
const STATIC_DIRS = ["assets", "static", "images", "img", "media", "fonts", "models", "audio", "video", "sounds", "textures", "icons"];
const UNSAFE_DIRS = new Set([".git", ".hg", ".svn", ".expo", ".vibyra-agent", "node_modules", "vendor", "private", "secrets", "credentials", ".ssh", ".cache", ".parcel-cache"]);
const UNSAFE_NAMES = [/^\.env(?:\.|$)/i, /(?:^|[-_.])(secret|token|credential|password|private[-_.]?key|api[-_.]?key)(?:[-_.]|$)/i, /^id_rsa/i];
const UNSAFE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12", ".pfx", ".crt", ".cer"]);
const RUNTIME_EXTENSIONS = new Set([
  ".avif", ".bmp", ".css", ".gif", ".glb", ".gltf", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json",
  ".m4v", ".mjs", ".mov", ".mp3", ".mp4", ".ogg", ".otf", ".png", ".svg", ".ttf", ".txt", ".wasm",
  ".webm", ".webmanifest", ".webp", ".woff", ".woff2"
]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".cjs", ".svg", ".txt", ".webmanifest", ".gltf"]);

export async function buildProjectPublishDemoBundle(projectId, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  let project;
  try {
    project = await requireProject(projectId, options.projectPath);
  } catch (error) {
    const code = projectId ? "project_not_found" : "no_project_selected";
    const reason = projectId
      ? `The selected project (${projectId}) could not be found. Reopen the app folder from Browse PC and publish again.`
      : "No project was selected. Open the app folder from Browse PC and publish again.";
    return failure(code, reason, { limits, projectId: projectId ?? "", warnings: [], skipped: [], error: error.message });
  }
  const metadata = { limits, projectId: project.id, projectPath: project.path, skipped: [], warnings: [] };
  let entry = await publishDemoEntry(project);
  if (!entry && options.autoBuild !== false) {
    await buildStaticOutput(project, metadata, options);
    entry = await publishDemoEntry(project);
  }
  if (!entry) return missingEntryFailure(metadata, options);

  const state = {
    project,
    limits,
    files: [],
    seen: new Set(),
    queue: [],
    totalBytes: 0,
    failed: null,
    metadata,
    webRootDirectory: entry.webRootDirectory ?? ""
  };
  const { entryPath, mountDirectory } = entry;
  Object.assign(metadata, entry.metadata ?? {}, { entryPath, mountDirectory });

  if (entry.virtualEntryHtml) {
    await addVirtualTextFile(state, entryPath, entry.virtualEntryHtml, { mountDirectory });
  } else {
    await addBundleFile(state, entryPath, { required: true, mountDirectory });
  }
  for (const path of entry.requiredPaths ?? []) {
    if (!state.seen.has(path)) state.queue.push({ path, from: entryPath });
  }
  while (state.queue.length && !state.failed) {
    const item = state.queue.shift();
    await addBundleFile(state, item.path, { required: true, mountDirectory, from: item.from });
  }
  if (!state.failed) await addOptionalStaticAssets(state, mountDirectory);
  if (state.failed) return failure(state.failed.code, state.failed.reason, metadata);

  metadata.totalFiles = state.files.length;
  metadata.totalBytes = state.totalBytes;
  metadata.truncated = metadata.skipped.some((item) => item.reason === "bundle_limit_reached");
  return { ok: true, kind: "static-demo-bundle", projectId: project.id, entryPath, mountDirectory, files: state.files, metadata };
}

async function publishDemoEntry(project) {
  const entryPath = await previewEntryPath(project);
  if (entryPath) return { entryPath, mountDirectory: previewMountDirectory(entryPath) };
  return await laravelViteStaticShellEntry(project);
}

async function buildStaticOutput(project, metadata, options) {
  const buildPackage = await findBuildPackage(project.path);
  if (!buildPackage.packageFound) {
    setCaptureFailure(metadata, "missing_build_script", "No package.json with a build script was found in the project or a supported frontend folder.");
    return false;
  }
  if (!buildPackage.pkg) {
    const code = buildPackage.invalidPackageFound ? "invalid_package_json" : "no_build_script";
    const message = buildPackage.invalidPackageFound
      ? "A package.json was found but could not be parsed."
      : "package.json does not define a build script for the browser frontend.";
    setCaptureFailure(metadata, code === "no_build_script" ? "missing_build_script" : code, message);
    return false;
  }

  const { directory, pkg } = buildPackage;
  const buildPath = resolve(project.path, directory);
  metadata.buildDirectory = directory || ".";

  const installResult = await installDependenciesIfNeeded(buildPath, pkg, metadata, options);
  if (installResult.attempted && !installResult.ok) {
    setCaptureFailure(
      metadata,
      installFailureCode(installResult),
      commandFailureReason("Frontend dependency installation", installResult)
    );
    return false;
  }

  const command = buildCommand(buildPath);
  metadata.autoBuild = { command: command.join(" "), cwd: metadata.buildDirectory, startedAt: new Date().toISOString() };
  const result = await runProjectCommand(buildPath, command, options.buildTimeoutMs ?? 120000);
  metadata.autoBuild = { ...metadata.autoBuild, ...result, finishedAt: new Date().toISOString() };
  if (!result.ok) {
    metadata.warnings.push({ code: "build_failed", message: result.output || "Build command failed before public demo capture." });
    setCaptureFailure(metadata, buildFailureCode(result), commandFailureReason("Frontend build", result));
  }
  return result.ok;
}

async function findBuildPackage(projectPath) {
  let packageFound = false;
  let invalidPackageFound = false;
  const candidates = [];
  for (const directory of BUILD_PACKAGE_DIRECTORIES) {
    const packagePath = directory ? `${directory}/package.json` : "package.json";
    const packageText = await readOptionalProjectText(projectPath, packagePath);
    if (!packageText) continue;
    packageFound = true;
    let pkg;
    try {
      pkg = JSON.parse(packageText);
    } catch {
      invalidPackageFound = true;
      continue;
    }
    if (pkg?.scripts?.build) candidates.push({ directory, pkg });
  }
  if (candidates.length) {
    const composer = await readOptionalProjectText(projectPath, "composer.json");
    const rootIsLaravel = /laravel\/framework/i.test(composer);
    const selected = rootIsLaravel
      ? candidates.find((candidate) => candidate.directory) ?? candidates[0]
      : candidates[0];
    return { ...selected, packageFound, invalidPackageFound };
  }
  return { directory: "", pkg: null, packageFound, invalidPackageFound };
}

function setCaptureFailure(metadata, code, reason) {
  metadata.captureFailure = { code, reason };
  metadata.warnings.push({ code, message: reason });
}

function missingEntryFailure(metadata, options) {
  if (metadata.captureFailure) {
    return failure(metadata.captureFailure.code, metadata.captureFailure.reason, metadata);
  }
  if (metadata.autoBuild?.ok) {
    return failure(
      "build_output_missing",
      `The frontend build completed in ${metadata.buildDirectory || "."}, but it did not create a supported static index.html output.`,
      metadata
    );
  }
  if (options.autoBuild === false) {
    return failure(
      "static_preview_not_built",
      "This frontend has source files but no built browser preview. Run its build script or enable automatic building, then publish again.",
      metadata
    );
  }
  return failure(
    "no_static_preview_entry",
    "No publishable browser entry was found. Open the frontend app folder or add a supported build script.",
    metadata
  );
}

function installFailureCode(result) {
  if (result.code === "install_timeout") return "dependency_install_timeout";
  if (result.code === "install_error") return "dependency_install_error";
  return "dependency_install_failed";
}

function buildFailureCode(result) {
  if (result.code === "build_timeout") return "frontend_build_timeout";
  if (result.code === "build_error") return "frontend_build_error";
  return "frontend_build_failed";
}

function commandFailureReason(label, result) {
  const detail = result.output ? ` ${result.output}` : "";
  if (result.code?.endsWith("_timeout")) return `${label} timed out.${detail}`;
  if (result.code?.endsWith("_error")) return `${label} could not be started.${detail}`;
  return `${label} failed.${detail}`;
}

async function installDependenciesIfNeeded(projectPath, pkg, metadata, options) {
  if (options.autoInstall === false) {
    metadata.autoInstall = { skipped: true, reason: "disabled" };
    return { attempted: false, ok: true };
  }
  if (!hasPackageDependencies(pkg)) {
    metadata.autoInstall = { skipped: true, reason: "no_dependencies" };
    return { attempted: false, ok: true };
  }
  if (dependenciesLookInstalled(projectPath)) {
    metadata.autoInstall = { skipped: true, reason: "dependencies_present" };
    return { attempted: false, ok: true };
  }

  const command = installCommand(projectPath);
  metadata.autoInstall = { command: command.join(" "), ignoreScripts: true, startedAt: new Date().toISOString() };
  const result = normalizeCommandResult(
    await runProjectCommand(projectPath, command, options.installTimeoutMs ?? 180000),
    "install"
  );
  metadata.autoInstall = { ...metadata.autoInstall, ...result, finishedAt: new Date().toISOString() };
  if (!result.ok) {
    metadata.warnings.push({ code: result.code || "install_failed", message: result.output || "Dependency install failed before public demo capture." });
  }
  return { attempted: true, ok: result.ok };
}

function normalizeCommandResult(result, action) {
  if (result.code === "build_ok") return { ...result, code: `${action}_ok` };
  if (result.code === "build_failed") return { ...result, code: `${action}_failed` };
  if (result.code === "build_timeout") return { ...result, code: `${action}_timeout` };
  if (result.code === "build_error") return { ...result, code: `${action}_error` };
  return result;
}

function hasPackageDependencies(pkg) {
  return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    .some((key) => Object.keys(pkg?.[key] ?? {}).length > 0);
}

function dependenciesLookInstalled(projectPath) {
  return hasProjectFile(projectPath, "node_modules") || hasProjectFile(projectPath, ".pnp.cjs");
}

function installCommand(projectPath) {
  const runner = packageRunner(projectPath);
  const lockfile = lockfileFor(projectPath);
  if (runner.startsWith("npm")) {
    return hasProjectFile(projectPath, "package-lock.json")
      ? [runner, "ci", "--ignore-scripts"]
      : [runner, "install", "--ignore-scripts"];
  }
  if (runner.startsWith("pnpm")) return [runner, "install", "--ignore-scripts", lockfile ? "--frozen-lockfile" : "--no-frozen-lockfile"];
  if (runner.startsWith("yarn")) return [runner, "install", "--ignore-scripts", ...(lockfile ? ["--frozen-lockfile"] : [])];
  if (runner.startsWith("bun")) return [runner, "install", "--ignore-scripts", ...(lockfile ? ["--frozen-lockfile"] : [])];
  return [runner, "install", "--ignore-scripts"];
}

function buildCommand(projectPath) {
  if (process.platform === "win32") return ["cmd.exe", "/d", "/s", "/c", `${packageRunner(projectPath)} run build`];
  return [packageRunner(projectPath), "run", "build"];
}

function packageRunner(projectPath) {
  if (hasProjectFile(projectPath, "pnpm-lock.yaml")) return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (hasProjectFile(projectPath, "yarn.lock")) return process.platform === "win32" ? "yarn.cmd" : "yarn";
  if (hasProjectFile(projectPath, "bun.lockb") || hasProjectFile(projectPath, "bun.lock")) return process.platform === "win32" ? "bun.cmd" : "bun";
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function lockfileFor(projectPath) {
  return ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"].find((file) => hasProjectFile(projectPath, file)) ?? "";
}

function hasProjectFile(projectPath, relativePath) {
  return existsSync(resolve(projectPath, relativePath));
}

function runProjectCommand(cwd, command, timeoutMs) {
  return new Promise((resolveResult) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: {
        ...process.env,
        BROWSER: "none",
        BUN_CONFIG_INSTALL_IGNORE_SCRIPTS: "1",
        CI: "1",
        FORCE_COLOR: "0",
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_ignore_scripts: "true",
        YARN_ENABLE_SCRIPTS: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveResult({ ...result, output: output.trim().slice(-1200) });
    };
    const capture = (chunk) => {
      output = `${output}${String(chunk)}`.slice(-5000);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      settle({ ok: false, code: "build_timeout" });
    }, timeoutMs);
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("error", (error) => {
      capture(error.message);
      settle({ ok: false, code: "build_error" });
    });
    child.on("close", (code) => settle({ ok: code === 0, code: code === 0 ? "build_ok" : "build_failed" }));
  });
}

async function readOptionalProjectText(projectPath, relativePath) {
  try {
    return await readFile(resolve(projectPath, relativePath), "utf8");
  } catch {
    return "";
  }
}

async function requireProject(projectId, projectPath = null) {
  if (!projectId) throw new Error("No project selected");
  if (projectById(projectId, projectPath)) return projectById(projectId, projectPath);
  await discoverProjects();
  const project = projectById(projectId, projectPath);
  if (!project) throw new Error("Project not found");
  return project;
}

async function addBundleFile(state, path, { required, mountDirectory, from = "", sourcePath = "" }) {
  const safe = safeRelativePath(path);
  if (!safe || state.seen.has(safe)) return;
  const unsafeReason = unsafeBundlePathReason(safe);
  if (unsafeReason) return skipOrFail(state, safe, unsafeReason, required, from);
  if (!RUNTIME_EXTENSIONS.has(extname(safe).toLowerCase())) return skipOrFail(state, safe, "unsupported_runtime_type", required, from);

  const safeSource = sourcePath ? safeRelativePath(sourcePath) : sourcePathForBundle(state, safe);
  const sourceUnsafeReason = unsafeBundlePathReason(safeSource);
  if (!safeSource || sourceUnsafeReason) return skipOrFail(state, safe, sourceUnsafeReason || "unsafe_source_path", required, from);
  const absolutePath = resolve(state.project.path, safeSource);
  if (!pathStaysInside(state.project.path, absolutePath)) return skipOrFail(state, safe, "outside_project", required, from);
  let info;
  try {
    info = await stat(absolutePath);
  } catch {
    return skipOrFail(state, safe, "missing_reference", required, from);
  }
  if (!info.isFile()) return skipOrFail(state, safe, "not_a_file", required, from);
  if (info.size > state.limits.maxFileBytes) {
    state.oversizedFile = { path: safe, size: info.size };
    return skipOrFail(state, safe, "file_too_large", required, from);
  }
  if (state.files.length + 1 > state.limits.maxFiles || state.totalBytes + info.size > state.limits.maxTotalBytes) {
    state.limitViolation = bundleLimitViolation(state, safe, info.size);
    return skipOrFail(state, safe, "bundle_limit_reached", required, from);
  }

  const buffer = await readFile(absolutePath);
  const encoding = isTextFile(safe) ? "utf8" : "base64";
  state.seen.add(safe);
  state.totalBytes += info.size;
  state.files.push({
    path: safe,
    contentType: contentTypeFor(safe),
    size: info.size,
    encoding,
    body: encoding === "utf8" ? buffer.toString("utf8") : buffer.toString("base64")
  });

  if (encoding === "utf8") {
    for (const ref of referencesFromFile(safe, buffer.toString("utf8"), mountDirectory)) {
      if (!state.seen.has(ref)) state.queue.push({ path: ref, from: safe });
    }
  }
}

async function addOptionalStaticAssets(state, mountDirectory) {
  for (const directory of STATIC_DIRS.map((name) => (mountDirectory ? `${mountDirectory}/${name}` : name))) {
    await scanOptionalDirectory(state, directory, mountDirectory, 0);
    if (state.failed) break;
  }
}

async function addVirtualTextFile(state, path, body, { mountDirectory }) {
  const safe = safeRelativePath(path);
  if (!safe || state.seen.has(safe)) return;
  const unsafeReason = unsafeBundlePathReason(safe);
  if (unsafeReason) return skipOrFail(state, safe, unsafeReason, true, "");
  const size = Buffer.byteLength(body, "utf8");
  if (size > state.limits.maxFileBytes) {
    state.oversizedFile = { path: safe, size };
    return skipOrFail(state, safe, "file_too_large", true, "");
  }
  if (state.files.length + 1 > state.limits.maxFiles || state.totalBytes + size > state.limits.maxTotalBytes) {
    state.limitViolation = bundleLimitViolation(state, safe, size);
    return skipOrFail(state, safe, "bundle_limit_reached", true, "");
  }
  state.seen.add(safe);
  state.totalBytes += size;
  state.files.push({ path: safe, contentType: contentTypeFor(safe), size, encoding: "utf8", body });
  for (const ref of referencesFromFile(safe, body, mountDirectory)) {
    if (!state.seen.has(ref)) state.queue.push({ path: ref, from: safe });
  }
}

async function scanOptionalDirectory(state, directory, mountDirectory, depth) {
  if (depth > 6 || state.failed) return;
  let entries;
  try {
    entries = await readdir(resolve(state.project.path, sourcePathForBundle(state, directory)), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!unsafeBundlePathReason(child)) await scanOptionalDirectory(state, child, mountDirectory, depth + 1);
    } else if (entry.isFile()) {
      await addBundleFile(state, child, { required: false, mountDirectory });
    }
    if (state.failed) return;
  }
}

function sourcePathForBundle(state, bundlePath) {
  return state.webRootDirectory ? safeRelativePath(`${state.webRootDirectory}/${bundlePath}`) : bundlePath;
}

function skipOrFail(state, path, reason, required, from) {
  state.metadata.skipped.push({ path, reason, ...(from ? { from } : {}) });
  if (reason === "bundle_limit_reached") {
    state.metadata.truncated = true;
    state.failed = {
      code: "bundle_limit_exceeded",
      reason: state.limitViolation?.reason ?? `Static demo bundle could not include ${path}: bundle limit reached.`
    };
    return;
  }
  if (required && ["missing_reference", "not_a_file"].includes(reason)) {
    state.failed = { code: "missing_static_reference", reason: `Static demo bundle is missing required local reference ${path}.` };
    return;
  }
  if (required && reason === "file_too_large") {
    state.failed = {
      code: "bundle_file_too_large",
      reason: `Static asset ${path} is ${formatBytes(state.oversizedFile?.size ?? 0)}, above the ${formatBytes(state.limits.maxFileBytes)} per-file hosting limit.`
    };
    return;
  }
  if (required && ["outside_project", "unsupported_runtime_type"].includes(reason)) {
    state.failed = { code: "bundle_validation_failed", reason: `Static demo bundle could not include ${path}: ${reason.replace(/_/g, " ")}.` };
  }
}

function bundleLimitViolation(state, path, nextSize) {
  if (state.files.length + 1 > state.limits.maxFiles) {
    return {
      reason: `Static demo bundle limit reached: at most ${state.limits.maxFiles} files can be hosted, and ${path} would exceed that limit. Reduce generated assets and publish again.`
    };
  }
  return {
    reason: `Static demo bundle limit reached: ${path} would exceed the ${formatBytes(state.limits.maxTotalBytes)} total hosting limit. Reduce the frontend build size and publish again.`
  };
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(bytes % 1_000_000 ? 1 : 0)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(bytes % 1_000 ? 1 : 0)} KB`;
  return `${bytes} bytes`;
}

function failure(code, reason, metadata) {
  return { ok: false, code, reason, failureReasons: [reason], files: [], metadata };
}

function safeRelativePath(path) {
  const normalized = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.includes("\0")) return "";
  return normalized.split("/").filter(Boolean).join("/");
}
function unsafeBundlePathReason(path) {
  const segments = path.split("/");
  if (segments.some((segment) => UNSAFE_DIRS.has(segment))) return "unsafe_or_private_directory";
  if (!isGeneratedBuildAssetPath(path) && segments.some((segment) => UNSAFE_NAMES.some((pattern) => pattern.test(segment)))) return "env_or_credential_file";
  if (UNSAFE_EXTENSIONS.has(extname(basename(path)).toLowerCase())) return "credential_or_private_file";
  return "";
}

function isGeneratedBuildAssetPath(path) {
  return /^(?:public\/)?build\/assets\//i.test(path);
}

function pathStaysInside(root, filePath) {
  const relativePath = relative(resolve(root), resolve(filePath));
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}
