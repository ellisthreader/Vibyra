import type { Project } from "../types/domain";

export function mergeRememberedProject(existing: Project | undefined, incoming: Project): Project {
  if (!existing) return incoming;
  const savedBrief = existing.brief;
  return {
    ...incoming,
    ...existing,
    name: incoming.name || existing.name,
    path: incoming.path || existing.path,
    source: incoming.source ?? existing.source,
    updated: incoming.updated || existing.updated,
    analysis: incoming.analysis ?? existing.analysis,
    stack: savedBrief ? existing.stack : incoming.stack || existing.stack,
    brief: savedBrief ?? incoming.brief,
    detectedBrief: savedBrief ? (existing.detectedBrief ?? incoming.detectedBrief) : (incoming.detectedBrief ?? existing.detectedBrief),
    briefRequired: savedBrief ? false : (incoming.briefRequired ?? existing.briefRequired),
    briefRequiredFilePath: savedBrief ? undefined : (incoming.briefRequiredFilePath ?? existing.briefRequiredFilePath),
    briefedFilePaths: existing.briefedFilePaths ?? incoming.briefedFilePaths
  };
}
