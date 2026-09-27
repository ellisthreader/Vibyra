import type { Project } from '../ui/types';
import type { ScaffoldRequest } from './command';

/**
 * What the computer answers when asked to start a project, as the Host's
 * `scaffold.*` methods and events say it (host/docs/protocol.md). The sample
 * workspace answers the same shape from memory.
 */
export interface ScaffoldPreflight {
  /** Executable name → on the computer's PATH. */
  tools: Record<string, boolean>;
  /** The computer user's home folder, for showing paths as `~/…`. */
  home: string;
  /** Where new projects go by default: beside most of the shared ones. */
  parent: string;
}

export type ScaffoldPhase = 'running' | 'done' | 'failed' | 'stalled' | 'cancelled';

export interface ScaffoldProgress {
  index: number;
  total: number;
  label: string;
}

export type ScaffoldEvent =
  | { type: 'step'; runId: string; index: number; total: number; label: string }
  | { type: 'output'; runId: string; lines: string[] }
  | {
      type: 'done';
      runId: string;
      ok: boolean;
      message: string | null;
      stalled: boolean;
      project: Project | null;
    };

export interface ScaffoldStatus {
  runId: string;
  dir: string;
  phase: ScaffoldPhase;
  progress: ScaffoldProgress | null;
  lines: string[];
  error: string | null;
  project: Project | null;
}

export interface ScaffoldActions {
  preflight(tools: string[]): Promise<ScaffoldPreflight>;
  /** Answers as soon as the build has started; the rest arrives through `follow`. */
  start(runId: string, plan: ScaffoldRequest): Promise<void>;
  cancel(runId: string): Promise<void>;
  status(runId: string): Promise<ScaffoldStatus>;
  /** Shares the folder as it stands, after a stall or a partial failure. */
  adopt(dir: string): Promise<Project>;
  /** Every build event the computer sends. Returns the way to stop listening. */
  follow(listener: (event: ScaffoldEvent) => void): () => void;
}
