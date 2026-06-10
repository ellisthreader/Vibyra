import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { discoverProjects, projectById } from "./projects.mjs";
import {
  existingProjectAppRoots,
  firstExistingProjectMarker,
  RUNTIME_APP_DIRECTORIES,
  UNSUPPORTED_RUNTIME_MARKERS
} from "./projectAppRoots.mjs";

const DEFAULT_LIMITS = { maxFiles: 320, maxTotalBytes: 7_500_000, maxFileBytes: 800_000, maxBuildAssetBytes: 2_800_000 };
const SKIP_DIRS = new Set([
  ".claude", ".expo", ".git", ".github", ".hg", ".next", ".obsidian", ".output", ".parcel-cache",
  ".svn", ".turbo", ".vibyra-agent", ".pytest_cache", ".venv", "__pycache__", "coverage", "dist",
  "build", "credentials", "docs", "node_modules", "private", "secrets", ".ssh", "test", "tests",
  "vault", "vendor", "venv"
]);
const UNSAFE_NAMES = [/^\.env(?:\.|$)/i, /(?:^|[-_.])(secret|token|credential|password|private[-_.]?key|api[-_.]?key)(?:[-_.]|$)/i, /^id_rsa/i];
const UNSAFE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12", ".pfx", ".crt", ".cer"]);
const RUNTIME_EXTENSIONS = new Set([
  ".avif", ".bmp", ".cjs", ".css", ".csv", ".gif", ".glb", ".gltf", ".html", ".ico", ".jpeg",
  ".jpg", ".js", ".joblib", ".json", ".jsx", ".m4v", ".mjs", ".mov", ".mp3", ".mp4",
  ".ogg", ".otf", ".php", ".png", ".py", ".svelte", ".svg", ".toml", ".ts", ".tsx", ".ttf", ".txt",
  ".vue", ".wasm", ".webm", ".webmanifest", ".webp", ".woff", ".woff2", ".yaml", ".yml", ".jinja", ".jinja2"
]);
const RUNTIME_NAMES = new Set([".gitignore", "artisan", "composer.lock", "Dockerfile", "package-lock.json", "Procfile", "railway.json", "nixpacks.toml", "requirements.txt"]);
const RUNTIME_TOO_LARGE_REASON = "This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.";

export async function buildProjectPublishRuntimeBundle(projectId, options = {}) {
  const project = await requireProject(projectId, options.projectPath);
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const metadata = { limits, projectId: project.id, projectPath: project.path, skipped: [], warnings: [] };
  const detected = await detectProjectRuntime(project.path);
  if (!detected) return failure("no_runtime_manifest", "No supported backend manifest was found in the project or its common app folders.", metadata);
  if (!detected.runtime.runnable) return failure("unsupported_runtime", detected.runtime.reason, metadata);
  if (!detected.runtime.startCommand?.trim()) {
    return failure("missing_runtime_start_command", "Runtime bundle does not expose a runnable start command.", metadata);
  }

  const { root, runtime } = detected;
  metadata.runtimeDirectory = root.directory || ".";
  if (runtime.frontendDistDirectory) metadata.frontendDistDirectory = runtime.frontendDistDirectory;
  const runtimeProject = { ...project, path: root.path };
  const state = { project: runtimeProject, files: [], seen: new Set(), totalBytes: 0, failed: null, limits, metadata, platform: runtime.platform, runtime };
  for (const path of priorityRuntimePaths(runtime.platform)) {
    if (runtimePathIncluded(path, runtime)) await addRuntimeFile(state, path);
    if (state.failed) break;
  }
  for (const file of runtime.generatedFiles ?? []) {
    await addVirtualRuntimeFile(state, file.path, file.body);
    if (state.failed) break;
  }
  await scanRuntimeFiles(state, "");
  if (state.failed) return failure(state.failed.code, state.failed.reason, metadata);
  if (!runtime.requiredManifests.some((manifest) => state.files.some((file) => file.path === manifest))) {
    return failure("missing_runtime_manifest", `Runtime bundle did not include ${runtime.requiredManifests.join(" or ")}.`, metadata);
  }
  const missingRequiredPath = (runtime.requiredPaths ?? []).find((path) => !state.files.some((file) => file.path === path));
  if (missingRequiredPath) {
    if (runtime.platform === "laravel" && missingRequiredPath === "public/build/manifest.json") {
      return failure(
        "missing_frontend_build",
        "The Laravel frontend has not been built. Run npm run build in the Laravel app folder, then publish again.",
        metadata
      );
    }
    return failure("missing_runtime_file", `Runtime bundle did not include required file ${missingRequiredPath}.`, metadata);
  }

  metadata.totalFiles = state.files.length;
  metadata.totalBytes = state.totalBytes;
  metadata.truncated = metadata.skipped.some((item) => item.reason === "bundle_limit_reached");

  return {
    ok: true,
    kind: "runtime-source-bundle",
    platform: runtime.platform,
    projectId: project.id,
    files: state.files,
    metadata,
    buildCommand: runtime.buildCommand,
    startCommand: runtime.startCommand,
    needsRuntime: true,
    runtimeReason: runtime.reason
  };
}

async function detectProjectRuntime(projectPath) {
  const roots = await existingProjectAppRoots(
    projectPath,
    RUNTIME_APP_DIRECTORIES,
    ["package.json", "composer.json", "requirements.txt", "pyproject.toml"]
  );
  const runnable = [];
  let unsupported = null;
  for (const root of roots) {
    const packageText = await readOptionalText(root.path, "package.json");
    const composerText = await readOptionalText(root.path, "composer.json");
    const requirementsText = await readOptionalText(root.path, "requirements.txt");
    const pyprojectText = await readOptionalText(root.path, "pyproject.toml");
    let pkg = {};
    try {
      pkg = packageText ? JSON.parse(packageText) : {};
    } catch {
      unsupported ??= { root, runtime: { runnable: false, reason: `${root.directory || "root"}/package.json could not be parsed for runtime hosting.` } };
      continue;
    }
    const laravel = await detectLaravelRuntime(root.path, composerText, pkg);
    const python = await detectPythonRuntime(root.path, requirementsText, pyprojectText);
    const node = detectNodeRuntime(pkg);
    const runtime = [laravel, python, node].find((candidate) => candidate?.runnable)
      ?? laravel
      ?? python
      ?? node;
    if (runtime.runnable) {
      runnable.push({ root, runtime });
      continue;
    }
    unsupported ??= { root, runtime };
  }
  if (runnable.length) {
    runnable.sort((a, b) => runtimeCandidateScore(b) - runtimeCandidateScore(a));
    return runnable[0];
  }
  if (unsupported) return unsupported;
  const unsupportedMarker = await firstExistingProjectMarker(
    projectPath,
    RUNTIME_APP_DIRECTORIES,
    UNSUPPORTED_RUNTIME_MARKERS
  );
  if (!unsupportedMarker) return null;
  return {
    root: unsupportedMarker,
    runtime: {
      runnable: false,
      reason: `${unsupportedMarker.runtime} runtime hosting is not supported yet. Vibyra can host Node servers, Laravel, Django, FastAPI, or Flask projects.`
    }
  };
}

function detectNodeRuntime(pkg) {
  const scripts = pkg?.scripts ?? {};
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
  const hasServerDependency = ["express", "fastify", "@hono/node-server", "next"].some(has);
  const frontendOnly = !hasServerDependency && ["expo", "react-native", "vite", "react"].some(has);
  if (frontendOnly && (!scripts.start || /(?:npm|pnpm|yarn)\s+(?:run\s+)?dev\b|(?:expo|vite)\s+start\b/i.test(scripts.start))) {
    return {
      runnable: false,
      reason: "This folder contains a frontend-only Node package, not a server runtime. Build it for static publishing or open the folder that contains its backend."
    };
  }
  if (scripts.start) return {
    runnable: true,
    platform: "node",
    requiredManifests: ["package.json"],
    reason: "package.json has a start script.",
    buildCommand: scripts.build ? packageManagerBuildCommand() : "",
    startCommand: "npm run start"
  };
  if (has("next") && scripts.build) return {
    runnable: true,
    platform: "node",
    requiredManifests: ["package.json"],
    reason: "Next.js app has a build script but no start script.",
    buildCommand: packageManagerBuildCommand(),
    startCommand: ""
  };
  if (has("express") || has("fastify") || has("@hono/node-server")) {
    return {
      runnable: true,
      platform: "node",
      requiredManifests: ["package.json"],
      reason: "Node API framework dependency detected.",
      buildCommand: scripts.build ? packageManagerBuildCommand() : "",
      startCommand: scripts.dev ? "npm run dev" : ""
    };
  }
  return {
    runnable: false,
    reason: frontendOnly
      ? "This folder contains a frontend-only Node package, not a server runtime. Build it for static publishing or open the folder that contains its backend."
      : "This Node package does not expose a supported server start command."
  };
}

async function detectLaravelRuntime(rootPath, composerText, pkg) {
  if (!/laravel\/framework/i.test(composerText || "")) return null;
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasVite = Object.prototype.hasOwnProperty.call(deps, "laravel-vite-plugin");
  const hasFrontendBuild = await fileExists(rootPath, "public/build/manifest.json");
  return {
    runnable: true,
    platform: "laravel",
    requiredManifests: ["composer.json"],
    requiredPaths: [
      "artisan",
      "public/index.php",
      ...(hasVite || hasFrontendBuild ? ["public/build/manifest.json"] : [])
    ],
    reason: hasVite ? "Laravel app with Vite assets." : "Laravel app.",
    buildCommand: "composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader",
    startCommand: "mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs && touch /tmp/vibyra-demo.sqlite && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${PORT}"
  };
}

function runtimeCandidateScore(candidate) {
  const platformScore = candidate.runtime.platform === "laravel"
    ? 300
    : candidate.runtime.platform === "python"
      ? 250
      : 100;
  const backendDirectoryScore = /^(?:backend|server|api|apps\/api|packages\/api)$/.test(candidate.root.directory) ? 20 : 0;
  return platformScore + backendDirectoryScore;
}

async function detectPythonRuntime(rootPath, requirementsText, pyprojectText) {
  const dependencies = `${requirementsText}\n${pyprojectText}`.toLowerCase();
  const install = requirementsText ? "pip install -r requirements.txt" : pyprojectText ? "pip install ." : "";
  if (!install) return null;
  if (/django(?:[<=>~! ]|$)/m.test(dependencies) && await fileExists(rootPath, "manage.py")) {
    return {
      runnable: true,
      platform: "python",
      requiredManifests: requirementsText ? ["requirements.txt"] : ["pyproject.toml"],
      reason: "Django backend detected.",
      buildCommand: install,
      startCommand: "python manage.py runserver 0.0.0.0:${PORT}"
    };
  }
  const entry = await pythonAppModule(rootPath);
  if (/fastapi(?:[<=>~! ]|$)/m.test(dependencies) && entry) {
    const frontendDistDirectory = await builtFrontendDirectory(rootPath);
    if (frontendDistDirectory) {
      const wrapperPath = "_vibyra_runtime.py";
      return {
        runnable: true,
        platform: "python",
        requiredManifests: requirementsText ? ["requirements.txt"] : ["pyproject.toml"],
        requiredPaths: [entry.path, `${frontendDistDirectory}/index.html`, wrapperPath],
        reason: "FastAPI backend with a built same-origin frontend.",
        buildCommand: install,
        startCommand: `python -m uvicorn _vibyra_runtime:app --host 0.0.0.0 --port \${PORT}`,
        frontendDistDirectory,
        generatedFiles: [{ path: wrapperPath, body: fastApiFrontendWrapper(entry.module, frontendDistDirectory) }]
      };
    }
    return {
      runnable: true,
      platform: "python",
      requiredManifests: requirementsText ? ["requirements.txt"] : ["pyproject.toml"],
      requiredPaths: [entry.path],
      reason: "FastAPI backend detected.",
      buildCommand: install,
      startCommand: `python -m uvicorn ${entry.module}:app --host 0.0.0.0 --port \${PORT}`
    };
  }
  if (/flask(?:[<=>~! ]|$)/m.test(dependencies) && entry) {
    return {
      runnable: true,
      platform: "python",
      requiredManifests: requirementsText ? ["requirements.txt"] : ["pyproject.toml"],
      requiredPaths: [entry.path],
      reason: "Flask backend detected.",
      buildCommand: install,
      startCommand: `python -m flask --app ${entry.module} run --host 0.0.0.0 --port \${PORT}`
    };
  }
  return { runnable: false, reason: "Python manifest found, but no conventional Django, FastAPI, or Flask entry point was detected." };
}

async function pythonAppModule(rootPath) {
  for (const path of [
    "main.py", "app.py", "app/main.py", "src/main.py",
    "backend/main.py", "backend/app.py", "backend/app/main.py",
    "api/main.py", "api/app.py", "api/app/main.py"
  ]) {
    if (await fileExists(rootPath, path)) {
      return { path, module: path.replace(/\.py$/, "").replaceAll("/", ".") };
    }
  }
  return null;
}

async function builtFrontendDirectory(rootPath) {
  for (const directory of ["frontend/dist", "client/dist", "web/dist", "dist"]) {
    if (await fileExists(rootPath, `${directory}/index.html`)) return directory;
  }
  return "";
}

function fastApiFrontendWrapper(module, frontendDistDirectory) {
  return [
    "from importlib import import_module",
    "",
    "from fastapi.staticfiles import StaticFiles",
    "",
    `app = import_module(${JSON.stringify(module)}).app`,
    `app.mount(\"/\", StaticFiles(directory=${JSON.stringify(frontendDistDirectory)}, html=True), name=\"vibyra_frontend\")`,
    ""
  ].join("\n");
}

function packageManagerBuildCommand() {
  return "npm run build";
}

function priorityRuntimePaths(platform) {
  if (platform === "python") return ["requirements.txt", "pyproject.toml", "manage.py", "main.py", "app.py", "app/main.py", "src/main.py"];
  return platform === "laravel"
    ? [
        "composer.json", "composer.lock", "artisan",
        "bootstrap/app.php", "bootstrap/providers.php", "bootstrap/cache/.gitignore", "config/app.php", "public/index.php",
        "routes/web.php", "routes/console.php"
      ]
    : ["package.json"];
}

async function scanRuntimeFiles(state, directory) {
  if (state.failed) return;
  let entries;
  try {
    entries = await readdir(resolve(state.project.path, directory), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (state.failed) return;
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (!runtimePathIncluded(path, state.runtime)) continue;
    const reason = unsafeRuntimePathReason(path, state.runtime);
    if (reason) {
      state.metadata.skipped.push({ path, reason });
      continue;
    }
    if (entry.isDirectory()) {
      await scanRuntimeFiles(state, path);
      continue;
    }
    if (entry.isFile()) await addRuntimeFile(state, path);
  }
}

async function addRuntimeFile(state, path) {
  if (state.failed || state.seen.has(path)) return;
  const extension = extname(path).toLowerCase();
  if (!RUNTIME_EXTENSIONS.has(extension) && !RUNTIME_NAMES.has(basename(path))) {
    state.metadata.skipped.push({ path, reason: "unsupported_runtime_type" });
    return;
  }
  const absolutePath = resolve(state.project.path, path);
  if (!pathStaysInside(state.project.path, absolutePath)) {
    state.metadata.skipped.push({ path, reason: "outside_project" });
    return;
  }
  let info;
  try {
    info = await stat(absolutePath);
  } catch {
    return;
  }
  if (!info.isFile()) return;
  const maxFileBytes = isGeneratedBuildAssetPath(path, state.runtime) ? state.limits.maxBuildAssetBytes : state.limits.maxFileBytes;
  if (info.size > maxFileBytes) {
    state.metadata.skipped.push({ path, reason: "file_too_large" });
    if (isRequiredRuntimePath(path, state.runtime) || isGeneratedBuildAssetPath(path, state.runtime)) {
      state.failed = { code: "runtime_bundle_limit_exceeded", reason: RUNTIME_TOO_LARGE_REASON };
    }
    return;
  }
  if (state.files.length + 1 > state.limits.maxFiles || state.totalBytes + info.size > state.limits.maxTotalBytes) {
    state.metadata.skipped.push({ path, reason: "bundle_limit_reached" });
    state.metadata.truncated = true;
    state.failed = { code: "runtime_bundle_limit_exceeded", reason: RUNTIME_TOO_LARGE_REASON };
    return;
  }
  const buffer = await readFile(absolutePath);
  const encoding = isTextFile(path) ? "utf8" : "base64";
  const body = encoding === "utf8" ? runtimeTextBody(state, path, buffer.toString("utf8")) : buffer.toString("base64");
  state.seen.add(path);
  state.totalBytes += info.size;
  state.files.push({
    path,
    contentType: contentTypeFor(path),
    encoding,
    size: info.size,
    body
  });
}

async function addVirtualRuntimeFile(state, path, body) {
  if (state.failed || state.seen.has(path)) return;
  const size = Buffer.byteLength(body, "utf8");
  if (size > state.limits.maxFileBytes) {
    state.metadata.skipped.push({ path, reason: "file_too_large" });
    return;
  }
  if (state.files.length + 1 > state.limits.maxFiles || state.totalBytes + size > state.limits.maxTotalBytes) {
    state.metadata.skipped.push({ path, reason: "bundle_limit_reached" });
    state.metadata.truncated = true;
    state.failed = { code: "runtime_bundle_limit_exceeded", reason: RUNTIME_TOO_LARGE_REASON };
    return;
  }
  state.seen.add(path);
  state.totalBytes += size;
  state.files.push({
    path,
    contentType: contentTypeFor(path),
    encoding: "utf8",
    size,
    body
  });
}

function runtimeTextBody(state, path, body) {
  if (state.platform !== "laravel" || path !== "package.json") return body;
  try {
    const pkg = JSON.parse(body);
    pkg.engines = { ...(pkg.engines ?? {}), node: "22" };
    return `${JSON.stringify(pkg, null, 2)}\n`;
  } catch {
    return body;
  }
}

async function readOptionalText(projectPath, relativePath) {
  try {
    return await readFile(resolve(projectPath, relativePath), "utf8");
  } catch {
    return "";
  }
}

async function fileExists(projectPath, relativePath) {
  try {
    return (await stat(resolve(projectPath, relativePath))).isFile();
  } catch {
    return false;
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

function runtimePathIncluded(path, runtime) {
  if (runtime.frontendDistDirectory) {
    const directory = runtime.frontendDistDirectory;
    const frontendRoot = directory.split("/")[0];
    if (path === directory || path.startsWith(`${directory}/`) || directory.startsWith(`${path}/`)) return true;
    if (path === frontendRoot || path.startsWith(`${frontendRoot}/`)) return false;
  }
  if (runtime.platform !== "laravel") return true;
  const first = String(path).split("/")[0] ?? "";
  if (path === "bootstrap/cache/.gitignore" || path === "bootstrap/cache/.gitkeep") return true;
  if (path === "bootstrap/cache" || path.startsWith("bootstrap/cache/")) return false;
  if (["app", "bootstrap", "config", "database", "lang", "routes"].includes(first)) return true;
  if (path === "resources" || path === "resources/views" || path.startsWith("resources/views/")) return true;
  if (path === "public" || path === "public/index.php" || path === "public/build" || path.startsWith("public/build/")) return true;
  return ["artisan", "composer.json", "composer.lock"].includes(path);
}

function unsafeRuntimePathReason(path, runtime = { platform: "node" }) {
  const segments = String(path).split("/");
  if (segments.some((segment, index) => {
    if (runtime.platform === "laravel" && segment === "build" && segments[index - 1] === "public") return false;
    if (runtime.frontendDistDirectory && segment === "dist") {
      const prefix = segments.slice(0, index + 1).join("/");
      if (prefix === runtime.frontendDistDirectory) return false;
    }
    return SKIP_DIRS.has(segment);
  })) return "generated_or_private_directory";
  if (!isGeneratedBuildAssetPath(path, runtime) && segments.some((segment) => UNSAFE_NAMES.some((pattern) => pattern.test(segment)))) return "env_or_credential_file";
  if (UNSAFE_EXTENSIONS.has(extname(basename(path)).toLowerCase())) return "credential_or_private_file";
  return "";
}

function isGeneratedBuildAssetPath(path, runtime = {}) {
  return /^(?:public\/)?build\/assets\//i.test(path)
    || Boolean(runtime.frontendDistDirectory && path.startsWith(`${runtime.frontendDistDirectory}/`));
}

function isRequiredRuntimePath(path, runtime = {}) {
  return (runtime.requiredManifests ?? []).includes(path)
    || (runtime.requiredPaths ?? []).includes(path);
}

function pathStaysInside(root, filePath) {
  const relativePath = relative(resolve(root), resolve(filePath));
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isTextFile(path) {
  return [".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".php", ".py", ".jinja", ".jinja2", ".ts", ".tsx", ".txt", ".vue", ".svelte", ".yaml", ".yml", ".toml", ".svg"].includes(extname(path).toLowerCase())
    || RUNTIME_NAMES.has(basename(path));
}

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".html") return "text/html; charset=UTF-8";
  if (ext === ".css") return "text/css; charset=UTF-8";
  if ([".js", ".mjs", ".cjs"].includes(ext)) return "application/javascript; charset=UTF-8";
  if (ext === ".json") return "application/json; charset=UTF-8";
  if (ext === ".php") return "text/x-php; charset=UTF-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".wasm") return "application/wasm";
  if (ext === ".glb") return "model/gltf-binary";
  if (ext === ".gltf") return "model/gltf+json";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return isTextFile(path) ? "text/plain; charset=UTF-8" : "application/octet-stream";
}

function failure(code, reason, metadata) {
  return { ok: false, code, reason, failureReasons: [reason], files: [], metadata, needsRuntime: false };
}
