import { exec } from "node:child_process";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { allowedCommands, appState, event, pushEvents } from "./state.mjs";
import { projectById } from "./projects.mjs";
import { isDirectory, projectFromPath } from "./projectInfo.mjs";
import { prepareObsidianRun } from "./agentTemplates.mjs";
import { resolvedPreviewUrl } from "./preview.mjs";
import { promptProjectContext } from "./projectContext.mjs";

const MAX_GENERATED_FILES = 12;
const MAX_FILE_BYTES = 220_000;
const DESKTOP_LIB_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DESKTOP_LIB_DIR, "..", "..");

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
  if (appState.activeAgentRun) throw new Error("An AI task is already running. Wait for it to finish before sending another prompt.");
  const existingPending = pendingApplyForProject(project.id);
  if (existingPending) throw new Error("Generated edits are already waiting for approval in this project. Apply or discard them before starting another AI run.");
  const request = String(prompt ?? "").trim();
  if (request.length < 3) throw new Error("Enter a prompt before starting the desktop AI agent.");

  const runId = `run-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const outputDir = join(project.path, ".vibyra-agent", "runs");
  const outputPath = join(outputDir, `${runId}.md`);
  const modelKey = normalizeModel(model);
  const effort = normalizeReasoningEffort(reasoningEffort);

  appState.activeAgentRun = {
    id: runId,
    projectId: project.id,
    model: modelKey,
    title: request,
    state: "running",
    progress: 18,
    file: "Reading workspace context",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const startEvent = event("Agent", "Reading workspace files before editing", "info");
  pushEvents([startEvent]);

  try {
    const responseText = await generateAgentResponse({
      project,
      prompt: request,
      model: modelKey,
      reasoningEffort: effort,
      projectFiles,
      selectedFile,
      history
    });
    const generatedFiles = await normalizeGeneratedFiles(project, extractGeneratedFiles(responseText));
    const obsidianRun = await prepareObsidianRun({ project, runId, prompt: request, model: modelKey });
    const summary = makeRunSummary({ prompt: request, model: modelKey, project, responseText, generatedFiles });
    const plan = await makeAgentApplyPlan({
      runId,
      project,
      prompt: request,
      model: modelKey,
      outputDir,
      outputPath,
      generatedFiles,
      obsidianRun,
      summary,
      responseText,
      requestHost
    });

    appState.activeAgentRun = { ...appState.activeAgentRun, progress: 92, file: generatedFiles.length ? "Reviewing generated edits" : "No file edits returned", updatedAt: new Date().toISOString() };

    if (generatedFiles.length === 0) {
      appState.activeAgentRun = null;
      const events = [
        event("Agent", "No valid file edits were returned; no local files were changed", "warning"),
        event(modelKey, "OpenRouter response ready", "info")
      ];
      pushEvents(events);
      return noEditAgentResult(plan, events);
    }

    if (!apply) {
      appState.pendingAgentApplies[runId] = plan;
      appState.activeAgentRun = null;
      const events = [
        event("Agent", `Prepared ${generatedFiles.length} generated file edit(s) for approval`, "warning"),
        event(modelKey, "OpenRouter response ready", "info")
      ];
      pushEvents(events);
      return agentResultFromPlan(plan, "pending", events);
    }

    const result = await applyAgentPlan(plan);
    appState.activeAgentRun = null;
    return result;
  } catch (error) {
    appState.activeAgentRun = null;
    const message = error instanceof Error ? error.message : "Desktop agent failed";
    pushEvents([event("Agent", message, "error")]);
    throw error;
  }
}

export async function applyAgentTask({ runId, requestHost = "" }) {
  const plan = appState.pendingAgentApplies?.[runId];
  if (!plan) throw new Error("No pending agent edits found");
  try {
    return await applyAgentPlan({ ...plan, requestHost: requestHost || plan.requestHost });
  } catch (error) {
    appState.activeAgentRun = null;
    throw error;
  }
}

export function discardAgentTask({ runId }) {
  if (!runId || !appState.pendingAgentApplies?.[runId]) return { ok: true };
  delete appState.pendingAgentApplies[runId];
  const log = event("Agent", "Discarded pending edits before applying them", "info");
  pushEvents([log]);
  return { ok: true, events: [log] };
}

function makeAgentApplyPlan({
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
  return {
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
    requestHost,
    changes,
    files,
    visibleEditCount: editChanges.length
  };
}

async function applyAgentPlan(plan) {
  const { runId, project, prompt, model, outputDir, outputPath, generatedFiles, obsidianRun, summary } = plan;
  appState.activeAgentRun = {
    id: runId, projectId: project.id, model, title: prompt,
    state: "running", progress: 48, file: outputPath,
    updatedAt: new Date().toISOString()
  };

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
  appState.activeAgentRun = { ...appState.activeAgentRun, progress: 82, updatedAt: new Date().toISOString() };

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
  pushEvents(newEvents);
  appState.activeAgentRun = null;

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

function pendingApplyForProject(projectId) {
  return Object.values(appState.pendingAgentApplies ?? {}).find((plan) => plan?.project?.id === projectId) ?? null;
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

async function resolveAgentProject(projectId, projectPath) {
  const project = projectById(projectId);
  if (project) return project;
  if (!projectPath || !(await isDirectory(String(projectPath)))) return null;
  return await projectFromPath(String(projectPath));
}

async function generateAgentResponse({ project, prompt, model, reasoningEffort, projectFiles, selectedFile, history }) {
  const apiKey = await openRouterConfigValue("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured for Vibyra Desktop.");

  const instructions = await readProjectInstructions(project.path);
  const desktopContext = await promptProjectContext(project.id, prompt).catch(() => ({ files: [] }));
  const contextFiles = mergeContextFiles(projectFiles, desktopContext.files ?? []);
  const messages = [
    {
      role: "system",
      content: [
        "You are Vibyra, a controlled local coding agent connected to the user's approved desktop workspace.",
        "Inspect the provided project context and return complete file replacements only for files that must change.",
        "For preview HTTP errors, especially Laravel/Inertia 419, verify route, middleware, session, CSRF/XSRF, cookie, redirect, and proxy evidence before choosing files to edit. Treat the active editor file as a hint, not as proof that it is related.",
        "Never write outside the project root. Use relative paths only. Do not include absolute paths, ../ segments, node_modules, vendor, .git, .expo, or .vibyra-agent.",
        "When files should change, return this exact JSON in a fenced json block: {\"files\":[{\"path\":\"relative/path.ext\",\"content\":\"complete file contents\"}]}",
        "If no file edit is needed, return {\"files\":[]} and a short explanation."
      ].join("\n")
    },
    ...historyMessages(history),
    {
      role: "user",
      content: [
        `Project: ${project.name}`,
        `Project path: ${project.path}`,
        instructions ? `Project instructions:\n${instructions}` : "Project instructions: none found at AGENTS.md.",
        `Workspace context:\n${formatContextFiles(contextFiles)}`,
        formatSelectedFile(selectedFile),
        `User request:\n${prompt}`
      ].filter(Boolean).join("\n\n")
    }
  ];

  const payload = {
    model: resolveOpenRouterModel(model),
    messages,
    temperature: 0.2,
    max_completion_tokens: 5000,
    usage: { include: true }
  };
  const reasoning = reasoningPayload(reasoningEffort);
  if (reasoning) payload.reasoning = reasoning;

  appState.activeAgentRun = { ...appState.activeAgentRun, progress: 54, file: "Generating file edits", updatedAt: new Date().toISOString() };
  const response = await fetch(await openRouterConfigValue("OPENROUTER_API_URL") || "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Vibyra Desktop Agent"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${response.status}): ${text.slice(0, 400) || response.statusText}`);
  }

  const data = await response.json();
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  return content || "{\"files\":[]}\n\nOpenRouter returned no text.";
}

export async function openRouterConfigValue(key) {
  if (process.env[key]) return process.env[key];
  for (const path of openRouterConfigPaths()) {
    const body = await readOptionalText(path);
    const value = parseEnvConfigValue(body, key);
    if (value) return value;
  }
  return "";
}

export function openRouterConfigPaths(cwd = process.cwd(), repoRoot = REPO_ROOT) {
  return uniquePaths([
    join(cwd, "backend", ".env"),
    join(cwd, ".env"),
    join(repoRoot, "backend", ".env"),
    join(repoRoot, ".env")
  ]);
}

export function parseEnvConfigValue(body, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(body ?? "").match(new RegExp(`^\\s*(?:export\\s+)?${escapedKey}\\s*=\\s*([^\\r\\n]*)`, "m"));
  if (!match) return "";
  const raw = match[1].trim();
  const quoted = raw.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) return quoted[2].trim();
  return raw.replace(/\s+#.*$/, "").trim();
}

function uniquePaths(paths) {
  return [...new Set(paths.map((path) => resolve(path)))];
}

function extractGeneratedFiles(responseText) {
  const fenced = responseText.match(/```json\s*([\s\S]*?)```/i)?.[1];
  return filesFromJson(fenced ?? responseText);
}

function filesFromJson(payload) {
  const text = String(payload ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const decoded = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(decoded.files) ? decoded.files : [];
  } catch {
    return [];
  }
}

async function normalizeGeneratedFiles(project, files) {
  const normalized = [];
  for (const file of files.slice(0, MAX_GENERATED_FILES)) {
    const path = safeRelativePath(file?.path);
    const content = typeof file?.content === "string" ? file.content : "";
    if (!path || !content || Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) continue;
    const fullPath = await safeProjectPath(project, path, { mustExist: false });
    const previousBody = await readOptionalText(fullPath);
    normalized.push({ path, content: content.endsWith("\n") ? content : `${content}\n`, previousBody });
  }
  return normalized;
}

function safeRelativePath(path) {
  const value = String(path ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!value || isAbsolute(value)) return null;
  const segments = value.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) return null;
  if (segments.some((segment) => [".git", ".expo", ".vibyra-agent", "node_modules", "vendor"].includes(segment))) return null;
  return segments.join("/");
}

async function safeProjectPath(project, relativePath, { mustExist }) {
  const root = resolve(project.path);
  const safePath = safeRelativePath(relativePath);
  if (!safePath) throw new Error("Generated file path must stay inside the selected project.");
  const fullPath = resolve(root, safePath);
  const fromRoot = relative(root, fullPath);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("Generated file path must stay inside the selected project.");
  }
  if (mustExist) await stat(fullPath);
  return fullPath;
}

async function readProjectInstructions(projectPath) {
  const paths = [join(projectPath, "AGENTS.md"), join(projectPath, ".agents", "AGENTS.md")];
  const blocks = [];
  for (const path of paths) {
    const body = await readOptionalText(path);
    if (body) blocks.push(`${relative(projectPath, path)}:\n${body.slice(0, 6000)}`);
  }
  return blocks.join("\n\n").slice(0, 9000);
}

function mergeContextFiles(...groups) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      if (!item?.path || seen.has(item.path)) continue;
      seen.add(item.path);
      merged.push(item);
      if (merged.length >= 120) return merged;
    }
  }
  return merged;
}

function formatContextFiles(files) {
  if (!files.length) return "No file context was returned by the desktop context search.";
  return files.slice(0, 120).map((file) => {
    const meta = [file.language, file.loaded ? "loaded" : ""].filter(Boolean).join(" ");
    return [`- ${file.path}${meta ? ` (${meta})` : ""}`, file.snippet ? indent(String(file.snippet).slice(0, 1600)) : ""].filter(Boolean).join("\n");
  }).join("\n");
}

function formatSelectedFile(file) {
  if (!file?.path || !file?.body) return "";
  return `Active editor hint ${file.path} (verify it is relevant before editing):\n${String(file.body).slice(0, 12000)}`;
}

function historyMessages(history) {
  return (Array.isArray(history) ? history : []).slice(-4).map((item) => {
    const role = item?.role === "assistant" ? "assistant" : "user";
    return { role, content: String(item?.text ?? "").slice(0, 1600) };
  }).filter((item) => item.content.trim());
}

function makeRunSummary({ prompt, model, project, responseText, generatedFiles }) {
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

function agentResultFromPlan(plan, status, events) {
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

function noEditAgentResult(plan, events) {
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

function normalizeModel(model) {
  return String(model || "gpt-5.4-mini");
}

function normalizeReasoningEffort(value) {
  return ["none", "low", "medium", "high", "xhigh"].includes(value) ? value : "medium";
}

function reasoningPayload(effort) {
  if (effort === "none") return { exclude: true };
  if (effort === "xhigh") return { effort: "high", max_tokens: 12000 };
  return { effort };
}

function resolveOpenRouterModel(model) {
  if (String(model).includes("/")) return model;
  return {
    auto: "openai/gpt-4o-mini",
    "gpt-5.5": "openai/gpt-4o",
    "gpt-5.4": "openai/gpt-4o",
    "gpt-5.4-mini": "openai/gpt-4o-mini",
    "gpt-5.4-nano": "openai/gpt-4o-mini",
    "gpt-5-codex": "openai/gpt-4.1",
    "claude-opus-4": "anthropic/claude-opus-4",
    "claude-sonnet-4": "anthropic/claude-sonnet-4",
    "claude-3-5-haiku": "anthropic/claude-3.5-haiku",
    "gemini-2.5-pro": "google/gemini-2.5-pro",
    "gemini-2.5-flash": "google/gemini-2.5-flash",
    "gemini-2.0-flash": "google/gemini-2.0-flash-001"
  }[model] ?? "openai/gpt-4o-mini";
}

function languageFor(filePath) {
  const ext = extname(filePath).toLowerCase().replace(/^\./, "");
  return ext === "md" ? "markdown" : ext === "yml" ? "yaml" : ext || "txt";
}

function indent(value) {
  return value.split(/\r\n|\r|\n/).map((line) => `  ${line}`).join("\n");
}
