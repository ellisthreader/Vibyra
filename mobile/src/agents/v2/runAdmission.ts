import type { Run, RunBody, AttachmentRef } from './runCore';

export function runBody(agentId: string, idempotencyKey: string, prompt: string, attachments: string[] = [], runtimeId?: string, executionMode?: RunBody['executionMode']): RunBody {
  return { agentId, idempotencyKey, prompt, attachments: attachments.map(id => ({ id })), ...(runtimeId ? { runtimeId } : {}), ...(executionMode ? {executionMode} : {}) };
}
/** A persisted send is replayable only if it is exactly a v2 admission body for its own key. */
export function parseRunBody(raw: string, key: string): RunBody | null {
  try {
    const b = JSON.parse(raw);
    return b && typeof b === 'object' && b.idempotencyKey === key && typeof b.agentId === 'string'
      && (b.runtimeId === undefined || (typeof b.runtimeId === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(b.runtimeId)))
      && (b.executionMode === undefined || b.executionMode === 'independent' || b.executionMode === 'ordered')
      && typeof b.prompt === 'string' && Array.isArray(b.attachments)
      && b.attachments.every((a: unknown) => a && typeof a === 'object' && typeof (a as AttachmentRef).id === 'string') ? b : null;
  } catch { return null; }
}

export function confirmedRun(run: Run | undefined, body: RunBody): Run {
  if (!run || (body.executionMode !== undefined && run.job?.mode !== body.executionMode) || run.idempotencyKey !== body.idempotencyKey || run.agentId !== body.agentId || run.prompt !== body.prompt
    || (body.runtimeId === undefined && run.runtime?.executionTarget === 'cloud')
    || (body.runtimeId !== undefined && (run.runtime?.id ?? run.runtime?.bindingId) !== body.runtimeId))
    throw new Error('The send receipt does not match this conversation. Refresh to check the outcome.');
  return run;
}

export interface SubmitDeps { admit(body: RunBody): Promise<Run>; list(agentId: string): Promise<Run[]>; status(error: unknown): number | null; lookup?(agentId:string,key:string):Promise<Run[]> }
/**
 * Sends the exact persisted body. Transport loss or 5xx keeps it for an identical
 * retry. A 4xx releases it only after the conversation confirms no run holds the key.
 */
export async function submitRun(body: RunBody, deps: SubmitDeps, released: () => void): Promise<Run> {
  try { return confirmedRun(await deps.admit(body), body); } catch (error) {
    const status = deps.status(error);
    if (status === null || status < 400 || status >= 500) throw error;
    let runs: Run[];
    try { if(body.executionMode==='independent'&&!deps.lookup)throw error; runs = deps.lookup ? await deps.lookup(body.agentId,body.idempotencyKey) : await deps.list(body.agentId); } catch { throw error; }
    const found = runs.find(r => r.idempotencyKey === body.idempotencyKey);
    if (!found) { released(); throw error; }
    return confirmedRun(found, body);
  }
}
