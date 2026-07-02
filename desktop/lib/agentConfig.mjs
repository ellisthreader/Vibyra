import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP_LIB_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DESKTOP_LIB_DIR, "..", "..");

export async function openRouterConfigValue(key) {
  if (process.env[key]) return process.env[key];
  for (const path of openRouterConfigPaths()) {
    const body = await readOptionalText(path);
    const value = parseEnvConfigValue(body, key);
    if (value) return value;
  }
  return "";
}

export function openRouterConfigPaths(cwd = process.cwd(), repoRoot = REPO_ROOT) {
  return uniquePaths([
    join(cwd, "backend", ".env"),
    join(cwd, ".env"),
    join(repoRoot, "backend", ".env"),
    join(repoRoot, ".env")
  ]);
}

export function parseEnvConfigValue(body, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(body ?? "").match(
    new RegExp(`^[^\\S\\r\\n]*(?:export[^\\S\\r\\n]+)?${escapedKey}[^\\S\\r\\n]*=[^\\S\\r\\n]*([^\\r\\n]*)`, "m")
  );
  if (!match) return "";
  const raw = match[1].trim();
  const quoted = raw.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) return quoted[2].trim();
  return raw.replace(/\s+#.*$/, "").trim();
}

function uniquePaths(paths) {
  return [...new Set(paths.map((path) => resolve(path)))];
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
