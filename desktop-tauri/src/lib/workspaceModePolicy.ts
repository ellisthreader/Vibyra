import type { AppMode } from "../agentTypes";

/** Modes kept visible to show product direction, but not yet enterable. */
export function isWipAppMode(mode: AppMode): boolean {
  return mode === "agent" || mode === "chat";
}

export function availableAppModes(modes: AppMode[]): AppMode[] {
  return modes.filter((mode) => !isWipAppMode(mode));
}
