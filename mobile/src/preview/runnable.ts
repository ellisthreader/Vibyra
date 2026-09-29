/** A project app or website the computer can run for a project (`preview.list` `runnable`). */
export type RunState =
  'idle' | 'building' | 'waiting_for_window' | 'ready' | 'exited' | 'failed' | 'timed_out' | 'stopped';
export interface PreviewRunnable {
  projectId: string;
  targetId: string;
  name: string;
  framework: string;
  kind?: 'web' | 'window';
  command: string | null;
  /** A display folder such as `HKE/app`, never a full path. */
  cwd: string;
  /** The package script body the command runs. */
  body: string | null;
  approvalRequired: boolean;
  /** An approval existed, but the command or its files changed since. */
  changed: boolean;
  commandVersion: string;
  runState: RunState;
  stage?: string | null;
  logTail?: string[];
  error?: string | null;
  runId?: string;
  /** The view-only window grant the computer made for the device that pressed Run. */
  windowGrantId?: string | null;
  autoOpen?: boolean;
}
/** `preview.run` answers with this when nothing ran: show the command and ask. */
export interface RunApproval {
  approvalRequired: true;
  changed: boolean;
  name: string;
  command: string | null;
  cwd: string;
  body: string | null;
  commandVersion: string;
  targetId: string;
}
export interface RunSummary {
  runId: string;
  targetId: string;
  name: string;
  runState: RunState;
  stage?: string | null;
  logTail?: string[];
  error?: string | null;
}

const STATES: readonly string[] = ['idle', 'building', 'waiting_for_window', 'ready', 'exited', 'failed', 'timed_out', 'stopped'];
/** The states a Stop button applies to: the computer still owns a process. */
export const ACTIVE_RUN: readonly RunState[] = ['building', 'waiting_for_window', 'ready'];

const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const optionalText = (value: unknown, max: number) => value == null || text(value, max);
const hex = (value: unknown, size: number) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${size}}$`).test(value);
export const validRunTargetId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value);
const validLogTail = (value: unknown) => value == null ||
  (Array.isArray(value) && value.length <= 3 && value.every(line => text(line, 200)));
const validState = (value: unknown): value is RunState => typeof value === 'string' && STATES.includes(value);

function validCommand(value: Record<string, unknown>): boolean {
  return validRunTargetId(value.targetId) && text(value.name, 200) && hex(value.commandVersion, 16)
    && optionalText(value.command, 300) && text(value.cwd, 300) && optionalText(value.body, 4000)
    && typeof value.changed === 'boolean';
}

/** Strict: a malformed row is dropped, never shown as something the phone could run. */
export function validPreviewRunnable(value: unknown): value is PreviewRunnable {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.projectId === 'string' && row.projectId.length > 0 && validCommand(row)
    && (row.kind == null || row.kind === 'web' || row.kind === 'window')
    && text(row.framework, 100) && typeof row.approvalRequired === 'boolean' && validState(row.runState)
    && optionalText(row.stage, 200) && validLogTail(row.logTail) && optionalText(row.error, 2000)
    && (row.runId == null || hex(row.runId, 32))
    && (row.windowGrantId == null || hex(row.windowGrantId, 32))
    && (row.autoOpen == null || typeof row.autoOpen === 'boolean');
}

export function validRunApproval(value: unknown): value is RunApproval {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.approvalRequired === true && validCommand(row);
}

export function validRunSummary(value: unknown): value is RunSummary {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return hex(row.runId, 32) && validRunTargetId(row.targetId) && text(row.name, 200) && validState(row.runState)
    && optionalText(row.stage, 200) && validLogTail(row.logTail) && optionalText(row.error, 2000);
}
