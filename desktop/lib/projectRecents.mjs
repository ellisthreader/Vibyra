import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const RECENTS_PATH = join(process.env.VIBYRA_AGENT_HOME || homedir(), ".vibyra-agent", "recent-projects.json");
const MAX_RECENTS = 24;

export async function recentProjectPaths(recentsPath = RECENTS_PATH) {
  try {
    const values = JSON.parse(await readFile(recentsPath, "utf8"));
    return Array.isArray(values)
      ? values.filter((value) => typeof value === "string" && value).map((value) => resolve(value)).slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

export async function rememberRecentProject(path, recentsPath = RECENTS_PATH) {
  const projectPath = resolve(String(path || ""));
  const next = [projectPath, ...(await recentProjectPaths(recentsPath)).filter((value) => value !== projectPath)].slice(0, MAX_RECENTS);
  const temporaryPath = `${recentsPath}.${process.pid}.tmp`;
  await mkdir(dirname(recentsPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, recentsPath);
  return next;
}
