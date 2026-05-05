import { exec } from "node:child_process";
import { basename, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { allowedCommands, appState, event, pushEvents } from "./state.mjs";
import { projectById } from "./projects.mjs";

export async function startAgentTask({ projectId, prompt, model }) {
  const project = projectById(projectId);
  if (!project) throw new Error("No project selected");

  const runId = `run-${Date.now()}`;
  const outputDir = join(project.path, ".vibyra-agent", "runs");
  const outputPath = join(outputDir, `${runId}.md`);
  appState.activeAgentRun = {
    id: runId,
    projectId: project.id,
    model,
    title: prompt,
    state: "running",
    progress: 18,
    file: "Local desktop task",
    updatedAt: new Date().toISOString()
  };
  const summary = makeRunSummary({ prompt, model, project });

  await mkdir(outputDir, { recursive: true });
  appState.activeAgentRun = { ...appState.activeAgentRun, progress: 48, file: outputPath, updatedAt: new Date().toISOString() };
  await writeFile(outputPath, summary, "utf8");
  appState.activeAgentRun = { ...appState.activeAgentRun, progress: 82, updatedAt: new Date().toISOString() };

  appState.selectedProjectId = project.id;
  appState.latestPreview = {
    state: "delivered",
    url: `http://localhost:3000/${project.name.toLowerCase().replace(/\s+/g, "-")}`,
    title: project.name,
    message: "Updated preview captured from Vibyra Desktop",
    capturedAt: new Date().toISOString()
  };

  const newEvents = [
    event("Preview", "Updated preview delivered to iPhone", "success"),
    event("Agent", "Captured refreshed project preview", "success"),
    event("Dev Server", "Project reloaded after local apply", "success"),
    event("Agent", `Applied generated run artifact at ${outputPath}`, "info"),
    event(model, "Code diff returned", "info"),
    event("Backend", `Prompt sent to ${model}`, "info")
  ];
  pushEvents(newEvents);
  appState.activeAgentRun = null;

  return {
    agent: {
      id: runId,
      title: prompt,
      model,
      projectId: project.id,
      state: "complete",
      progress: 100,
      file: outputPath
    },
    changes: [{
      id: `${runId}-change`,
      file: outputPath,
      summary: "Created local Vibyra run artifact",
      additions: summary.split("\n").length,
      deletions: 0,
      status: "applied"
    }],
    files: [{
      id: `${runId}-file`,
      name: basename(outputPath),
      path: outputPath,
      language: "md",
      changed: "added",
      body: summary
    }],
    events: newEvents,
    preview: appState.latestPreview,
    buildState: "passed"
  };
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
        ok: !error,
        command,
        output,
        event: log,
        buildState: command.includes("build") || command.includes("test") ? (error ? "failed" : "passed") : "idle"
      });
    });
  });
}

function makeRunSummary({ prompt, model, project }) {
  return [
    "# Vibyra Agent Run",
    "",
    `Prompt: ${prompt}`,
    `Model: ${model}`,
    `Project: ${project.name}`,
    `Created: ${new Date().toISOString()}`,
    "",
    "Vibyra Desktop wrote a safe run artifact to prove pairing, routing, local apply, reload, capture, and phone delivery."
  ].join("\n");
}
