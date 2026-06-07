import { appState } from "./state.mjs";

const API_URL = String(process.env.VIBYRA_DESKTOP_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export async function getDesktopProjectMemory(projectId, fetchImpl = fetch) {
  return requestProjectMemory(projectId, "", {}, fetchImpl);
}

export async function addDesktopProjectMemory(projectId, text, fetchImpl = fetch) {
  return requestProjectMemory(projectId, "/entries", { method: "POST", body: JSON.stringify({ text }) }, fetchImpl);
}

export async function deleteDesktopProjectMemory(projectId, entryId, fetchImpl = fetch) {
  return requestProjectMemory(projectId, `/entries/${encodeURIComponent(entryId)}`, { method: "DELETE" }, fetchImpl);
}

export async function desktopMemoryContext(projectId, fetchImpl = fetch) {
  if (!projectId || !appState.desktopAccountToken) return [];
  try {
    const memory = await getDesktopProjectMemory(projectId, fetchImpl);
    return memory.entries
      .filter((entry) => entry.source !== "brief" && entry.text)
      .slice(-6)
      .map((entry) => ({ title: "Project memory", body: entry.text }));
  } catch {
    return [];
  }
}

async function requestProjectMemory(projectId, suffix, options, fetchImpl) {
  if (!appState.desktopAccountToken) throw httpError(401, "Log in to Vibyra Desktop to use project memory.");
  const id = String(projectId || "").trim();
  if (!id) throw httpError(422, "Select a project before using Memory.");
  const response = await fetchImpl(`${API_URL}/api/project-memory/${encodeURIComponent(id)}${suffix}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${appState.desktopAccountToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw httpError(response.status, payload.error || "Project memory request failed.");
  return normalizeMemory(payload.memory);
}

function normalizeMemory(value) {
  const entries = Array.isArray(value?.entries) ? value.entries.map(normalizeEntry).filter(Boolean).slice(-8) : [];
  return { entries, updatedAt: String(value?.updatedAt || "") };
}

function normalizeEntry(value) {
  const id = String(value?.id || "").trim();
  const text = String(value?.text || "").trim().slice(0, 220);
  if (!id || !text) return null;
  return { id, text, source: value?.source === "brief" ? "brief" : "user", createdAt: String(value?.createdAt || "") };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
