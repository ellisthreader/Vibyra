import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { terminalProviderAdapterForModel } from "./aiTerminalProviderAdapters.mjs";
import { TERMINAL_RUNTIMES } from "./aiTerminalRuntimeCatalog.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, "..", "..");
const runtimeRoot = process.env.VIBYRA_RUNTIME_ROOT
  || join(homedir(), ".vibyra-agent", "runtimes");
const installs = new Map();

export function terminalRuntimeForModel(model = "") {
  const key = String(model || "").trim().toLowerCase();
  if (!key || key === "auto") return null;
  return terminalProviderAdapterForModel(key)?.runtimeId || null;
}

export function terminalRuntimeState() {
  return {
    runtimes: Object.values(TERMINAL_RUNTIMES).map(publicRuntime)
  };
}

export function terminalRuntimeExecutable(id) {
  const runtime = TERMINAL_RUNTIMES[id];
  if (!runtime) return "";
  if (runtime.engineRuntimeId && !terminalRuntimeExecutable(runtime.engineRuntimeId)) {
    return "";
  }
  if (runtime.nodeEntry) {
    return existsSync(runtime.nodeEntry) && canExecute(process.execPath)
      ? process.execPath
      : "";
  }
  for (const key of runtime.env) {
    const candidate = String(process.env[key] || "").trim();
    if (canExecute(candidate)) return candidate;
  }
  for (const candidate of executableCandidates(runtime)) {
    if (canExecute(candidate)) return candidate;
  }
  return "";
}

export async function installTerminalRuntime(id) {
  const runtime = TERMINAL_RUNTIMES[id];
  if (!runtime) throw httpError(404, "Unknown terminal runtime.");
  if (terminalRuntimeExecutable(id)) return publicRuntime(runtime);
  if (installs.has(id)) return installs.get(id);
  const install = runInstall(runtime).finally(() => installs.delete(id));
  installs.set(id, install);
  return install;
}

async function runInstall(runtime) {
  if (runtime.installer.type === "bundled") return publicRuntime(runtime);
  const target = join(runtimeRoot, runtime.id);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const installer = runtime.installer;
  if (installer.type === "npm") {
    await run("npm", [
      "install",
      "--prefix", target,
      "--no-audit",
      "--no-fund",
      "--save-exact",
      `${installer.package}@${installer.version}`
    ]);
  } else {
    const uv = findOnPath("uv");
    if (!uv) throw httpError(409, "Install uv before downloading Mistral Vibe.");
    await run(uv, ["tool", "install", "--force", `${installer.package}==${installer.version}`], {
      ...process.env,
      UV_TOOL_DIR: join(target, "tools"),
      UV_TOOL_BIN_DIR: join(target, "bin")
    });
  }
  const result = publicRuntime(runtime);
  if (!result.available) throw httpError(500, `${runtime.label} installed but its executable was not found.`);
  return result;
}

function publicRuntime(runtime) {
  const executable = terminalRuntimeExecutable(runtime.id);
  const available = Boolean(executable);
  const adapterReady = Boolean(runtime.adapter?.ready);
  return {
    id: runtime.id,
    label: runtime.label,
    available,
    adapterReady,
    ready: available && adapterReady,
    adapterId: runtime.adapter?.id || "",
    protocol: runtime.adapter?.protocol || "",
    adapterReason: adapterReady ? "" : String(runtime.adapter?.reason || "The Vibyra gateway adapter is unavailable."),
    requirements: runtime.requirements || {},
    bundled: Boolean(runtime.bundled),
    installing: installs.has(runtime.id),
    version: runtime.installer.version || "",
    installable: runtime.installer.type !== "bundled",
    source: executable ? runtimeSource(runtime, executable) : ""
  };
}

function executableCandidates(runtime) {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return [
    join(repoRoot, "node_modules", ".bin", `${runtime.executable}${suffix}`),
    join(runtimeRoot, runtime.id, "node_modules", ".bin", `${runtime.executable}${suffix}`),
    join(runtimeRoot, runtime.id, "bin", `${runtime.executable}${suffix}`),
    findOnPath(runtime.executable)
  ].filter(Boolean);
}

function runtimeSource(runtime, executable) {
  if (runtime.nodeEntry) return "bundled";
  if (executable.includes(join(repoRoot, "node_modules"))) return "bundled";
  if (executable.includes(join(runtimeRoot, runtime.id))) return "managed";
  return "system";
}

function findOnPath(command) {
  const suffixes = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of String(process.env.PATH || "").split(delimiter)) {
    for (const suffix of suffixes) {
      const candidate = join(dir, `${command}${suffix}`);
      if (canExecute(candidate)) return candidate;
    }
  }
  return "";
}

function canExecute(path) {
  if (!path || !existsSync(path)) return false;
  try {
    accessSync(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(httpError(500, stderr.trim().split(/\r?\n/).at(-1) || `Installer exited with code ${code}.`));
    });
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
