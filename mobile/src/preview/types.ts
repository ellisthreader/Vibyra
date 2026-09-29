export interface PreviewTarget {
  grantId: string;
  projectId: string;
  targetId: string;
  name?: string | null;
  running?: boolean;
  worktree?: boolean;
  /** Candidate metadata only; this is not an authorization to capture. */
  approvalRequired?: boolean;
  kind?: string | null;
}
export interface PreviewList {
  targets: PreviewTarget[];
  windowHandoffV1?: boolean;
  /** Desktop apps the computer can run; separate from the approved targets. */
  runnable?: import('./runnable').PreviewRunnable[];
  previewRunV1?: boolean;
  /** `macos`, `windows`, `linux` or another short token. */
  hostPlatform?: string;
  windowProblem?: string;
}

export function validPreviewTarget(value: unknown): value is PreviewTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as PreviewTarget;
  return typeof target.grantId === 'string' && /^[0-9a-f]{32}$/.test(target.grantId)
    && typeof target.projectId === 'string' && typeof target.targetId === 'string'
    && (target.name == null || typeof target.name === 'string')
    && (target.running == null || typeof target.running === 'boolean')
    && (target.approvalRequired == null || typeof target.approvalRequired === 'boolean')
    && (!target.approvalRequired || /^native-window:[1-9][0-9]*:[1-9][0-9]*:view$/.test(target.targetId));
}
