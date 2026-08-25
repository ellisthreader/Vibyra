import type { AiLimits, AiUsage } from "../types";
import type { NotificationInput } from "../notificationTypes";

// Spend guardrails are enforced in Rust before every billed call; this only
// warns beforehand, so the first the user hears of a cap is not a refusal.

export type SpendTier = "none" | "near" | "reached";

/** Warn once at four-fifths, then again when the cap actually bites. */
const NEAR = 0.8;

function tier(used: number, cap: number): SpendTier {
  if (cap <= 0) return "none"; // zero disables that cap entirely
  if (used >= cap) return "reached";
  return used >= cap * NEAR ? "near" : "none";
}

/** The higher of the daily and monthly pressures — whichever bites first. */
export function spendTier(usage: AiUsage, limits: AiLimits): SpendTier {
  const daily = tier(usage.spendTodayUsd, limits.dailySpendUsd);
  const monthly = tier(usage.spendMonthUsd, limits.monthlySpendUsd);
  if (daily === "reached" || monthly === "reached") return "reached";
  return daily === "near" || monthly === "near" ? "near" : "none";
}

export function spendNotification(next: SpendTier): NotificationInput | null {
  if (next === "none") return null;
  if (next === "near") {
    return {
      kind: "spend",
      tier: "risk",
      title: "You are close to your AI spend cap",
      body: "Vibyra AI stops making billed calls once the cap is reached.",
      dedupeKey: "aiSpend:near",
      osEligible: false,
      action: { id: "openAiSettings", label: "Review limits" },
    };
  }
  return {
    kind: "spend",
    tier: "fail",
    title: "AI spend cap reached",
    body: "Chat and dictation are paused until the cap resets or you raise it.",
    dedupeKey: "aiSpend:reached",
    action: { id: "openAiSettings", label: "Review limits" },
  };
}
