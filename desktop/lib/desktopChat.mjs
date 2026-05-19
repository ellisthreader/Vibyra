import { appState } from "./state.mjs";
import { syncDesktopAccountFromUser } from "./desktopAccount.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { promptProjectContext } from "./projectContext.mjs";

const API_URL = normalizeApiUrl(process.env.VIBYRA_DESKTOP_API_URL || process.env.VIBYRA_API_URL || "http://127.0.0.1:8000");
const MAX_PROMPT_CHARS = 8000;
const MAX_HISTORY_ITEMS = 4;
const MAX_HISTORY_CHARS = 1200;
const DESKTOP_SKILLS = new Set(["plan", "debug", "review", "explain", "fix", "refactor"]);

export async function sendDesktopChat(body, fetchImpl = fetch) {
  if (!appState.desktopAccountToken) {
    const error = new Error("Log in to Vibyra Desktop before using Vibyra AI chat.");
    error.status = 401;
    throw error;
  }

  const prompt = String(body?.prompt || "").trim();
  if (!prompt) {
    const error = new Error("Ask Vibyra something first.");
    error.status = 422;
    throw error;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    const error = new Error(`That prompt is too long. Trim it to under ${MAX_PROMPT_CHARS} characters.`);
    error.status = 413;
    throw error;
  }

  const project = await resolveProject(body?.projectId);
  const attachments = normalizeAttachments(body?.attachments);
  const skill = normalizeSkill(body?.skill);
  const mode = normalizeMode(body?.mode);
  const tool = normalizeTool(body?.tool);
  const projectFiles = project ? await contextForProject(project.id, prompt) : [];
  const payload = {
    fileBody: "",
    filePath: "",
    history: normalizeHistory(body?.history),
    model: normalizeModel(body?.model),
    mode,
    project: project?.name || "",
    projectFiles,
    prompt: desktopPrompt(prompt, project, attachments),
    reasoningEffort: normalizeReasoningEffort(body?.reasoningEffort),
    skill,
    surface: "desktop"
  };

  const response = await fetchImpl(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${appState.desktopAccountToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await readJson(response);
  if (!response.ok || result?.ok === false) {
    const error = new Error(result?.error || result?.message || "Vibyra AI could not complete this chat.");
    error.status = response.status || 500;
    error.code = result?.code || "";
    error.resetAt = result?.burstCreditsResetAt || result?.weeklyCreditsResetAt || "";
    error.burstCreditsResetAt = result?.burstCreditsResetAt || "";
    error.weeklyCreditsResetAt = result?.weeklyCreditsResetAt || "";
    throw error;
  }
  if (result?.user) syncDesktopAccountFromUser(result.user);

  return {
    ok: true,
    reply: String(result?.reply || "I received an empty response from Vibyra AI."),
    title: result?.title || "",
    model: result?.model || "",
    modelKey: result?.modelKey || payload.model,
    creditCost: result?.creditCost ?? null,
    creditsBalance: result?.creditsBalance ?? null,
    app: normalizeAppPayload(result?.app),
    user: result?.user || null
  };
}

async function resolveProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return null;
  let project = projectById(id);
  if (project) return project;
  await discoverProjects();
  return projectById(id) || null;
}

async function contextForProject(projectId, prompt) {
  try {
    const context = await promptProjectContext(projectId, prompt);
    return Array.isArray(context?.files) ? context.files : [];
  } catch {
    return [];
  }
}

function desktopPrompt(prompt, project, attachments) {
  const context = [];
  if (project?.path) context.push(`Desktop project path: ${project.path}`);
  if (attachments.length) context.push(`Attached local context names: ${attachments.join(", ")}`);
  return context.length ? `${prompt}\n\n${context.join("\n")}` : prompt;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ["assistant", "user"].includes(item.role) && String(item.text || "").trim())
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item.role,
      text: String(item.text || "").slice(0, MAX_HISTORY_CHARS)
    }));
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
}

function normalizeModel(model) {
  return String(model || "auto").trim() || "auto";
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "medium").trim();
  return ["low", "medium", "high", "xhigh", "none"].includes(effort) ? effort : "medium";
}

function normalizeMode(value) {
  return "chat";
}

function normalizeSkill(value) {
  const skill = String(value || "").trim().toLowerCase();
  return DESKTOP_SKILLS.has(skill) ? skill : "";
}

function normalizeTool(value) {
  return "";
}

function normalizeAppPayload(app) {
  if (!app || typeof app !== "object") return null;
  const url = String(app.url || app.previewUrl || "").trim();
  const html = String(app.html || "").trim();
  if (!url && !html) return null;
  return {
    title: String(app.title || "Generated app").slice(0, 120),
    url,
    html
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeApiUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}
