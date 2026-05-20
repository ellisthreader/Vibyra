import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { allowedCommands, appState, event, pushEvents } from "./state.mjs";
import { agentResultFromPlan, applyAgentPlan, makeAgentApplyPlan, makeRunSummary, noEditAgentResult } from "./agentApply.mjs";
import { assertCanStartAgentRun, putAgentRun, removeAgentRun, updateAgentRun } from "./agentRunState.mjs";
import { openRouterConfigPaths, parseEnvConfigValue } from "./agentConfig.mjs";
import { extractGeneratedFiles, normalizeGeneratedFiles } from "./agentGeneratedFiles.mjs";
import { generateAgentResponse } from "./agentPrompting.mjs";
import { projectById } from "./projects.mjs";
import { isDirectory, projectFromPath } from "./projectInfo.mjs";
import { prepareObsidianRun } from "./agentTemplates.mjs";

export { openRouterConfigPaths, parseEnvConfigValue };

export async function startAgentTask({
  projectId,
  projectPath,
  prompt = "",
  model = "gpt-5.4-mini",
  reasoningEffort = "medium",
  apply = false,
  projectFiles = [],
  selectedFile = null,
  history = [],
  requestHost = ""
}) {
  const project = await resolveAgentProject(projectId, projectPath);
  if (!project) throw new Error("No project selected");
  assertCanStartAgentRun(appState);
  if (pendingApplyForProject(project.id)) throw new Error("Generated edits are already waiting for approval in this project. Apply or discard them before starting another AI run.");
  const request = String(prompt ?? "").trim();
  if (request.length < 3) throw new Error("Enter a prompt before starting the desktop AI agent.");

  const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outputDir = join(project.path, ".vibyra-agent", "runs");
  const outputPath = join(outputDir, `${runId}.md`);
  const modelKey = normalizeModel(model);
  const effort = normalizeReasoningEffort(reasoningEffort);

  putAgentRun(appState, {
    id: runId,
    projectId: project.id,
    projectName: project.name,
    model: modelKey,
    title: request,
    state: "running",
    progress: 18,
    file: "Reading workspace context"
  });
  pushEvents([event("Agent", "Reading workspace files before editing", "info")]);

  try {
    const responseText = await generateAgentResponse({ project, prompt: request, model: modelKey, reasoningEffort: effort, projectFiles, selectedFile, history, runId });
    const generatedFiles = await normalizeGeneratedFiles(project, extractGeneratedFiles(responseText));
    const obsidianRun = await prepareObsidianRun({ project, runId, prompt: request, model: modelKey });
    const summary = makeRunSummary({ prompt: request, model: modelKey, project, responseText, generatedFiles });
    const plan = makeAgentApplyPlan({ runId, project, prompt: request, model: modelKey, outputDir, outputPath, generatedFiles, obsidianRun, summary, responseText, requestHost });

    updateAgentRun(appState, runId, { progress: 92, file: generatedFiles.length ? "Reviewing generated edits" : "No file edits returned" });
    if (generatedFiles.length === 0) return completeNoEditRun(runId, modelKey, plan);
    if (!apply) return queueAgentApply(project.id, runId, modelKey, plan);
    return await applyAgentPlan(plan);
  } catch (error) {
    removeAgentRun(appState, runId);
    pushEvents([event("Agent", error instanceof Error ? error.message : "Desktop agent failed", "error")]);
    throw error;
  }
}

export async function applyAgentTask({ runId, requestHost = "" }) {
  const plan = appState.pendingAgentApplies?.[runId];
  if (!plan) throw new Error("No pending agent edits found");
  try {
    return await applyAgentPlan({ ...plan, requestHost: requestHost || plan.requestHost });
  } catch (error) {
    updateAgentRun(appState, runId, { state: "waiting", progress: 92, file: "Apply failed", error: error instanceof Error ? error.message : "Apply failed" });
    throw error;
  }
}

export function discardAgentTask({ runId }) {
  if (!runId || !appState.pendingAgentApplies?.[runId]) return { ok: true };
  delete appState.pendingAgentApplies[runId];
  removeAgentRun(appState, runId);
  const log = event("Agent", "Discarded pending edits before applying them", "info");
  pushEvents([log]);
  return { ok: true, events: [log] };
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
      resolve({ ok: !error, command, output, event: log, buildState: command.includes("build") || command.includes("test") ? (error ? "failed" : "passed") : "idle" });
    });
  });
}

async function resolveAgentProject(projectId, projectPath) {
  const project = projectById(projectId);
  if (project) return project;
  if (!projectPath || !(await isDirectory(String(projectPath)))) return null;
  return await projectFromPath(String(projectPath));
}

function queueAgentApply(projectId, runId, modelKey, plan) {
  if (pendingApplyForProject(projectId)) throw new Error("Generated edits are already waiting for approval in this project. Apply or discard them before starting another AI run.");
  appState.pendingAgentApplies[runId] = plan;
  updateAgentRun(appState, runId, { state: "waiting", progress: 92, file: "Awaiting edit permission", pendingApplyId: runId });
  const events = [event("Agent", `Prepared ${plan.visibleEditCount} generated file edit(s) for approval`, "warning"), event(modelKey, "OpenRouter response ready", "info")];
  pushEvents(events);
  return agentResultFromPlan(plan, "pending", events);
}

function completeNoEditRun(runId, modelKey, plan) {
  removeAgentRun(appState, runId);
  const events = [event("Agent", "No valid file edits were returned; no local files were changed", "warning"), event(modelKey, "OpenRouter response ready", "info")];
  pushEvents(events);
  return noEditAgentResult(plan, events);
}

function pendingApplyForProject(projectId) {
  return Object.values(appState.pendingAgentApplies ?? {}).find((plan) => plan?.project?.id === projectId) ?? null;
}

function normalizeModel(model) {
  return String(model || "gpt-5.4-mini");
}

function normalizeReasoningEffort(value) {
  return ["none", "low", "medium", "high", "xhigh"].includes(value) ? value : "medium";
}
