import { basename, dirname, extname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { putAgentRun, removeAgentRun, updateAgentRun } from "./agentRunState.mjs";
import { readOptionalText, safeProjectPath } from "./agentGeneratedFiles.mjs";
import { resolvedPreviewUrl } from "./preview.mjs";
import { appState, event, pushEvents } from "./state.mjs";

export function makeAgentApplyPlan({
  runId,
  project,
  prompt,
  model,
  outputDir,
  outputPath,
  generatedFiles,
  obsidianRun,
  summary,
  responseText,
  requestHost = ""
}) {
  const editChanges = generatedFiles.map((file, index) => ({
    id: `${runId}-change-${index}`,
    file: file.path,
    summary: file.previousBody === null ? "Create generated file" : "Replace generated file",
    additions: file.content.split("\n").length,
    deletions: file.previousBody === null ? 0 : file.previousBody.split("\n").length,
    status: "pending"
  }));
  const changes = [
    ...editChanges,
    { id: `${runId}-artifact-change`, file: outputPath, summary: "Create local Vibyra run artifact", additions: summary.split("\n").length, deletions: 0, status: "pending" },
    ...(obsidianRun ? [{ id: `${runId}-obsidian-change`, file: obsidianRun.outputPath, summary: "Create compact Obsidian run note", additions: obsidianRun.summary.split("\n").length, deletions: 0, status: "pending" }] : [])
  ];
  const files = [
    ...generatedFiles.map((file, index) => ({
      id: `${runId}-file-${index}`,
      name: basename(file.path),
      path: file.path,
      language: languageFor(file.path),
      changed: file.previousBody === null ? "added" : "modified",
      body: file.content,
      previousBody: file.previousBody
    })),
    { id: `${runId}-file`, name: basename(outputPath), path: outputPath, language: "md", changed: "added", body: summary, previousBody: null },
    ...(obsidianRun ? [{ id: `${runId}-obsidian-file`, name: basename(obsidianRun.outputPath), path: obsidianRun.outputPath, language: "md", changed: "added", body: obsidianRun.summary, previousBody: null }] : [])
  ];
  return { runId, project, prompt, model, outputDir, outputPath, generatedFiles, obsidianRun, summary, responseText, requestHost, changes, files, visibleEditCount: editChanges.length };
}

export async function applyAgentPlan(plan) {
  const { runId, project, prompt, model, outputDir, outputPath, generatedFiles, obsidianRun, summary } = plan;
  updateAgentRun(appState, runId, { state: "applying", progress: 48, file: outputPath, error: null }) ?? putAgentRun(appState, {
    id: runId, projectId: project.id, projectName: project.name, model, title: prompt, state: "applying", progress: 48, file: outputPath
  });

  await mkdir(outputDir, { recursive: true });
  if (obsidianRun) await mkdir(obsidianRun.outputDir, { recursive: true });
  await assertGeneratedFilesUnchanged(project, generatedFiles);
  for (const file of generatedFiles) {
    const fullPath = await safeProjectPath(project, file.path, { mustExist: false });
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }
  await writeFile(outputPath, summary, "utf8");
  if (obsidianRun) await writeFile(obsidianRun.outputPath, obsidianRun.summary, "utf8");
  updateAgentRun(appState, runId, { progress: 82 });

  appState.selectedProjectId = project.id;
  appState.latestPreview = await previewPayloadForProject(project, plan.requestHost);
  const newEvents = [
    event("Preview", appState.latestPreview.url ? "Updated preview delivered to iPhone" : "No runnable browser preview found for this project yet", appState.latestPreview.url ? "success" : "warning"),
    event("Agent", generatedFiles.length ? `Applied ${generatedFiles.length} generated file edit(s)` : "Saved agent trace without file edits", generatedFiles.length ? "success" : "info"),
    event("Dev Server", "Project reloaded after local apply", "success"),
    event("Agent", `Applied generated run artifact at ${outputPath}`, "info"),
    ...(obsidianRun ? [event("Obsidian", `Saved compact run note at ${obsidianRun.outputPath}`, "info")] : []),
    event(model, "Code diff returned", "info"),
    event("Backend", `Prompt sent to ${model}`, "info")
  ];
  delete appState.pendingAgentApplies[runId];
  removeAgentRun(appState, runId);
  pushEvents(newEvents);

  return {
    agent: { id: runId, title: prompt, model, projectId: project.id, state: "complete", progress: 100, file: outputPath },
    changes: plan.changes.map((change) => ({ ...change, status: "applied" })),
    files: plan.files,
    reply: agentReply(plan),
    events: newEvents,
    preview: appState.latestPreview,
    buildState: "passed"
  };
}

export function agentResultFromPlan(plan, status, events) {
  return {
    agent: { id: plan.runId, title: plan.prompt, model: plan.model, projectId: plan.project.id, state: status === "pending" ? "waiting" : "complete", progress: status === "pending" ? 92 : 100, file: status === "pending" ? "Awaiting edit permission" : plan.outputPath },
    changes: plan.changes.map((change) => ({ ...change, status })),
    files: plan.files,
    reply: status === "pending" ? `${agentReply(plan)}\n\nVibyra is waiting for your permission before editing files on this computer.` : agentReply(plan),
    events,
    preview: { state: "live", url: null, title: plan.project.name },
    buildState: "idle",
    pendingApplyId: status === "pending" ? plan.runId : undefined
  };
}

export function noEditAgentResult(plan, events) {
  return {
    agent: { id: plan.runId, title: plan.prompt, model: plan.model, projectId: plan.project.id, state: "complete", progress: 100, file: "No file edits returned" },
    changes: [],
    files: [],
    reply: `I inspected the local workspace, but the model did not return valid file edits.\n\n${String(plan.responseText ?? "").slice(0, 2400)}`,
    events,
    preview: { state: "live", url: null, title: plan.project.name },
    buildState: "idle"
  };
}

export function makeRunSummary({ prompt, model, project, responseText, generatedFiles }) {
  return [
    "# Vibyra Agent Run", "",
    `Prompt: ${prompt}`,
    `Model: ${model}`,
    `Project: ${project.name}`,
    `Created: ${new Date().toISOString()}`, "",
    "## Generated files", "",
    generatedFiles.length ? generatedFiles.map((file) => `- ${file.path}`).join("\n") : "No file edits were returned.", "",
    "## OpenRouter response", "",
    responseText
  ].join("\n");
}

async function assertGeneratedFilesUnchanged(project, generatedFiles) {
  for (const file of generatedFiles) {
    const fullPath = await safeProjectPath(project, file.path, { mustExist: false });
    const current = await readOptionalText(fullPath);
    if (file.previousBody === null && current !== null) {
      throw new Error(`Cannot apply pending edits because ${file.path} was created after the AI run. Discard this run and ask Vibyra to regenerate the change.`);
    }
    if (file.previousBody !== null && current !== file.previousBody) {
      throw new Error(`Cannot apply pending edits because ${file.path} changed after the AI run. Discard this run and ask Vibyra to regenerate the change.`);
    }
  }
}

async function previewPayloadForProject(project, requestHost) {
  const url = await resolvedPreviewUrl(project, requestHost);
  return {
    state: url ? "delivered" : "live",
    url,
    title: project.name,
    message: url ? "Updated preview captured from Vibyra Desktop" : "No runnable browser preview found for this project yet.",
    capturedAt: new Date().toISOString()
  };
}

function agentReply(plan) {
  if (plan.visibleEditCount > 0) {
    return `I prepared ${plan.visibleEditCount} local file edit${plan.visibleEditCount === 1 ? "" : "s"} for ${plan.project.name}. Review the changes below.`;
  }
  return "I inspected the local workspace, but the model did not return valid file edits. The run trace is available below.";
}

function languageFor(filePath) {
  const ext = extname(filePath).toLowerCase().replace(/^\./, "");
  return ext === "md" ? "markdown" : ext === "yml" ? "yaml" : ext || "txt";
}
