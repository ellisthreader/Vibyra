import { spawn } from "node:child_process";

// Node on Windows refuses to spawn .cmd/.bat shims (npm, pnpm, yarn, ...) without a
// shell (spawn EINVAL, CVE-2024-27980 hardening), and script wrappers on PATH are only
// resolved through cmd.exe. Route Windows launches through the shell while keeping
// POSIX spawns untouched.
export function spawnCommand(executable, args = [], options = {}) {
  if (process.platform !== "win32") return spawn(executable, args, options);
  return spawn([executable, ...args].map(shellArg).join(" "), [], {
    windowsHide: true,
    ...options,
    detached: false,
    shell: true
  });
}

// Shell-launched Windows children are cmd.exe hosts; killing them directly orphans the
// actual dev-server process. taskkill /T terminates the whole tree.
export function killCommandTree(child, signal = "SIGTERM") {
  if (!child) return;
  if (process.platform === "win32" && child.pid && child.exitCode === null && !child.killed) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      return;
    } catch {}
  }
  try { child.kill(signal); } catch {}
}

function shellArg(value) {
  const text = String(value);
  if (text === "") return '""';
  return /[\s"&|<>^()]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
