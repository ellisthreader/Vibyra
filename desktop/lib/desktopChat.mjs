import { desktopAppApiUrl } from "./appApiConfig.mjs";
import { appState } from "./state.mjs";
import { clearDesktopAccount, syncDesktopAccountFromUser } from "./desktopAccount.mjs";
import { discoverProjects, projectById, terminalProjectById } from "./projects.mjs";
import { promptProjectContext, promptProjectFilePaths } from "./projectContext.mjs";
import { desktopMemoryContext } from "./desktopProjectMemory.mjs";
import { desktopVaultMemoryContext } from "./desktopTerminalMemory.mjs";
import { correctDesktopCapabilityDenial, desktopActionsForPrompt } from "./desktopActions.mjs";
import { sendLocalVibyraChat } from "./localAi.mjs";
import { agenticTerminalTasks } from "./terminalTaskPrompts.mjs";

const API_URL = desktopAppApiUrl();
const MAX_PROMPT_CHARS = 8000;
const MAX_HISTORY_ITEMS = 4;
const MAX_HISTORY_CHARS = 1200;
const DESKTOP_SKILLS = new Set(["plan", "debug", "review", "explain", "fix", "refactor"]);
const DESKTOP_LANGUAGES = new Set(["English", "Español", "Français", "Deutsch", "Português", "日本語", "中文"]);

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

  const desktopAction = body?.disableDesktopActions
    ? null
    : desktopActionsForPrompt(prompt, {
      desktopActionContext: normalizeDesktopActionContext(body?.desktopActionContext),
      history: normalizeHistory(body?.history),
      projectId: body?.projectId,
      terminalId: body?.terminalId
    });
  if (desktopAction) {
    return resolveDesktopActionProject(desktopAction, {
      fetchImpl,
      history: normalizeHistory(body?.history),
      prompt
    });
  }

  const project = await resolveProject(body?.projectId);
  const attachments = normalizeAttachments(body?.attachments);
  const imageAttachments = normalizeImageAttachments(body?.imageAttachments);
  const skill = normalizeSkill(body?.skill);
  const mode = normalizeMode(body?.mode);
  const tool = normalizeTool(body?.tool);
  const projectFiles = project ? await contextForProject(project.id, prompt) : [];
  const memoryContext = project ? await combinedDesktopMemoryContext(project.id, fetchImpl) : [];
  const model = normalizeModel(body?.model);
  const payload = {
    fileBody: "",
    filePath: "",
    history: normalizeHistory(body?.history),
    imageAttachments,
    model,
    mode,
    project: project?.name || "",
    projectFiles,
    prompt: desktopPrompt(prompt, project, attachments, body?.profileContext, memoryContext),
    routingPrompt: prompt,
    reasoningEffort: normalizeReasoningEffort(body?.reasoningEffort),
    skill,
    surface: "desktop"
  };

  if (normalizeProvider(body?.provider) === "local") {
    return correctModelCapabilityReply(await sendLocalVibyraChat(payload, fetchImpl), prompt);
  }

  if (normalizeTokenMode(body?.tokenMode) === "provider" && openAiProviderModel(model)) {
    const error = new Error("Personal AI accounts are available in native AI terminals. Vibyra Chat does not request provider API keys.");
    error.status = 409;
    throw error;
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
    invalidateExpiredDesktopSession(response);
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
    reply: correctDesktopCapabilityDenial(
      prompt,
      String(result?.reply || "I received an empty response from Vibyra AI.")
    ),
    title: result?.title || "",
    model: result?.model || "",
    modelKey: result?.modelKey || payload.model,
    autoRouting: normalizeAutoRouting(result?.autoRouting),
    creditCost: result?.creditCost ?? null,
    creditsBalance: result?.creditsBalance ?? null,
    app: normalizeAppPayload(result?.app),
    user: result?.user || null
  };
}

export async function routeDesktopAutoModel(body, fetchImpl = fetch) {
  const prompt = String(body?.prompt || "").trim();
  const allowedProviders = [...new Set(
    (Array.isArray(body?.allowedProviders) ? body.allowedProviders : [])
      .map((provider) => String(provider || "").trim().toLowerCase())
      .filter(Boolean)
  )].slice(0, 12);
  if (!prompt) {
    const error = new Error("Enter a prompt for Auto to route.");
    error.status = 422;
    throw error;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    const error = new Error(`That prompt is too long. Trim it to under ${MAX_PROMPT_CHARS} characters.`);
    error.status = 413;
    throw error;
  }
  if (!appState.desktopAccountToken) {
    const error = new Error("Log in to Vibyra Desktop before using Auto.");
    error.status = 401;
    throw error;
  }

  const response = await fetchImpl(`${API_URL}/api/chat/route`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${appState.desktopAccountToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      ...(allowedProviders.length ? { allowedProviders } : {})
    })
  });
  const result = await readJson(response);
  if (!response.ok || result?.ok === false) {
    invalidateExpiredDesktopSession(response);
    const error = new Error(result?.error || result?.message || "Auto could not select a terminal model.");
    error.status = response.status || 500;
    throw error;
  }

  const autoRouting = normalizeAutoRouting(result?.autoRouting);
  const modelKey = String(result?.modelKey || autoRouting?.modelKey || "").trim().slice(0, 160);
  if (!modelKey || modelKey === "auto") {
    const error = new Error("Auto did not return a usable terminal model.");
    error.status = 502;
    throw error;
  }

  return { ok: true, modelKey, autoRouting };
}

function invalidateExpiredDesktopSession(response) {
  if (Number(response?.status) !== 401) return;
  clearDesktopAccount("Your Vibyra session expired. Sign in again to continue.");
}

function correctModelCapabilityReply(result, prompt) {
  return {
    ...result,
    reply: correctDesktopCapabilityDenial(prompt, result?.reply)
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

async function resolveDesktopActionProject(result, context = {}) {
  const action = result?.actions?.find((item) =>
    item?.type === "open_terminals" || item?.type === "run_terminal_tasks"
  );
  const requestedName = String(action?.projectName || "").trim();
  if (!action) return result;
  if (!requestedName) {
    const projectId = String(action.projectId || "").trim();
    if (!projectId) return enrichTerminalTaskAction(result, null, context);
    let project = terminalProjectById(projectId);
    if (!project && projectId !== "full-pc") {
      await discoverProjects();
      project = terminalProjectById(projectId);
    }
    if (!project) {
      const error = new Error("The selected terminal project is no longer available.");
      error.status = 404;
      throw error;
    }
    return enrichTerminalTaskAction(result, project, context);
  }

  const normalizedName = normalizeProjectName(requestedName);
  const projects = await discoverProjects();
  const matches = projects.filter((project) => projectMatchesReference(project, normalizedName));
  if (matches.length !== 1) {
    const error = new Error(matches.length
      ? `More than one desktop project is named "${requestedName}". Select the project in Terminals and try again.`
      : `I could not find a desktop project named "${requestedName}".`);
    error.status = matches.length ? 409 : 404;
    throw error;
  }

  action.projectId = matches[0].id;
  delete action.projectName;
  result.reply = String(result.reply || "").replace(
    new RegExp(`project\\s+${escapeRegExp(requestedName)}`, "i"),
    `project ${matches[0].name}`
  );
  return enrichTerminalTaskAction(result, matches[0], context);
}

async function enrichTerminalTaskAction(result, project, context) {
  const action = result?.actions?.find((item) => item?.type === "run_terminal_tasks");
  if (!action) return result;
  const projectFiles = project?.id && project.id !== "full-pc"
    ? await terminalTaskProjectFiles(project.id, context.prompt)
    : [];
  const memoryContext = project?.id && project.id !== "full-pc"
    ? await combinedDesktopMemoryContext(project.id, context.fetchImpl)
    : [];
  action.tasks = agenticTerminalTasks(action, {
    history: context.history,
    memoryContext,
    project,
    projectFiles,
    userPrompt: context.prompt
  });
  return result;
}

async function terminalTaskProjectFiles(projectId, prompt) {
  try {
    return await promptProjectFilePaths(projectId, prompt, 12);
  } catch {
    return [];
  }
}

function normalizeProjectName(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\s+/g, " ")
    .replace(/^\.?\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function projectMatchesReference(project, normalizedReference) {
  if (!normalizedReference) return false;
  if (normalizeProjectName(project?.name) === normalizedReference) return true;
  if (!normalizedReference.includes("/")) return false;
  const path = normalizeProjectName(project?.path);
  return path === normalizedReference || path.endsWith(`/${normalizedReference}`);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function combinedDesktopMemoryContext(projectId, fetchImpl) {
  const [vault, entries] = await Promise.all([
    desktopVaultMemoryContext(projectId, fetchImpl).catch(() => []),
    desktopMemoryContext(projectId, fetchImpl).catch(() => [])
  ]);
  return [...vault, ...entries].slice(0, 6);
}

function normalizeProfileContext(profileContext) {
  if (!profileContext || typeof profileContext !== "object") return [];
  const callName = String(profileContext.callName || "").trim().slice(0, 80);
  const responseStyle = String(profileContext.responseStyle || "").trim().slice(0, 220);
  const work = String(profileContext.work || "").trim().slice(0, 120);
  const customInstructions = String(profileContext.customInstructions || "").trim().slice(0, 1200);
  const requestedLanguage = String(profileContext.language || "").trim();
  const language = DESKTOP_LANGUAGES.has(requestedLanguage) ? requestedLanguage : "";
  return [
    callName ? `Call the user: ${callName}` : "",
    language ? `Preferred response language: ${language}. Reply in this language unless the user explicitly asks for another language.` : "",
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

function normalizeDesktopActionContext(value) {
  if (!value || typeof value !== "object") return {};
  const source = value.recentTerminalBatch || value.recentBatch || value.lastTerminalBatch;
  if (!source || typeof source !== "object") return {};
  const rawIds = Array.isArray(source.terminalIds)
    ? source.terminalIds
    : Array.isArray(source.ids)
      ? source.ids
      : [];
  const terminalIds = [...new Set(
    rawIds.map((id) => String(id || "").trim()).filter(Boolean)
  )].slice(0, 12);
  if (!terminalIds.length) return {};
  return {
    recentTerminalBatch: {
      batchId: String(source.batchId || source.id || "").trim().slice(0, 120),
      projectId: String(source.projectId || "").trim().slice(0, 240),
      terminalIds
    }
  };
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
}

function normalizeImageAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.slice(0, 3).map((item) => ({
    name: String(item?.name || "image").trim().slice(0, 90),
    url: String(item?.url || item?.dataUrl || "").trim()
  })).filter((item) => /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(item.url));
}

function normalizeModel(model) {
  return String(model || "auto").trim() || "auto";
}

function normalizeTokenMode(value) {
  return String(value || "vibyra").trim().toLowerCase() === "provider" ? "provider" : "vibyra";
}

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase() === "local" ? "local" : "cloud";
}

function openAiProviderModel(model) {
  const key = String(model || "").trim().toLowerCase();
  return key === "auto" || key.startsWith("openai/") || key.startsWith("gpt-") || key.includes("codex");
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "medium").trim();
  return ["default", "low", "medium", "high", "xhigh", "none"].includes(effort) ? effort : "medium";
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

function normalizeAutoRouting(value) {
  if (!value || typeof value !== "object") return null;
  const modelKey = String(value.modelKey || "").trim().slice(0, 160);
  if (!modelKey) return null;
  return {
    category: String(value.category || "").trim().slice(0, 80),
    modelKey,
    preferredModelKey: String(value.preferredModelKey || modelKey).trim().slice(0, 160),
    reason: String(value.reason || "").trim().slice(0, 240)
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
