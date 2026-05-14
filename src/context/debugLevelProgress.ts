import { LevelMapNode, LevelProgress } from "../utils/appApi";

export function makeNextDebugLevel(current?: LevelProgress): LevelProgress {
  const nextLevel = Math.max(2, (current?.level ?? 1) + 1);
  const previousRequired = requiredXpForLevel(nextLevel);
  const nextRequired = requiredXpForLevel(nextLevel + 1);
  const map = current?.map?.length ? updateMap(current.map, nextLevel) : createDebugMap(nextLevel);
  const nextReward = map.find((node) => node.level > nextLevel && node.rewardCredits > 0);

  return {
    currentLevelXp: 0,
    dailyXpCap: current?.dailyXpCap,
    level: nextLevel,
    map,
    nextLevelXp: Math.max(120, nextRequired - previousRequired),
    nextReward: nextReward ? { level: nextReward.level, credits: nextReward.rewardCredits } : null,
    progress: 0,
    xpTotal: Math.max(current?.xpTotal ?? 0, previousRequired)
  };
}

function requiredXpForLevel(level: number) {
  return 120 * Math.max(0, level - 1) * Math.max(0, level - 1);
}

function createDebugMap(currentLevel: number): LevelMapNode[] {
  return Array.from({ length: Math.max(20, currentLevel + 6) }, (_, index) => {
    const level = index + 1;
    return {
      level,
      rewardCredits: rewardCreditsForLevel(level),
      status: level < currentLevel ? "complete" : level === currentLevel ? "current" : "locked",
      xpTotalRequired: requiredXpForLevel(level)
    };
  });
}

function rewardCreditsForLevel(level: number) {
  return ({ 2: 5, 3: 10, 5: 25, 8: 50, 13: 100, 20: 150 } as Record<number, number>)[level] ?? 0;
}

function updateMap(map: LevelMapNode[], currentLevel: number) {
  return map.map((node) => ({
    ...node,
    status: node.level < currentLevel ? "complete" as const : node.level === currentLevel ? "current" as const : "locked" as const
  }));
}
