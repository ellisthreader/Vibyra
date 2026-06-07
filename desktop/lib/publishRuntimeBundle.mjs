import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { discoverProjects, projectById } from "./projects.mjs";
import { existingProjectAppRoots, RUNTIME_APP_DIRECTORIES } from "./projectAppRoots.mjs";

const DEFAULT_LIMITS = { maxFiles: 320, maxTotalBytes: 7_500_000, maxFileBytes: 800_000, maxBuildAssetBytes: 2_800_000 };
const SKIP_DIRS = new Set([
  ".expo", ".git", ".hg", ".next", ".output", ".parcel-cache", ".svn", ".turbo", ".vibyra-agent",
  ".venv", "__pycache__", "coverage", "dist", "build", "node_modules", "vendor", "venv"
]);
const UNSAFE_NAMES = [/^\.env(?:\.|$)/i, /(?:^|[-_.])(secret|token|credential|password|private[-_.]?key|api[-_.]?key)(?:[-_.]|$)/i, /^id_rsa/i];
const UNSAFE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12", ".pfx", ".crt", ".cer"]);
const RUNTIME_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".txt",
  ".vue", ".svelte", ".yaml", ".yml", ".toml", ".svg", ".png", ".jpg", ".jpeg", ".webp",
  ".gif", ".ico", ".php", ".py", ".jinja", ".jinja2", ".woff", ".woff2", ".ttf", ".otf"
]);
const RUNTIME_NAMES = new Set([".gitignore", "artisan", "composer.lock", "Dockerfile", "package-lock.json", "Procfile", "railway.json", "nixpacks.toml", "requirements.txt"]);

export async function buildProjectPublishRuntimeBundle(projectId, options = {}) {
  const project = await requireProject(projectId);
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const metadata = { limits, projectId: project.id, projectPath: project.path, skipped: [], warnings: [] };
  const detected = await detectProjectRuntime(project.path);
  if (!detected) return failure("no_runtime_manifest", "No supported backend manifest was found in the project or its common app folders.", metadata);
  if (!detected.runtime.runnable) return failure("unsupported_runtime", detected.runtime.reason, metadata);

  const { root, runtime } = detected;
  metadata.runtimeDirectory = root.directory || ".";
  const runtimeProject = { ...project, path: root.path };
  const state = { project: runtimeProject, files: [], seen: new Set(), totalBytes: 0, failed: null, limits, metadata, platform: runtime.platform };
  for (const path of priorityRuntimePaths(runtime.platform)) {
    if (runtimePathIncluded(path, runtime.platform)) await addRuntimeFile(state, path);
  }
  await scanRuntimeFiles(state, "");
  if (state.failed) return failure(state.failed.code, state.failed.reason, metadata);
  if (!runtime.requiredManifests.some((manifest) => state.files.some((file) => file.path === manifest))) {
    return failure("missing_runtime_manifest", `Runtime bundle did not include ${runtime.requiredManifests.join(" or ")}.`, metadata);
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
    const laravel = detectLaravelRuntime(composerText, pkg);
    const python = await detectPythonRuntime(root.path, requirementsText, pyprojectText);
    const node = detectNodeRuntime(pkg);
    const runtime = [laravel, python, node].find((candidate) => candidate?.runnable)
      ?? laravel
      ?? python
      ?? node;
    if (runtime.runnable) return { root, runtime };
    unsupported ??= { root, runtime };
  }
  return unsupported;
}

function detectNodeRuntime(pkg) {
  const scripts = pkg?.scripts ?? {};
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
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
    reason: "Next.js app with build script.",
    buildCommand: packageManagerBuildCommand(),
    startCommand: "npm run start"
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
  return { runnable: false, reason: "This project does not expose a supported Node server runtime." };
}

function detectLaravelRuntime(composerText, pkg) {
  if (!/laravel\/framework/i.test(composerText || "")) return null;
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasVite = Object.prototype.hasOwnProperty.call(deps, "laravel-vite-plugin");
  return {
    runnable: true,
    platform: "laravel",
    requiredManifests: ["composer.json"],
    reason: hasVite ? "Laravel app with Vite assets." : "Laravel app.",
    buildCommand: "composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader",
    startCommand: "mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}"
  };
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
  const module = await pythonAppModule(rootPath);
  if (/fastapi(?:[<=>~! ]|$)/m.test(dependencies) && module) {
    return {
      runnable: true,
      platform: "python",
      requiredManifests: requirementsText ? ["requirements.txt"] : ["pyproject.toml"],
      reason: "FastAPI backend detected.",
      buildCommand: install,
      startCommand: `python -m uvicorn ${module}:app --host 0.0.0.0 --port \${PORT}`
    };
  }
  if (/flask(?:[<=>~! ]|$)/m.test(dependencies) && module) {
    return {
      runnable: true,
      platform: "python",
      requiredManifests: requirementsText ? ["requirements.txt"] : ["pyproject.toml"],
      reason: "Flask backend detected.",
      buildCommand: install,
      startCommand: `python -m flask --app ${module} run --host 0.0.0.0 --port \${PORT}`
    };
  }
  return { runnable: false, reason: "Python manifest found, but no conventional Django, FastAPI, or Flask entry point was detected." };
}

async function pythonAppModule(rootPath) {
  for (const path of ["main.py", "app.py", "app/main.py", "src/main.py"]) {
    if (await fileExists(rootPath, path)) return path.replace(/\.py$/, "").replaceAll("/", ".");
  }
  return "";
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
  if (state.files.length >= state.limits.maxFiles || state.failed) return;
  let entries;
  try {
    entries = await readdir(resolve(state.project.path, directory), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (state.files.length >= state.limits.maxFiles || state.failed) return;
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (!runtimePathIncluded(path, state.platform)) continue;
    const reason = unsafeRuntimePathReason(path, state.platform);
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
  if (state.seen.has(path)) return;
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
  const maxFileBytes = isGeneratedBuildAssetPath(path) ? state.limits.maxBuildAssetBytes : state.limits.maxFileBytes;
  if (info.size > maxFileBytes) {
    state.metadata.skipped.push({ path, reason: "file_too_large" });
    return;
  }
  if (state.files.length + 1 > state.limits.maxFiles || state.totalBytes + info.size > state.limits.maxTotalBytes) {
    state.metadata.skipped.push({ path, reason: "bundle_limit_reached" });
    state.failed = { code: "runtime_bundle_limit_exceeded", reason: "Runtime bundle exceeded safe upload limits." };
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

async function requireProject(projectId) {
  if (!projectId) throw new Error("No project selected");
  if (projectById(projectId)) return projectById(projectId);
  await discoverProjects();
  const project = projectById(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

function runtimePathIncluded(path, platform) {
  if (platform !== "laravel") return true;
  const first = String(path).split("/")[0] ?? "";
  if (path === "bootstrap/cache/.gitignore" || path === "bootstrap/cache/.gitkeep") return true;
  if (path === "bootstrap/cache" || path.startsWith("bootstrap/cache/")) return false;
  if (["app", "bootstrap", "config", "database", "lang", "routes"].includes(first)) return true;
  if (path === "resources" || path === "resources/views" || path.startsWith("resources/views/")) return true;
  if (path === "public" || path === "public/index.php" || path === "public/build" || path.startsWith("public/build/")) return true;
  return ["artisan", "composer.json", "composer.lock"].includes(path);
}

function unsafeRuntimePathReason(path, platform = "node") {
  const segments = String(path).split("/");
  if (segments.some((segment, index) => {
    if (platform === "laravel" && segment === "build" && segments[index - 1] === "public") return false;
    return SKIP_DIRS.has(segment);
  })) return "generated_or_private_directory";
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
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "text/plain; charset=UTF-8";
}

function failure(code, reason, metadata) {
  return { ok: false, code, reason, failureReasons: [reason], files: [], metadata, needsRuntime: false };
}
