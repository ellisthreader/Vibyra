import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RUNTIME_APP_DIRECTORIES, WEB_APP_DIRECTORIES } from "./projectAppRoots.mjs";

const MANIFEST_ROOTS = Array.from(new Set(["", ...WEB_APP_DIRECTORIES, ...RUNTIME_APP_DIRECTORIES]));

export async function previewUnavailableReason(project) {
  const root = String(project?.path || "").trim();
  if (!root) return "Vibyra could not inspect this project because its folder path is unavailable.";

  const packages = await packageSummaries(root);
  const withScripts = packages.find((item) => item.scripts.length > 0);
  if (withScripts) {
    return `Vibyra found package scripts (${withScripts.scripts.join(", ")}) in ${displayRoot(withScripts.directory)}, but none is a recognized web dev script that starts a browser server. Add a standard web, dev, start, serve, preview, or develop script that starts an HTTP app.`;
  }
  if (packages.length > 0) {
    return `Vibyra found package.json in ${displayRoot(packages[0].directory)}, but it has no runnable scripts or built browser entry yet. Add a web app entry and a web/dev/start script, then try Preview again.`;
  }

  if (await hasAny(root, ["requirements.txt", "pyproject.toml", "assistant/requirements.txt"])) {
    return "Vibyra detected a Python project, but not a supported Django, FastAPI, or Flask browser server. Command-line, audio, and background Python apps need a web UI before they can run in Test.";
  }
  if (await hasAny(root, ["Cargo.toml", "go.mod", "mix.exs", "pom.xml", "build.gradle", "build.gradle.kts"])) {
    return "Vibyra detected an application runtime, but no browser entry or approved HTTP launch command. Add a web server or web export for this project, then try Preview again.";
  }
  return "Vibyra could not find a browser entry or approved local web runtime. Add a built index.html, a standard web start script, or a supported web export.";
}

async function packageSummaries(root) {
  const summaries = [];
  for (const directory of MANIFEST_ROOTS) {
    try {
      const text = await readFile(resolve(root, directory, "package.json"), "utf8");
      const pkg = JSON.parse(text);
      const scripts = Object.keys(pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {});
      summaries.push({ directory, scripts });
    } catch {}
  }
  return summaries;
}

async function hasAny(root, names) {
  for (const name of names) {
    try {
      await access(resolve(root, name));
      return true;
    } catch {}
  }
  return false;
}

function displayRoot(directory) {
  return directory ? `${directory}/` : "the project root";
}
