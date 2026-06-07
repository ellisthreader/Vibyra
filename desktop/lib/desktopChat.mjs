import { appState } from "./state.mjs";
import { syncDesktopAccountFromUser } from "./desktopAccount.mjs";
import { sendOpenAiProviderChat } from "./openAiProviderChat.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { promptProjectContext } from "./projectContext.mjs";
import { desktopMemoryContext } from "./desktopProjectMemory.mjs";
import { desktopActionsForPrompt } from "./desktopActions.mjs";

const API_URL = normalizeApiUrl(process.env.VIBYRA_DESKTOP_API_URL || process.env.VIBYRA_API_URL || "http://127.0.0.1:8000");
const MAX_PROMPT_CHARS = 8000;
const MAX_HISTORY_ITEMS = 4;
const MAX_HISTORY_CHARS = 1200;
const DESKTOP_SKILLS = new Set(["plan", "debug", "review", "explain", "fix", "refactor"]);

export async function sendDesktopChat(body, fetchImpl = fetch) {
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

  const desktopAction = desktopActionsForPrompt(prompt, { projectId: body?.projectId });
  if (desktopAction) return desktopAction;

  const project = await resolveProject(body?.projectId);
  const attachments = normalizeAttachments(body?.attachments);
  const skill = normalizeSkill(body?.skill);
  const mode = normalizeMode(body?.mode);
  const tool = normalizeTool(body?.tool);
  const projectFiles = project ? await contextForProject(project.id, prompt) : [];
  const memoryContext = project ? await desktopMemoryContext(project.id, fetchImpl) : [];
  const model = normalizeModel(body?.model);
  const payload = {
    fileBody: "",
    filePath: "",
    history: normalizeHistory(body?.history),
    model,
    mode,
    project: project?.name || "",
    projectFiles,
    prompt: desktopPrompt(prompt, project, attachments, body?.profileContext, memoryContext),
    reasoningEffort: normalizeReasoningEffort(body?.reasoningEffort),
    skill,
    surface: "desktop"
  };

  if (normalizeTokenMode(body?.tokenMode) === "provider" && openAiProviderModel(model)) {
    return sendOpenAiProviderChat(payload, fetchImpl);
  }

  if (!appState.desktopAccountToken) {
    const error = new Error("Log in to Vibyra Desktop before using Vibyra AI chat.");
    error.status = 401;
    throw error;
  }

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

function desktopPrompt(prompt, project, attachments, profileContext, memoryContext) {
  const context = [];
  const profileLines = normalizeProfileContext(profileContext);
  if (profileLines.length) context.push("Desktop profile preferences:", ...profileLines);
  if (project?.path) context.push(`Desktop project path: ${project.path}`);
  if (attachments.length) context.push(`Attached local context names: ${attachments.join(", ")}`);
  const memories = normalizeMemoryContext(memoryContext);
  if (memories.length) context.push("Relevant desktop memory:", ...memories);
  return context.length ? `${prompt}\n\n${context.join("\n")}` : prompt;
}

function normalizeMemoryContext(memoryContext) {
  if (!Array.isArray(memoryContext)) return [];
  return memoryContext.slice(0, 4).flatMap((item) => {
    const title = String(item?.title || "Memory").trim().slice(0, 80);
    const body = String(item?.body || "").trim().slice(0, 1600);
    return body ? [`### ${title}`, body] : [];
  });
}

function normalizeProfileContext(profileContext) {
  if (!profileContext || typeof profileContext !== "object") return [];
  const callName = String(profileContext.callName || "").trim().slice(0, 80);
  const responseStyle = String(profileContext.responseStyle || "").trim().slice(0, 220);
  const work = String(profileContext.work || "").trim().slice(0, 120);
  const customInstructions = String(profileContext.customInstructions || "").trim().slice(0, 1200);
  return [
    callName ? `Call the user: ${callName}` : "",
    responseStyle ? `Preferred response style: ${responseStyle}` : "",
    work ? `User work: ${work}` : "",
    customInstructions ? `User instructions: ${customInstructions}` : ""
  ].filter(Boolean);
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

function normalizeTokenMode(value) {
  return String(value || "vibyra").trim().toLowerCase() === "provider" ? "provider" : "vibyra";
}

function openAiProviderModel(model) {
  const key = String(model || "").trim().toLowerCase();
  return key === "auto" || key.startsWith("openai/") || key.startsWith("gpt-") || key.includes("codex");
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
