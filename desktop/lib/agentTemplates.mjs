import { access } from "node:fs/promises";
import { join } from "node:path";
import { TOKEN } from "./state.mjs";

export async function prepareObsidianRun({ project, runId, prompt, model }) {
  const vaultDir = await findObsidianVault(project.path);
  if (!vaultDir) return null;
  const outputDir = join(vaultDir, "_ai", "Runs");
  const outputPath = join(outputDir, `${runId}.md`);
  return { outputDir, outputPath, summary: makeObsidianRunSummary({ prompt, model, project, runId }) };
}

async function findObsidianVault(projectPath) {
  const candidates = [process.env.VIBYRA_OBSIDIAN_VAULT, join(projectPath, "Vibyra"), projectPath].filter(Boolean);
  for (const candidate of candidates) {
    if (await pathExists(join(candidate, ".obsidian"))) return candidate;
  }
  return null;
}

async function pathExists(path) {
  try { await access(path); return true; } catch { return false; }
}

export function makeRunSummary({ prompt, model, project }) {
  return [
    "# Vibyra Agent Run", "",
    `Prompt: ${prompt}`, `Model: ${model}`, `Project: ${project.name}`,
    `Created: ${new Date().toISOString()}`, "",
    "Vibyra Desktop wrote a safe run artifact to prove pairing, routing, local apply, reload, capture, and phone delivery."
  ].join("\n");
}

export function makeAgentChatReply() {
  return [
    "I updated the local preview.",
    "",
    "The internal run log was saved locally, and the changes are ready to review below."
  ].join("\n");
}

function makeObsidianRunSummary({ prompt, model, project, runId }) {
  const created = new Date().toISOString();
  return [
    "---", `run: ${runId}`, `created: ${created}`,
    `project: ${JSON.stringify(project.name)}`, `model: ${JSON.stringify(model)}`,
    "tags:", "  - vibyra/run", "  - generated", "---", "",
    "# Vibyra Run Summary", "",
    `Run: ${runId}`, `Created: ${created}`, `Project: ${project.name}`, `Model: ${model}`, "",
    "## Prompt", "", prompt, "",
    "## Result", "",
    "- Desktop agent accepted the task.",
    "- Local preview and run artifact were written.",
    "- Keep only durable follow-up context in `_ai/Project Context.md` or `_ai/Current Tasks.md`."
  ].join("\n");
}

export function previewUrl(projectId) {
  return `/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(TOKEN)}/`;
}

export function makePreviewHtml({ prompt, project }) {
  throw new Error("Local desktop preview templates are disabled. Use the AI generation path instead.");
}
