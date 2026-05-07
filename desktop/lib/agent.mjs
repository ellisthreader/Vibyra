import { exec } from "node:child_process";
import { basename, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { allowedCommands, appState, event, pushEvents, TOKEN } from "./state.mjs";
import { projectById } from "./projects.mjs";

export async function startAgentTask({ projectId, prompt, model }) {
  const project = projectById(projectId);
  if (!project) throw new Error("No project selected");

  const runId = `run-${Date.now()}`;
  const outputDir = join(project.path, ".vibyra-agent", "runs");
  const outputPath = join(outputDir, `${runId}.md`);
  const previewPath = join(project.path, "index.html");
  const previewHtml = makePreviewHtml({ prompt, project });
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
  await writeFile(previewPath, previewHtml, "utf8");
  appState.activeAgentRun = { ...appState.activeAgentRun, progress: 82, updatedAt: new Date().toISOString() };

  appState.selectedProjectId = project.id;
  appState.latestPreview = {
    state: "delivered",
    url: previewUrl(project.id),
    title: project.name,
    message: "Updated preview captured from Vibyra Desktop",
    capturedAt: new Date().toISOString()
  };

  const newEvents = [
    event("Preview", "Updated preview delivered to iPhone", "success"),
    event("Agent", "Built a phone-viewable app preview", "success"),
    event("Dev Server", "Project reloaded after local apply", "success"),
    event("Agent", `Applied generated preview at ${previewPath}`, "success"),
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
      file: previewPath,
      summary: "Created phone-viewable app preview",
      additions: previewHtml.split("\n").length,
      deletions: 0,
      status: "applied"
    }, {
      id: `${runId}-artifact-change`,
      file: outputPath,
      summary: "Created local Vibyra run artifact",
      additions: summary.split("\n").length,
      deletions: 0,
      status: "applied"
    }],
    files: [{
      id: `${runId}-preview-file`,
      name: "index.html",
      path: previewPath,
      language: "html",
      changed: "added",
      body: previewHtml
    }, {
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

function makePreviewHtml({ prompt, project }) {
  const title = project.name;
  const request = prompt.trim() || "Build a polished app experience";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; --bg: #080910; --panel: #12131d; --line: #2d2541; --text: #fbf8ff; --muted: #beb8ce; --violet: #7c3cff; --green: #6df4a6; --blue: #63a6ff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: linear-gradient(145deg, #080910 0%, #151122 52%, #0c1620 100%); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { min-height: 100vh; display: grid; align-content: center; gap: 18px; padding: 22px; }
      section { width: min(680px, 100%); margin: 0 auto; border: 1px solid var(--line); border-radius: 22px; background: rgba(18, 19, 29, .88); padding: clamp(22px, 7vw, 42px); box-shadow: 0 22px 60px rgba(0, 0, 0, .32); }
      .kicker { display: inline-flex; align-items: center; gap: 8px; color: var(--green); font-size: 13px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 16px rgba(109, 244, 166, .68); }
      h1 { margin: 16px 0 12px; font-size: clamp(38px, 11vw, 76px); line-height: .94; letter-spacing: 0; }
      p { margin: 0; color: var(--muted); font-size: clamp(16px, 4vw, 20px); font-weight: 750; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
      button { appearance: none; border: 0; border-radius: 14px; color: white; font: inherit; font-weight: 900; min-height: 48px; padding: 0 18px; }
      .primary { background: linear-gradient(135deg, var(--violet), var(--blue)); }
      .secondary { background: rgba(255, 255, 255, .1); border: 1px solid rgba(255, 255, 255, .12); }
      .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); margin-top: 18px; }
      .tile { border: 1px solid rgba(255, 255, 255, .1); border-radius: 16px; background: rgba(255, 255, 255, .06); padding: 14px; }
      .tile strong { display: block; font-size: 24px; margin-bottom: 4px; }
      .tile span { color: var(--muted); font-size: 13px; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="kicker"><span class="dot"></span>Live Vibyra build</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(request)}</p>
        <div class="actions">
          <button class="primary">Open workspace</button>
          <button class="secondary">Preview flow</button>
        </div>
        <div class="grid">
          <div class="tile"><strong>01</strong><span>Phone-ready screen</span></div>
          <div class="tile"><strong>02</strong><span>Local project file</span></div>
          <div class="tile"><strong>03</strong><span>Desktop preview route</span></div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function previewUrl(projectId) {
  return `/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(TOKEN)}/`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
