import { desktopAppApiUrl } from "./appApiConfig.mjs";
import { clearDesktopAccount } from "./desktopAccount.mjs";
import { appState } from "./state.mjs";

const API_URL = desktopAppApiUrl();
const REQUEST_TIMEOUT_MS = 8000;

export async function requestCloudTeamPlan(input, fetchImpl = fetch) {
  if (!appState.desktopAccountToken) {
    throw plannerError("Log in to use AI Team planning.", 401, "planner_auth_required");
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (input?.signal?.aborted) {
    throw plannerError("Team planning was cancelled.", 503, "planner_cancelled");
  }
  input?.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  let result;
  try {
    response = await fetchImpl(`${API_URL}/api/chat/team-plan`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${appState.desktopAccountToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        goal: String(input?.goal || "").slice(0, 1200),
        roles: normalizeRoles(input?.roles),
        projectContext: {
          summary: "",
          candidatePaths: normalizeProjectFiles(input?.projectFiles).map((file) => file.path)
        }
      })
    });
    result = await readJson(response);
    if (input?.signal?.aborted) {
      throw plannerError("Team planning was cancelled.", 503, "planner_cancelled");
    }
  } catch (error) {
    const cancelled = Boolean(input?.signal?.aborted);
    const code = error?.code === "planner_cancelled"
      ? error.code
      : cancelled
      ? "planner_cancelled"
      : error?.name === "AbortError"
        ? "planner_timeout"
        : "planner_unavailable";
    throw plannerError(
      cancelled
        ? "Team planning was cancelled."
        : code === "planner_timeout"
          ? "AI Team planning timed out."
          : "AI Team planning is unavailable.",
      503,
      code
    );
  } finally {
    clearTimeout(timer);
    input?.signal?.removeEventListener("abort", cancel);
  }

  if (!response.ok || result?.ok === false) {
    if (response.status === 401) clearDesktopAccount();
    const providerCode = String(result?.code || "").trim().toLowerCase();
    const providerMessage = String(result?.error || result?.message || "").trim();
    const code = [404, 405].includes(response.status)
      ? "planner_endpoint_unavailable"
      : response.status === 402
        || /credit|billing/.test(`${providerCode} ${providerMessage}`.toLowerCase())
        ? "planner_insufficient_credits"
        : providerCode || "planner_failed";
    throw plannerError(
      providerMessage || "AI Team planning failed.",
      response.status || 502,
      code
    );
  }

  return {
    proposal: result?.plan || result?.proposal || null,
    model: String(result?.model || "gpt-5.4-mini").slice(0, 80),
    creditCost: Number.isFinite(Number(result?.creditCost)) ? Number(result.creditCost) : null
  };
}

function normalizeProjectFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.slice(0, 24).flatMap((file) => {
    const path = String(file?.path || "").trim().slice(0, 300);
    if (!path || path.startsWith("/") || path.includes("..")) return [];
    return [{
      path,
      language: String(file?.language || "").trim().slice(0, 40)
    }];
  });
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles.slice(0, 4)
    .map((role) => String(role || "").trim().toLowerCase())
    .filter(Boolean);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function plannerError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
