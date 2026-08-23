const CHAT_STREAM_TIMEOUT_MS = 180000;
const TOOL_STREAM_TIMEOUT_MS = 300000;
const DEEP_RESEARCH_STREAM_TIMEOUT_MS = 900000;

export function streamTimeoutFor(body: unknown) {
  if (isDeepResearchStream(body)) return DEEP_RESEARCH_STREAM_TIMEOUT_MS;
  return isToolStream(body) ? TOOL_STREAM_TIMEOUT_MS : CHAT_STREAM_TIMEOUT_MS;
}

function isDeepResearchStream(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const payload = body as { model?: unknown; skill?: unknown };
  const model = typeof payload.model === "string" ? payload.model.toLowerCase() : "";
  const skill = typeof payload.skill === "string" ? payload.skill.toLowerCase() : "";
  return skill === "research"
    || model === "tool-deep-research"
    || model.includes("o3-deep-research");
}

function isToolStream(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const payload = body as { model?: unknown; skill?: unknown };
  const model = typeof payload.model === "string" ? payload.model.toLowerCase() : "";
  const skill = typeof payload.skill === "string" ? payload.skill.toLowerCase() : "";
  return skill === "web"
    || skill === "analyze"
    || model === "tool-web-search"
    || model === "tool-analyze-files";
}
