import { constants } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const CONTAINER_DB_HOSTS = new Set(["db", "database", "mariadb", "mysql"]);

export async function laravelPreviewEnv(projectPath) {
  const envText = await readOptionalText(join(projectPath, ".env"));
  const env = parseEnv(envText);
  const sqlitePath = join(projectPath, "database", "database.sqlite");
  if (!usesContainerDatabase(env) || !await fileExists(sqlitePath)) return {};
  return {
    CACHE_STORE: "file",
    DB_CONNECTION: "sqlite",
    DB_DATABASE: sqlitePath,
    QUEUE_CONNECTION: "sync",
    SESSION_DRIVER: "file"
  };
}

export async function prepareLaravelViteHotFile(projectPath) {
  const publicPath = join(projectPath, "public");
  const hotPath = join(publicPath, "hot");
  try {
    await access(publicPath, constants.W_OK);
    await rm(hotPath, { force: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    if (error?.code === "EACCES" || error?.code === "EPERM") {
      throw new Error(laravelHotFilePermissionFailure(projectPath));
    }
    throw error;
  }
}

export function laravelViteStartupFailure(projectPath, output) {
  const text = String(output ?? "");
  const permissionDenied = /EACCES|EPERM/i.test(text) && /public[\\/]hot/i.test(text);
  if (permissionDenied) {
    return {
      message: laravelHotFilePermissionFailure(projectPath),
      retryPort: false
    };
  }
  const portMatch = text.match(/\bPort\s+(\d{2,5})\s+is already in use\b/i);
  if (portMatch) {
    return {
      message: `Vite could not bind port ${portMatch[1]}. Vibyra will retry once with another free port. If it still fails, stop the process using that port or remove a fixed server.hmr.port/server.port value from vite.config.*.`,
      retryPort: true
    };
  }
  return null;
}

export async function laravelHttpFailure(projectPath, status, target = "/") {
  const prefix = `Laravel returned HTTP ${status} for ${target}.`;
  const log = await readRecentLog(projectPath);
  const diagnostic = classifyLaravelLog(log);
  if (diagnostic) return `${prefix} ${diagnostic}`;
  return `${prefix} Check ${projectPath}/storage/logs/laravel.log for the application error.`;
}

function laravelHotFilePermissionFailure(projectPath) {
  return `Vite cannot write Laravel's generated hot-file at ${join(projectPath, "public", "hot")}. The project is not writable by the current desktop user, commonly because npm, PHP, or Composer was previously run with sudo. From the project directory run: sudo chown -R "$USER":"$(id -gn)" public storage bootstrap/cache && chmod -R u+rwX public storage bootstrap/cache. Then retry Preview. Do not run Vite with sudo.`;
}

function classifyLaravelLog(log) {
  if (!log) return "";
  if (/php_network_getaddresses|getaddrinfo for (?:mysql|mariadb|db|database) failed/i.test(log)) {
    return "Laravel is configured for a container database host such as DB_HOST=mysql, but Vibyra starts previews with local PHP outside that container. If the project has database/database.sqlite, Vibyra uses it automatically for preview; otherwise start the project's database container or switch the local preview .env to a reachable database.";
  }
  if (/ReflectionProperty::isVirtual\(\)/i.test(log)) {
    return "The installed Composer dependencies expect a newer PHP runtime than the local PHP CLI can provide. Reinstall/update Composer dependencies with the same PHP version Vibyra uses, or run the project with PHP 8.4+.";
  }
  if (/Unable to locate file in Vite manifest/i.test(log)) {
    return "Laravel could not find a built Vite manifest. Run the approved Laravel/Vite preview startup or build the frontend assets with npm run build.";
  }
  if (/Base table or view not found: .*sessions|Table .*\.sessions.* doesn't exist/i.test(log)) {
    return "Laravel's database-backed session table is missing. Run migrations for the project or use file sessions for local preview.";
  }
  return "";
}

function usesContainerDatabase(env) {
  const connection = String(env.DB_CONNECTION ?? "").toLowerCase();
  const host = String(env.DB_HOST ?? "").toLowerCase();
  return ["mysql", "mariadb"].includes(connection) && CONTAINER_DB_HOSTS.has(host);
}

function parseEnv(text) {
  const env = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!match) continue;
    env[match[1]] = unquote(match[2].trim());
  }
  return env;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function readRecentLog(projectPath) {
  const text = await readOptionalText(join(projectPath, "storage", "logs", "laravel.log"));
  return text ? text.slice(-16000) : "";
}

async function readOptionalText(path) {
  try { return await readFile(path, "utf8"); } catch { return null; }
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}
