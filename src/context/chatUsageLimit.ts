import { AppApiError } from "../utils/appApi";

export type ChatUsageLimit = {
  body: string;
  resetAt?: string;
  title: string;
};

let activeUsageLimit: ChatUsageLimit | null = null;

export function usageLimitMessage(limit: ChatUsageLimit) {
  return `${limit.title}. ${limit.body}`;
}

export function isChatUsageLimitText(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("usage cap")
    || lower.includes("cap reached")
    || lower.includes("limit reached")
    || lower.includes("burst window");
}

export function chatUsageLimitNotice(message: string) {
  const active = getActiveChatUsageLimit();
  if (active && isChatUsageLimitText(message)) return active;

  const lower = message.toLowerCase();
  const reset = resetLabelFromText(message);
  if (lower.includes("5-hour") || lower.includes("burst")) {
    return {
      title: "5-hour limit reached",
      body: reset ? `Take a short break. Resets at ${reset}.` : "Take a short break. Your burst window resets every 5 hours."
    };
  }
  if (lower.includes("weekly")) {
    return {
      title: "Weekly limit reached",
      body: reset ? `Your weekly AI usage cap has been reached. Resets at ${reset}.` : "Your weekly AI usage cap has been reached. It resets every 7 days."
    };
  }
  return { title: "AI limit reached", body: "Wait a moment, then try again." };
}

export function getActiveChatUsageLimit() {
  if (!activeUsageLimit) return null;
  if (activeUsageLimit.resetAt) {
    const resetTime = Date.parse(activeUsageLimit.resetAt);
    if (Number.isFinite(resetTime) && resetTime <= Date.now()) {
      activeUsageLimit = null;
      return null;
    }
  }
  return activeUsageLimit;
}

export function chatUsageLimitBlockMessage() {
  const limit = getActiveChatUsageLimit();
  return limit ? usageLimitMessage(limit) : "";
}

export function setChatUsageLimitFromError(error: unknown) {
  const limit = chatUsageLimitFromError(error);
  if (limit?.resetAt) activeUsageLimit = limit;
  return limit;
}

function chatUsageLimitFromError(error: unknown): ChatUsageLimit | null {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!isChatUsageLimitText(message)) return null;
  const payload = error instanceof AppApiError ? error.payload as Record<string, unknown> : {};
  const lower = message.toLowerCase();
  const payloadResetAt = typeof payload.burstCreditsResetAt === "string"
    ? payload.burstCreditsResetAt
    : typeof payload.weeklyCreditsResetAt === "string"
      ? payload.weeklyCreditsResetAt
      : undefined;
  const accountLimit = lower.includes("5-hour")
    || lower.includes("burst")
    || lower.includes("weekly")
    || lower.includes("usage cap");
  if (!accountLimit) return null;
  const resetAt = payloadResetAt || fallbackResetAt(lower);
  if (lower.includes("5-hour") || lower.includes("burst")) {
    return {
      title: "5-hour limit reached",
      body: `Take a short break. Resets at ${formatResetAt(resetAt)}.`,
      resetAt
    };
  }
  if (lower.includes("weekly")) {
    return {
      title: "Weekly limit reached",
      body: `Your weekly AI usage cap has been reached. Resets at ${formatResetAt(resetAt)}.`,
      resetAt
    };
  }
  return { title: "AI limit reached", body: "Wait a moment, then try again.", resetAt };
}

function fallbackResetAt(lowerMessage: string) {
  const now = Date.now();
  if (lowerMessage.includes("weekly")) return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(now + 5 * 60 * 60 * 1000).toISOString();
}

function resetLabelFromText(message: string) {
  const match = message.match(/\bResets at ([^.]+)\./i);
  return match?.[1] || "";
}

function formatResetAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
