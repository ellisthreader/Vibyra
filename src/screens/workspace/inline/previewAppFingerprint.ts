import type { GeneratedApp } from "../../../types/domain";

export function previewAppFingerprint(app?: GeneratedApp | null) {
  const html = app?.html ?? "";
  let hash = 2166136261;
  for (let index = 0; index < html.length; index += 1) {
    hash ^= html.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${app?.id ?? ""}:${app?.url ?? ""}:${html.length}:${(hash >>> 0).toString(36)}`;
}
