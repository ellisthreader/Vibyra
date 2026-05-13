import { homedir } from "node:os";
import { basename, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { appState } from "./state.mjs";
import { isDirectory, projectFromPath } from "./projectInfo.mjs";

export async function createDesktopProject(name = "Untitled Workspace") {
  const root = join(homedir(), "Desktop", "Vibyra Projects");
  await mkdir(root, { recursive: true });

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
