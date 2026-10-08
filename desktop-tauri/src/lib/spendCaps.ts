/**
 * The person's own spending limits as the backend reports them, in whole Vibyra tokens.
 * `null` means the server does not offer limits (an older one, or the flag off) and the
 * Settings card draws nothing.
 */
export type CapKind = "day" | "month";

export interface SpendMeter {
  limit: number | null;
  used: number;
  raisedBy: number;
  /** "00:00 tomorrow" or "1 November", worded by the server in the person's own timezone. */
  resetsLabel: string;
}

export interface SpendCaps {
  presets: number[];
  maxTokens: number;
  day: SpendMeter;
  month: SpendMeter;
  run: { limit: number | null };
  alerts: boolean;
  cloud: { hasIncludedHours: boolean; whenHoursRunOut: "default" | "tokens" | "stop"; default: "tokens" | "stop" };
}

export interface SpendCapsChange {
  day?: number | null;
  month?: number | null;
  run?: number | null;
  alerts?: boolean;
  cloudIncludedHours?: "tokens" | "stop" | null;
  timezone?: string;
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

function meter(value: unknown): SpendMeter | null {
  const m = (value ?? {}) as Record<string, unknown>;
  const used = num(m.used);
  if (used === null || typeof m.resetsLabel !== "string") return null;
  return { limit: num(m.limit), used, raisedBy: num(m.raisedBy) ?? 0, resetsLabel: m.resetsLabel };
}

export function normalizeSpendCaps(value: unknown): SpendCaps | null {
  const v = (value ?? {}) as Record<string, any>;
  if (v.enabled !== true) return null;
  const day = meter(v.day);
  const month = meter(v.month);
  if (!day || !month) return null;
  const cloud = v.cloud ?? {};
  return {
    presets: Array.isArray(v.presets) ? v.presets.filter((p: unknown): p is number => typeof p === "number" && p > 0) : [25, 50, 100],
    maxTokens: num(v.maxTokens) ?? 100000,
    day,
    month,
    run: { limit: num(v.run?.limit) },
    alerts: v.alerts !== false,
    cloud: {
      hasIncludedHours: cloud.hasIncludedHours === true,
      whenHoursRunOut: cloud.whenHoursRunOut === "tokens" || cloud.whenHoursRunOut === "stop" ? cloud.whenHoursRunOut : "default",
      default: cloud.default === "stop" ? "stop" : "tokens",
    },
  };
}

/** "12 of 50": a whole number reads as one, a fraction keeps two places. */
export const tokens = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100).toLocaleString();
