export type PlanFeature = 'terminals' | 'projects' | 'worktrees' | 'preview' | 'review' | 'agents' | 'cloud';
export interface PlanLimitNotice { feature: PlanFeature; message: string }

// The computer marks a plan limit as `plan-limit:<feature>: <message>`, so the
// phone can offer Pro instead of showing a failure, wherever the text arrives.
const MARKER = /plan-limit:(terminals|projects|worktrees|preview|review|agents|cloud): ([^\n]+?)(?:\)|$)/;

export function planLimitFrom(error: unknown): PlanLimitNotice | null {
  const match = MARKER.exec(String(error ?? ''));
  return match ? { feature: match[1] as PlanFeature, message: match[2].trim() } : null;
}

