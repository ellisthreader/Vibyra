import { Project } from "../../../types/domain";
import { normalizeAgentUrl } from "../../../utils/network";

export function projectPreviewUrl(baseUrl: string, projectId: string, token: string) {
  return `${normalizeAgentUrl(baseUrl)}/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

export function desktopProjectSearchQuery(prompt: string) {
  const trimmed = prompt.trim();
  const quoted = trimmed.match(/["'`“”‘’]([^"'`“”‘’]{2,80})["'`“”‘’]/);
  if (quoted?.[1]) return quoted[1].trim();

  const named = trimmed.match(/\b(?:called|named|project|folder|repo|repository|directory|app)\s+([a-z0-9][\w ._-]{1,80})/i);
  if (named?.[1]) {
    return named[1]
      .replace(/\b(?:on|in|from|inside|under|please|thanks|thank you)\b.*$/i, "")
      .trim();
  }

  return trimmed;
}

export function isProjectLookupOnly(prompt: string) {
  const text = prompt.toLowerCase();
  const asksForProject = /\b(find|open|look|locate|use|switch|select)\b/.test(text) && /\b(project|folder|repo|repository|directory|app|desktop|pc|computer|machine)\b/.test(text);
  const asksForCodeWork = /\b(build|add|create|change|fix|update|edit|refactor|implement|make|design|write|code|generate|remove|delete)\b/.test(text);
  return asksForProject && !asksForCodeWork;
}

export function isCurrentProjectQuestion(prompt: string) {
  const text = prompt.toLowerCase().trim();
  const asksWhere = /\b(where|what|which|are we|we are|current|selected|open)\b/.test(text);
  const mentionsWorkspace = /\b(file|folder|project|repo|repository|directory|workspace|app)\b/.test(text);
  const asksForCodeWork = /\b(build|add|create|change|fix|update|edit|refactor|implement|make|design|write|code|generate|remove|delete)\b/.test(text);
  return asksWhere && mentionsWorkspace && !asksForCodeWork;
}

export function currentProjectReply(project: Project, selectedFileName: string) {
  const cleanName = project.name.trim() || "this project";
  const cleanPath = project.path.trim();
  const file = selectedFileName && selectedFileName !== "No files" ? ` The selected file is ${selectedFileName}.` : "";
  return `You are currently in ${cleanName}${cleanPath ? ` at ${cleanPath}` : ""}.${file}`;
}

export function desktopConnectionRequiredReply(searchQuery: string) {
  const target = searchQuery ? ` for "${searchQuery}"` : "";
  return `I can search your desktop${target}, but only when Vibyra Desktop is connected. Open Vibyra Desktop on your PC, pair this app, then send this again.`;
}

