import type { AgentConnection, FileEntry } from "../types/domain";
import type { ChatResponse } from "../utils/appApi";
import { absoluteDesktopPreviewUrl } from "../utils/previewUrls";
import type { AgentStartResult } from "./agentTypes";

export function previewAppForAgentResult(
  connection: AgentConnection | null,
  projectId: string,
  projectName: string,
  result: AgentStartResult
): ChatResponse["app"] {
  if (!shouldAttachPreviewForAgentResult(result)) return null;
  const html = previewHtmlFromFiles(result.files);
  const canUseDesktopUrl = Boolean(connection && result.preview.url);
  const needsDesktopUrl = Boolean(html && hasLocalScriptOrStylesheet(html));
  if (needsDesktopUrl && !canUseDesktopUrl) return null;
  const inlineHtml = html && !needsDesktopUrl ? html : "";
  if (!connection && !html) return null;
  if (!html && !result.preview.url) return null;
  return {
    id: `${result.agent.id}-preview`,
    title: result.preview.title || projectName,
    ...(inlineHtml ? { html: inlineHtml } : {}),
    ...(connection && result.preview.url ? { url: absoluteDesktopPreviewUrl(connection.url, result.preview.url) } : {})
  };
}

function shouldAttachPreviewForAgentResult(result: AgentStartResult) {
  if (result.pendingApplyId || result.changes.length === 0) return false;
  if (previewHtmlFromFiles(result.files)) return true;
  return result.changes.some((change) => isPreviewablePath(change.file))
    || result.files.some((file) => isPreviewablePath(file.path));
}

function previewHtmlFromFiles(files: FileEntry[]) {
  const htmlFile = files.find((file) => {
    const path = file.path.toLowerCase();
    return path.endsWith("/index.html") || path === "index.html" || (file.name.toLowerCase() === "index.html" && file.language === "html");
  });
  return htmlFile?.body?.trim() || "";
}

function isPreviewablePath(path: string) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (isNonPreviewPath(normalized)) return false;
  if (normalized === "index.html" || normalized.endsWith("/index.html")) return true;
  if (/\.(html|css|scss|sass|less|js|jsx|ts|tsx|vue|svelte|astro|mdx)$/.test(normalized)) {
    return /(^|\/)(src|app|pages|components|views|resources|public|frontend|client|web|assets)\//.test(normalized)
      || ! normalized.includes("/");
  }
  return false;
}

function isNonPreviewPath(path: string) {
  return /(^|\/)(backend|server|api|routes|database|config|tests?|spec|__tests__|scripts|bin|vendor)\//.test(path)
    || /\.(php|py|rb|go|rs|java|kt|swift|cs|sql|json|lock|yml|yaml|toml|env)$/.test(path);
}

function hasLocalScriptOrStylesheet(html: string) {
  return /<script\b[^>]*\bsrc\s*=\s*["'](?!https?:|data:|blob:|\/\/|about:)[^"']+["']/i.test(html)
    || /<link\b(?=[^>]*\brel\s*=\s*["']?(?:stylesheet|modulepreload|preload))(?=[^>]*\bhref\s*=\s*["'](?!https?:|data:|\/\/|about:))[^>]*>/i.test(html);
}
