import { CodeChange, FileEntry, Project } from "../types/domain";

export function mergeProjects(existing: Project[], incoming: Project[]): Project[] {
  const incomingIds = new Set(incoming.map((project) => project.id));
  const adopted = existing.filter((project) => !incomingIds.has(project.id));
  return [...incoming, ...adopted];
}

export function dedupeFiles(files: FileEntry[]) {
  const byId = new Map<string, FileEntry>();
  for (const file of files) {
    byId.set(file.id, file);
  }
  return Array.from(byId.values());
}

export function isRunArtifactPath(path: string) {
  return path.includes(".vibyra-agent/runs/");
}

export function isRunArtifact(file: { path?: string } | null | undefined) {
  return Boolean(file?.path && isRunArtifactPath(file.path));
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

export function findIndexHtmlBody(files: FileEntry[]): string | null {
  const indexHtml = files.find((file) => {
    if (!file?.body?.trim() || isRunArtifactPath(file.path)) return false;
    const path = file.path.toLowerCase();
    return path.endsWith("/index.html") || path === "index.html"
      || (file.name.toLowerCase() === "index.html" && file.language === "html");
  });
  return indexHtml?.body?.trim() || null;
}

export function buildCodeListingHtml(files: FileEntry[]): string | null {
  const real = files.filter((file) => (
    file && file.id !== "empty" && file.body?.trim() && !isRunArtifactPath(file.path)
  ));
  if (real.length === 0) return null;

  const sections = real.slice(0, 30).map((file) => `
    <section>
      <h3>${escapeHtml(file.path)}</h3>
      <pre><code>${escapeHtml(file.body ?? "")}</code></pre>
    </section>
  `).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{background:#0B0D17;color:#E5E2F0;margin:0;padding:0;}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:18px;}
  h2{color:#FFFFFF;font-size:16px;margin:0 0 14px;}
  h3{color:#BFAEFF;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;margin:18px 0 6px;word-break:break-all;}
  pre{background:#070810;border:1px solid rgba(255,255,255,.06);border-radius:10px;margin:0;overflow-x:auto;padding:12px;}
  code{color:#E5E2F0;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.55;white-space:pre;}
  section{margin-bottom:14px;}
</style></head><body><h2>Project preview</h2>${sections}</body></html>`;
}

export function pickPreviewHtml(files: FileEntry[], hasLiveUrl: boolean): string {
  const indexHtml = findIndexHtmlBody(files);
  if (indexHtml) return indexHtml;
  if (hasLiveUrl) return "";
  return buildCodeListingHtml(files) ?? "";
}

export function formatAssistantReply(reply: string, changes: CodeChange[]) {
  const applied = changes
    .filter((change) => change.summary.includes("Applied Vibyra generated file"))
    .map((change) => change.file);

  if (applied.length === 0) {
    return reply.trim() || "Done.";
  }

  const label = applied.length === 1 ? "file" : "files";
  return `${reply.trim() || "Done."}\n\nApplied ${applied.length} ${label}:\n${applied.map((file) => `- ${file}`).join("\n")}`;
}
