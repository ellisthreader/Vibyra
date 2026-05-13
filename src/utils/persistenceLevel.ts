import { LevelProgress } from "./appApiTypes";

export function normalizeLevelProgress(value: unknown): LevelProgress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const level = value as Partial<LevelProgress>;
  const currentLevelXp = normalizeNumber(level.currentLevelXp, 0);
  const nextLevelXp = Math.max(1, normalizeNumber(level.nextLevelXp, 120));
  const nextReward = normalizeNextReward(level.nextReward);
  return {
    level: Math.max(1, normalizeNumber(level.level, 1)),
    xpTotal: Math.max(0, normalizeNumber(level.xpTotal, 0)),
    currentLevelXp,
    nextLevelXp,
    progress: Math.max(0, Math.min(1, normalizeNumber(level.progress, currentLevelXp / nextLevelXp))),
    dailyXpCap: normalizeNumber(level.dailyXpCap, 500),
    nextReward: nextReward && nextReward.level > 0 && nextReward.credits > 0 ? nextReward : null,
    map: normalizeLevelMap(level.map)
  };
}

function normalizeNextReward(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return {
    level: normalizeNumber((value as { level?: unknown }).level, 0),
    credits: normalizeNumber((value as { credits?: unknown }).credits, 0)
  };
}

function normalizeLevelMap(value: unknown): LevelProgress["map"] {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item): NonNullable<LevelProgress["map"]>[number] | null => {
      if (!item || typeof item !== "object") return null;
      const node = item as Record<string, unknown>;
      const status = node.status === "complete" || node.status === "current" || node.status === "locked" ? node.status : "locked";
      return {
        level: Math.max(1, normalizeNumber(node.level, 1)),
        xpTotalRequired: Math.max(0, normalizeNumber(node.xpTotalRequired, 0)),
        rewardCredits: Math.max(0, normalizeNumber(node.rewardCredits, 0)),
        status
      };
    })
    .filter((item): item is NonNullable<LevelProgress["map"]>[number] => Boolean(item));
}

function normalizeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
