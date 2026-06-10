import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_API_URL = "https://vibyra-production.up.railway.app";

export function desktopAppApiUrl(env = process.env) {
  return normalizeApiUrl(
    env.VIBYRA_DESKTOP_API_URL
    || env.VIBYRA_API_URL
    || env.EXPO_PUBLIC_API_URL
    || rootEnvApiUrl()
    || PRODUCTION_API_URL
  );
}

function rootEnvApiUrl() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const contents = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      return match[1].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Packaged desktop builds may not include a repo-level .env file.
  }

  return "";
}

function normalizeApiUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
