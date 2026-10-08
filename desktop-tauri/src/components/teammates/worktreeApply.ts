export interface ApplyConflict { path: string; reason: string }
export interface ApplyResult { applied: boolean; files: string[]; unchanged: string[]; conflicts: ApplyConflict[] }
export interface ReviewSnapshot { ready: boolean; snapshotSha256?: string; reason?: string }

const count = (n: number) => `${n} file${n === 1 ? '' : 's'}`;

/** One line describing an Apply outcome; conflicts mean nothing was written. */
export function applySummary(result: ApplyResult): string {
  if (!result.applied) {
    return `Nothing was applied. ${count(result.conflicts.length)} changed in your project since the teammate started. Resolve ${result.conflicts.length === 1 ? 'it' : 'them'}, then review again.`;
  }
  if (!result.files.length) return 'Your project already has these changes.';
  return `Applied ${count(result.files.length)} to your project as uncommitted changes. Nothing was committed.`;
}

/** Apply needs the exact fingerprint of the listing the user reviewed. */
export function applyBlocker(files: number, snapshot: ReviewSnapshot | undefined): string {
  if (!files) return '';
  if (!snapshot) return 'Refresh the review before applying.';
  if (snapshot.ready && snapshot.snapshotSha256) return '';
  return `Apply is unavailable: ${(snapshot.reason ?? 'refresh the review').replace(/publishing/gi, 'applying').replace(/publish/gi, 'apply')}`;
}
