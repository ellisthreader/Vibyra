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

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function makePreviewHtml({ prompt, project }) {
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
