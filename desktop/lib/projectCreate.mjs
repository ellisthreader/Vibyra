import { homedir } from "node:os";
import { basename, join } from "node:path";
import { mkdir, open, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { appState } from "./state.mjs";
import { isDirectory, projectFromPath } from "./projectInfo.mjs";

export async function createDesktopProject(name = "Untitled Workspace", options = {}) {
  const root = options.rootPath || join(homedir(), "Desktop", "Vibyra Projects");
  await mkdir(root, { recursive: true });
  const releaseLock = await acquireProjectCreateLock(root);

  try {
    const limit = boundedProjectLimit(options.maxActiveProjects);
    const active = await managedProjectCount(root);
    if (active >= limit) {
      throw entitlementError(
        `Your Vibyra plan supports ${limit} active project${limit === 1 ? "" : "s"}. Upgrade or remove a Vibyra project before creating another.`
      );
    }
    const baseName = sanitizeProjectName(name);
    const projectPath = await uniqueProjectPath(root, baseName);
    await mkdir(projectPath, { recursive: true });
    await writeFile(
      join(projectPath, "package.json"),
      `${JSON.stringify({ private: true, name: packageName(basename(projectPath)), version: "0.1.0" }, null, 2)}\n`,
      { flag: "wx" }
    );
    await writeFile(join(projectPath, "README.md"), `# ${basename(projectPath)}\n\nCreated from Vibyra mobile.\n`, { flag: "wx" });

    const project = await projectFromPath(projectPath);
    if (!project) throw new Error("Could not create project");
    appState.cachedProjects = [project, ...appState.cachedProjects.filter((item) => item.id !== project.id)].slice(0, 12);
    return project;
  } finally {
    await releaseLock();
  }
}

async function uniqueProjectPath(root, baseName) {
  let candidate = join(root, baseName);
  let suffix = 2;
  while (await isDirectory(candidate)) {
    candidate = join(root, `${baseName}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

function sanitizeProjectName(name) {
  const cleaned = String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "Untitled Workspace";
}

function packageName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vibyra-workspace";
}

async function managedProjectCount(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).length;
}

async function acquireProjectCreateLock(root) {
  const lockPath = join(root, ".vibyra-project-create.lock");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      return async () => {
        await handle.close();
        await unlink(lockPath).catch(() => {});
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const stale = await stat(lockPath)
        .then((entry) => Date.now() - entry.mtimeMs > 30_000)
        .catch(() => false);
      if (stale) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  const error = new Error("Another Vibyra project is still being created. Try again.");
  error.status = 409;
  error.code = "project_create_busy";
  throw error;
}

function boundedProjectLimit(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 12;
}

function entitlementError(message) {
  const error = new Error(message);
  error.status = 403;
  error.code = "membership_project_limit";
  return error;
}
