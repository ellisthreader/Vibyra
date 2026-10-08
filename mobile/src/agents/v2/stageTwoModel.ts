import type { AgentDraft, AgentOutput, DraftSelection, OutputExport } from './outputModel';
import type { Run } from './runCore';

export interface Instruction { revision: number; text: string; createdAt: string }
export interface SteeredRun extends Run {
  instructionRevision: number; appliedInstructionRevision: number; instructions: Instruction[];
}
export interface MemoryFact {
  id: string; fact: string; key: string; sourceKind: 'user' | 'document'; sourceLabel: string;
  sourceRunId: string | null; status: string; revision: number; createdAt: string; updatedAt: string; expiresAt: string | null;
}
export interface MemoryPage { memories: MemoryFact[]; runtimeId: string; accountScope: string; accountLabel?: string }
export type MemoryAction = 'accept' | 'undo' | 'correct' | 'forget';
export type StageTwoCall = <T>(path: string, body?: unknown, method?: 'PATCH' | 'PUT' | 'DELETE') => Promise<T>;
const enc = encodeURIComponent;
export function stageTwoClient(call: StageTwoCall) {
  return {
    draft: async (id: string) => (await call<{ draft: AgentDraft }>(`agents/v2/actions/${enc(id)}/draft`)).draft,
    editDraft: async (item: AgentDraft, args: AgentDraft['arguments'], selection: DraftSelection = {}) =>
      (await call<{ draft: AgentDraft }>(`agents/v2/actions/${enc(item.id)}/draft`, { revision: item.revision, fingerprint: item.fingerprint, arguments: { to: args.to, subject: args.subject, body: args.body }, ...selection }, 'PATCH')).draft,
    outputs: async (agent: string) => (await call<{ outputs: AgentOutput[] }>(`agents/v2/teammates/${enc(agent)}/outputs`)).outputs,
    output: async (id: string) => (await call<{ output: AgentOutput }>(`agents/v2/outputs/${enc(id)}`)).output,
    editOutput: async (item: AgentOutput, title: string, content: AgentOutput['content']) =>
      (await call<{ output: AgentOutput }>(`agents/v2/outputs/${enc(item.id)}`, { revision: item.revision, title, content }, 'PATCH')).output,
    exportOutput: async (id: string) => (await call<{ export: OutputExport }>(`agents/v2/outputs/${enc(id)}/export`)).export,
    run: async (id: string) => (await call<{ run: SteeredRun }>(`agents/v2/runs/${enc(id)}`)).run,
    steer: async (id: string, body: { idempotencyKey: string; expectedRevision: number; text: string }) =>
      (await call<{ run: SteeredRun }>(`agents/v2/runs/${enc(id)}/instructions`, body)).run,
    memories: (agent: string, runtimeId?: string) => call<MemoryPage>(`agents/v2/teammates/${enc(agent)}/memories${runtimeId ? `?runtimeId=${enc(runtimeId)}` : ''}`),
    remember: async (agent: string, runtimeId: string, accountScope: string, fact: string) =>
      (await call<{ memory: MemoryFact }>(`agents/v2/teammates/${enc(agent)}/memories`, { runtimeId, accountScope, fact })).memory,
    memory: async (agent: string, runtimeId: string, accountScope: string, item: MemoryFact, action: MemoryAction, fact?: string) =>
      (await call<{ memory: MemoryFact }>(`agents/v2/teammates/${enc(agent)}/memories/${enc(item.id)}`,
        { runtimeId, accountScope, revision: item.revision, action, ...(fact === undefined ? {} : { fact }) }, 'PATCH')).memory,
  };
}
export type StageTwoApi = ReturnType<typeof stageTwoClient>;

/** Mobile errors carry status; the native Desktop bridge preserves it in its bounded HTTP prefix. */
export function confirmedSteeringRefusal(error: unknown): boolean {
  const row = error as { status?: number; message?: string; code?: string } | null;
  const text = typeof error === 'string' ? error : row?.message ?? '';
  const status = row?.status ?? Number(/^([45]\d{2}):/.exec(text)?.[1]);
  return [400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422].includes(status);
}

export function instructionState(run: Pick<SteeredRun, 'terminal' | 'instructionRevision' | 'appliedInstructionRevision'>): 'none' | 'waiting' | 'applied' | 'not_applied' {
  if (!run.instructionRevision) return 'none';
  if (run.appliedInstructionRevision >= run.instructionRevision) return 'applied';
  return run.terminal ? 'not_applied' : 'waiting';
}
