import { sendDesktopChat } from "./desktopChat.mjs";
import { normalizeMemoryImportManifest } from "./desktopMemoryVault.mjs";

const MAX_FILES = 12;
const MAX_GOAL_LENGTH = 2000;

export async function proposeDesktopMemory(projectId, input = {}, chatSender = sendDesktopChat) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) throw validationError("Choose a project before building memory.");
  const goal = String(input.goal || "").trim();
  if (!goal) throw validationError("Tell Vibyra what this project memory should capture.");
  if (goal.length > MAX_GOAL_LENGTH) throw validationError(`Keep the memory request under ${MAX_GOAL_LENGTH} characters.`);

  const result = await chatSender({
    disableDesktopActions: true,
    history: [],
    mode: "chat",
    model: input.model || "auto",
    provider: input.provider || "local",
    projectId: normalizedProjectId,
    prompt: proposalPrompt(goal),
    reasoningEffort: input.reasoningEffort || "medium",
    skill: "plan"
  });
  const parsed = parseProposal(result?.reply);
  const normalized = normalizeMemoryImportManifest({
    collisionStrategy: "replace",
    files: parsed.files
  });
  if (normalized.files.length > MAX_FILES) {
    throw validationError(`Vibyra Memory proposals are limited to ${MAX_FILES} notes.`);
  }
  return {
    ok: true,
    proposal: {
      summary: String(parsed.summary || "Vibyra prepared project memory notes.").trim().slice(0, 240),
      files: normalized.files
    }
  };
}

export function parseDesktopMemoryProposal(value) {
  return parseProposal(value);
}

function proposalPrompt(goal) {
  return [
    "Prepare an Obsidian-style project memory vault for the current project.",
    `User goal: ${goal}`,
    "Use available project context and existing memory. Return JSON only with this shape:",
    '{"summary":"short explanation","files":[{"path":"Folder/Note.md","markdown":"# Note\\n..."}]}',
    `Create at most ${MAX_FILES} concise Markdown notes. Use relative paths only.`,
    "Prefer useful notes such as Start Here, Overview, Architecture, Commands, Decisions, and Known Issues.",
    "Do not include secrets, absolute filesystem paths, .obsidian metadata, or non-Markdown files."
  ].join("\n");
}

function parseProposal(value) {
  const text = String(value || "").trim();
  const candidates = [
    text,
    text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.files) && parsed.files.length) return parsed;
    } catch {}
  }
  throw validationError("Vibyra AI did not return a valid memory proposal. Try a more specific request.");
}

function validationError(message) {
  const error = new Error(message);
  error.status = 422;
  return error;
}
