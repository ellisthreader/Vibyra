import { join, relative } from "node:path";
import { updateAgentRun } from "./agentRunState.mjs";
import { openRouterConfigValue } from "./agentConfig.mjs";
import { readOptionalText } from "./agentGeneratedFiles.mjs";
import { diagnosePreviewRepairPrompt } from "./previewErrorDiagnostics.mjs";
import { promptProjectContext } from "./projectContext.mjs";
import { appState } from "./state.mjs";

export async function generateAgentResponse({ project, prompt, model, reasoningEffort, projectFiles, selectedFile, history, runId }) {
  if (String(process.env.VIBYRA_ALLOW_UNMETERED_DESKTOP_AGENT || "").toLowerCase() !== "true") {
    throw new Error("This legacy company-funded agent is disabled. Use a Vibyra-token terminal or your own AI account.");
  }
  const apiKey = await openRouterConfigValue("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured for Vibyra Desktop.");

  const instructions = await readProjectInstructions(project.path);
  const previewDiagnosis = await diagnosePreviewRepairPrompt(project, prompt).catch(() => null);
  const contextQuery = previewDiagnosis?.contextQuery || prompt;
  const desktopContext = await promptProjectContext(project.id, contextQuery).catch(() => ({ files: [] }));
  const contextFiles = mergeContextFiles(previewDiagnosis?.files ?? [], projectFiles, desktopContext.files ?? []);
  const messages = [
    {
      role: "system",
      content: [
        "You are Vibyra, a controlled local coding agent connected to the user's approved desktop workspace.",
        "Inspect the provided project context and return complete file replacements only for files that must change.",
        "Before editing after a preview crash, classify the concrete error from diagnostics. For Vite import/dependency errors, inspect package.json and all matching source imports, then fix that dependency/API mismatch as one class of problem.",
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
        previewDiagnosis?.summary ? `Deterministic preview diagnosis:\n${previewDiagnosis.summary}` : "",
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

  updateAgentRun(appState, runId, { progress: 54, file: "Generating file edits" });
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

function historyMessages(history) {
  return (Array.isArray(history) ? history : []).slice(-4).map((item) => {
    const role = item?.role === "assistant" ? "assistant" : "user";
    return { role, content: String(item?.text ?? "").slice(0, 1600) };
  }).filter((item) => item.content.trim());
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

function reasoningPayload(effort) {
  if (effort === "default") return null;
  if (effort === "none") return { exclude: true };
  return { effort };
}

function resolveOpenRouterModel(model) {
  if (String(model).includes("/")) return model;
  return {
    auto: "openai/gpt-4o-mini",
    "gpt-5.5": "openai/gpt-5.5",
    "gpt-5.4": "openai/gpt-5.4",
    "gpt-5.4-mini": "openai/gpt-5.4-mini",
    "gpt-5.4-nano": "openai/gpt-5.4-nano",
    "gpt-5-codex": "openai/gpt-4.1",
    "claude-opus-4": "anthropic/claude-opus-4.8",
    "claude-sonnet-4": "anthropic/claude-sonnet-4.6",
    "claude-3-5-haiku": "anthropic/claude-3.5-haiku",
    "gemini-2.5-pro": "google/gemini-2.5-pro",
    "gemini-2.5-flash": "google/gemini-2.5-flash",
    "gemini-2.0-flash": "google/gemini-3.5-flash"
  }[model] ?? "openai/gpt-4o-mini";
}

function indent(value) {
  return value.split(/\r\n|\r|\n/).map((line) => `  ${line}`).join("\n");
}
