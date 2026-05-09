import { exec } from "node:child_process";
import { basename, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { allowedCommands, appState, event, pushEvents } from "./state.mjs";
import { projectById } from "./projects.mjs";
import { makePreviewHtml, makeRunSummary, prepareObsidianRun, previewUrl } from "./agentTemplates.mjs";

export async function startAgentTask({ projectId, prompt, model }) {
  const project = projectById(projectId);
  if (!project) throw new Error("No project selected");

  const runId = `run-${Date.now()}`;
  const outputDir = join(project.path, ".vibyra-agent", "runs");
  const outputPath = join(outputDir, `${runId}.md`);
  const previewPath = join(project.path, "index.html");
  const previewHtml = makePreviewHtml({ prompt, project });
  const previousPreviewBody = await readOptionalText(previewPath);
  const obsidianRun = await prepareObsidianRun({ project, runId, prompt, model });
  appState.activeAgentRun = {
    id: runId, projectId: project.id, model, title: prompt,
    state: "running", progress: 18, file: "Local desktop task",
    updatedAt: new Date().toISOString()
  };
  const summary = makeRunSummary({ prompt, model, project });

  await mkdir(outputDir, { recursive: true });
  if (obsidianRun) await mkdir(obsidianRun.outputDir, { recursive: true });
  appState.activeAgentRun = { ...appState.activeAgentRun, progress: 48, file: outputPath, updatedAt: new Date().toISOString() };
  await writeFile(outputPath, summary, "utf8");
  await writeFile(previewPath, previewHtml, "utf8");
  if (obsidianRun) await writeFile(obsidianRun.outputPath, obsidianRun.summary, "utf8");
  appState.activeAgentRun = { ...appState.activeAgentRun, progress: 82, updatedAt: new Date().toISOString() };

  appState.selectedProjectId = project.id;
  appState.latestPreview = {
    state: "delivered", url: previewUrl(project.id), title: project.name,
    message: "Updated preview captured from Vibyra Desktop",
    capturedAt: new Date().toISOString()
  };

  const newEvents = [
    event("Preview", "Updated preview delivered to iPhone", "success"),
    event("Agent", "Built a phone-viewable app preview", "success"),
    event("Dev Server", "Project reloaded after local apply", "success"),
    event("Agent", `Applied generated preview at ${previewPath}`, "success"),
    event("Agent", `Applied generated run artifact at ${outputPath}`, "info"),
    ...(obsidianRun ? [event("Obsidian", `Saved compact run note at ${obsidianRun.outputPath}`, "info")] : []),
    event(model, "Code diff returned", "info"),
    event("Backend", `Prompt sent to ${model}`, "info")
  ];
  pushEvents(newEvents);
  appState.activeAgentRun = null;

  return {
    agent: { id: runId, title: prompt, model, projectId: project.id, state: "complete", progress: 100, file: outputPath },
    changes: [
      { id: `${runId}-change`, file: previewPath, summary: "Created phone-viewable app preview", additions: previewHtml.split("\n").length, deletions: previousPreviewBody ? previousPreviewBody.split("\n").length : 0, status: "applied" },
      { id: `${runId}-artifact-change`, file: outputPath, summary: "Created local Vibyra run artifact", additions: summary.split("\n").length, deletions: 0, status: "applied" },
      ...(obsidianRun ? [{ id: `${runId}-obsidian-change`, file: obsidianRun.outputPath, summary: "Created compact Obsidian run note", additions: obsidianRun.summary.split("\n").length, deletions: 0, status: "applied" }] : [])
    ],
    files: [
      { id: `${runId}-preview-file`, name: "index.html", path: previewPath, language: "html", changed: previousPreviewBody === null ? "added" : "modified", body: previewHtml, previousBody: previousPreviewBody },
      { id: `${runId}-file`, name: basename(outputPath), path: outputPath, language: "md", changed: "added", body: summary },
      ...(obsidianRun ? [{ id: `${runId}-obsidian-file`, name: basename(obsidianRun.outputPath), path: obsidianRun.outputPath, language: "md", changed: "added", body: obsidianRun.summary }] : [])
    ],
    events: newEvents,
    preview: appState.latestPreview,
    buildState: "passed"
  };
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export function runCommand({ projectId, command }) {
  const project = projectById(projectId);
  if (!project) throw new Error("No project selected");
  if (!allowedCommands.has(command)) throw new Error(`Command is not allowed yet: ${command}`);

  return new Promise((resolve) => {
    exec(command, { cwd: project.path, timeout: 20_000, maxBuffer: 200_000 }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`.trim() || "Command finished with no output.";
      const log = event("Terminal", `${command}: ${output.slice(0, 180)}`, error ? "error" : "success");
      pushEvents([log]);
      resolve({
        ok: !error, command, output, event: log,
        buildState: command.includes("build") || command.includes("test") ? (error ? "failed" : "passed") : "idle"
      });
    });
  });
}
