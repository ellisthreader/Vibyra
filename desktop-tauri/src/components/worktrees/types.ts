export interface Worktree {
  root: string; directory: string; branch: string; available: boolean;
  isMain: boolean; upstream: string | null;
}
export interface WorktreeInventory { repository: string | null; worktrees: Worktree[] }
export interface TreeSession { id: string; directory: string; title: string; state: string }
export interface TreeChanges { count: number | null; conflict: boolean; error: string }
export interface PreviewScope { root: string; title: string }
