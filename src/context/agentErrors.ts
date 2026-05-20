import type { AgentBusyInfo } from "../types/agentStatus";
import { setChatUsageLimitFromError, usageLimitMessage } from "./chatUsageLimit";

export function userFacingAgentError(error: unknown) {
  const limit = setChatUsageLimitFromError(error);
  if (limit) return usageLimitMessage(limit);

  const message = error instanceof Error ? error.message : String(error || "Agent task failed");
  const lower = message.toLowerCase();

  if (lower.includes("your session expired") || lower.includes("missing app session token")) {
    return "Your Vibyra login needs refreshing. Log in again, then resend this prompt.";
  }
  if (lower.includes("ai chat timed out")) {
    return "The preview edit took too long to generate. Try again, or ask for a smaller change.";
  }
  if (lower.includes("openrouter") && lower.includes("could not reach")) {
    return "Vibyra reached your backend, but the AI provider did not respond. Try again in a moment, or check the backend OpenRouter connection.";
  }
  if (lower.includes("openrouter is not configured")) {
    return "The backend is running, but OpenRouter is not configured. Add `OPENROUTER_API_KEY` to `backend/.env`, then restart the backend.";
  }
  if (lower.includes("openrouter") && (lower.includes("rate-limited") || lower.includes("rate limited"))) {
    return "OpenRouter rate-limited this request. Wait a moment, then try the preview change again.";
  }
  if (lower.includes("http 401") || lower.includes("401 unauthorized") || lower.includes("api key")) {
    return "I could not start the desktop AI run because the desktop OpenRouter key is missing or invalid. Check `OPENROUTER_API_KEY` in `backend/.env`, then restart the backend.";
  }
  if (lower.includes("http 502") || lower.includes("bad gateway")) {
    return "The desktop AI service failed while starting the run. Check the Vibyra Desktop/backend logs, then try again.";
  }
  if (lower.includes("desktop ai worker is still cleaning up")) {
    return "The desktop AI worker is cleaning up the last run. Wait a few seconds, then send again.";
  }
  if (lower.includes("duplicate") || lower.includes("already sent")) {
    return "That exact prompt was just sent. Change the prompt a little before running it again.";
  }
  if (lower.includes("cooldown") || lower.includes("please wait")) {
    return message;
  }
  if (lower.includes("failed to fetch") || lower.includes("could not reach")) {
    if (lower.includes("could not reach vibyra at") || lower.includes("timed out at")) return message;
    return "I could not reach Vibyra from the app. Make sure the backend is running on port 8000 and Expo was restarted after EXPO_PUBLIC_API_URL changed. On iPhone, Local Network permission must also be enabled for Expo Go or your dev client.";
  }
  if (lower.includes("not enough credits") || lower.includes("out of free credits") || lower.includes("out of credits")) {
    return "You're out of credits for this request. Open Account → Billing to top up or upgrade your plan.";
  }
  if (lower.includes("5-hour") || lower.includes("burst cap") || lower.includes("burst window")) {
    return "5-hour limit reached. Take a short break. Your burst window resets every 5 hours.";
  }
  if (lower.includes("weekly ai usage cap")) {
    return "Weekly AI usage cap reached. The cap resets every 7 days.";
  }
  if (lower.includes("chat limit reached") || lower.includes("rate limit")) {
    return "AI chat limit reached. Wait a moment, then try again.";
  }
  if (lower.includes("plan does not include this model")) {
    return "Your current plan doesn't include this model. Pick a model included in your plan, or upgrade in Account → Billing.";
  }
  return message;
}

export function agentBusyInfoFromError(error: unknown): AgentBusyInfo | undefined {
  const payload = error && typeof error === "object" && "payload" in error
    ? (error as { payload?: unknown }).payload
    : undefined;
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const run = record.activeAgentRun && typeof record.activeAgentRun === "object"
    ? record.activeAgentRun as Record<string, unknown>
    : {};
  if (!hasMeaningfulRun(run)) return undefined;
  return {
    reason: typeof record.busyReason === "string" ? record.busyReason : undefined,
    message: stringOrNull(record.error) || stringOrNull(record.message),
    runId: stringOrNull(run.id),
    title: stringOrNull(run.title),
    model: stringOrNull(run.model),
    projectId: stringOrNull(run.projectId),
    projectName: stringOrNull(run.projectName),
    projectPath: stringOrNull(run.projectPath),
    state: stringOrNull(run.state),
    progress: numberOrNull(run.progress),
    file: stringOrNull(run.file),
    startedAt: stringOrNull(run.startedAt),
    updatedAt: stringOrNull(run.updatedAt),
    elapsedSeconds: numberOrNull(run.elapsedSeconds)
  };
}

function hasMeaningfulRun(run: Record<string, unknown>) {
  return ["id", "title", "projectId", "projectName", "projectPath", "startedAt", "updatedAt", "progress"].some((key) => {
    const value = run[key];
    if (typeof value === "number") return Number.isFinite(value);
    return typeof value === "string" && value.trim() !== "";
  });
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
