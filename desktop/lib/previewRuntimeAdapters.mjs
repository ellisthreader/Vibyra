import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { discoverProjectAppDirectories } from "./projectAppDiscovery.mjs";

const RUNTIME_ROOTS = ["", "frontend", "client", "web", "website", "site", "ui", "dashboard", "app", "backend", "server", "service", "api", "apps/web", "apps/client", "packages/app", "packages/web"];

export async function runtimePreviewContext(projectPath, preferredDirectory = "") {
  const contexts = await runtimePreviewContexts(projectPath, preferredDirectory);
  return contexts[0] || null;
}

export async function runtimePreviewContexts(projectPath, preferredDirectory = "") {
  const directories = preferredDirectory
    ? [preferredDirectory]
    : Array.from(new Set([...RUNTIME_ROOTS, ...await discoverProjectAppDirectories(projectPath, runtimeMarkers())]));
  const contexts = [];
  for (const directory of directories) {
    const appPath = resolve(projectPath, directory);
    const context = await detectRuntime(appPath, directory);
    if (context) contexts.push(context);
  }
  return contexts;
}

export function runtimePreviewLaunch(context, port) {
  const host = "0.0.0.0";
  const kind = context.profile.id;
  const python = process.platform === "win32" ? "python" : "python3";
  if (kind === "django") return launch(python, ["manage.py", "runserver", `${host}:${port}`]);
  if (kind === "fastapi") return launch(python, ["-m", "uvicorn", `${context.module}:app`, "--host", host, "--port", String(port)]);
  if (kind === "flask") return launch(python, ["-m", "flask", "--app", context.module, "run", "--host", host, "--port", String(port)]);
  if (kind === "php") return launch("php", ["-S", `${host}:${port}`, "-t", context.documentRoot]);
  if (kind === "rails") return launch("bundle", ["exec", "rails", "server", "-b", host, "-p", String(port)]);
  if (kind === "jekyll") return launch("bundle", ["exec", "jekyll", "serve", "--host", host, "--port", String(port)]);
  if (kind === "hugo") return launch("hugo", ["server", "--bind", host, "--port", String(port), "--disableFastRender"]);
  if (kind === "flutter-web") return launch("flutter", ["run", "-d", "web-server", "--web-hostname", host, "--web-port", String(port)]);
  return null;
}

async function detectRuntime(appPath, appDirectory) {
  const requirements = `${await text(appPath, "requirements.txt")}\n${await text(appPath, "pyproject.toml")}`.toLowerCase();
  if (await exists(appPath, "manage.py")) return context(appPath, appDirectory, "django", "Django", [8000, 8001, 8002]);
  const python = await pythonModule(appPath);
  if (python && /fastapi|uvicorn/.test(requirements + python.source.toLowerCase())) {
    return { ...context(appPath, appDirectory, "fastapi", "FastAPI", [8000, 8001, 8002]), module: python.module };
  }
  if (python && /flask/.test(requirements + python.source.toLowerCase())) {
    return { ...context(appPath, appDirectory, "flask", "Flask", [5000, 5001, 5002]), module: python.module };
  }
  const pubspec = await text(appPath, "pubspec.yaml");
  if (/^\s*flutter\s*:/m.test(pubspec)) return context(appPath, appDirectory, "flutter-web", "Flutter web", [8080, 8081, 8082]);
  const gemfile = await text(appPath, "Gemfile");
  if (/gem\s+["']rails["']/.test(gemfile)) return context(appPath, appDirectory, "rails", "Ruby on Rails", [3000, 3001, 3002]);
  if (/gem\s+["']jekyll["']/.test(gemfile)) return context(appPath, appDirectory, "jekyll", "Jekyll", [4000, 4001, 4002]);
  if (await hasHugoConfig(appPath)) return context(appPath, appDirectory, "hugo", "Hugo", [1313, 1314, 1315]);
  const phpRoot = await phpDocumentRoot(appPath);
  if (phpRoot) return { ...context(appPath, appDirectory, "php", "PHP", [8000, 8001, 8002]), documentRoot: phpRoot };
  return null;
}

function context(appPath, appDirectory, id, label, defaultPorts) {
  return {
    appDirectory,
    appPath,
    localHtml: "",
    localScripts: [],
    packageText: "",
    profile: { id, label, command: commandHint(id), defaultPorts },
    reuseExisting: false,
    runtime: true
  };
}

function launch(executable, args) {
  return { executable, args, command: [executable, ...args].join(" "), env: {} };
}

function commandHint(id) {
  return {
    django: "python3 manage.py runserver",
    fastapi: "python3 -m uvicorn <module>:app",
    flask: "python3 -m flask --app <module> run",
    php: "php -S <host>:<port>",
    rails: "bundle exec rails server",
    jekyll: "bundle exec jekyll serve",
    hugo: "hugo server",
    "flutter-web": "flutter run -d web-server"
  }[id];
}

async function pythonModule(appPath) {
  for (const name of ["main.py", "app.py", "server.py", "wsgi.py", "app/main.py", "src/main.py"]) {
    const source = await text(appPath, name);
    if (source) return { module: name.replace(/\.py$/, "").replaceAll("/", "."), source };
  }
  return null;
}

async function phpDocumentRoot(appPath) {
  if (await exists(appPath, "public/index.php")) return "public";
  if (await exists(appPath, "index.php")) return ".";
  return "";
}

async function hasHugoConfig(appPath) {
  for (const name of ["hugo.toml", "hugo.yaml", "hugo.yml", "config.toml"]) {
    if (await exists(appPath, name)) return true;
  }
  return false;
}

async function text(root, name) {
  try { return await readFile(join(root, name), "utf8"); } catch { return ""; }
}

async function exists(root, name) {
  try { await access(join(root, name)); return true; } catch { return false; }
}

function runtimeMarkers() {
  return [
    "Gemfile",
    "hugo.toml",
    "hugo.yaml",
    "hugo.yml",
    "index.php",
    "manage.py",
    "pubspec.yaml",
    "pyproject.toml",
    "requirements.txt"
  ];
}
