const args = { to: 'qa@example.test', subject: 'Initial subject', body: 'Initial body' };
let revision = 1, lost = false;
const at = new Date(Date.now() + 600000).toISOString();
const run: any = { id: 'run-1', agentId: 'agent-1', conversationId: 'chat-1', conversationSeq: 1, idempotencyKey: 'key-1', state: 'waiting_for_approval', stateReason: null, terminal: false, prompt: 'Draft a test email', answer: null, runtime: { model: 'fixture' }, eventCursor: 1, createdAt: new Date().toISOString(), actions: [{ id: 'action-1', callId: 'call-1', tool: 'gmail_send', kind: 'write', connectionId: 'connection-1', provider: 'gmail', account: 'sender@example.test', state: 'pending_approval', summary: null, arguments: args, fingerprint: 'a'.repeat(64), expiresAt: at, receipt: null }] };
const calls: any[] = [];
const senders = [{ connectionId: 'connection-1', account: 'sender@example.test' }, { connectionId: 'connection-2', account: 'work@example.test' }];
const uploads = new Map<string, any>();
export async function uploadDraftFile(file: File) {
  const item = { id: `upload-${uploads.size + 1}`, name: file.name, mimeType: file.type, size: file.size, sha256: 'b'.repeat(64) };
  uploads.set(item.id, item); calls.push({ path: 'attachments', method: 'UPLOAD' }); return item;
}
Object.assign(window, { draftFixture: { calls, loseNext: () => { lost = true; } } });
export const currentRun = () => structuredClone(run);
export const message = (e: unknown) => e instanceof Error ? e.message : String(e);
export async function teammateApi<T>(path: string, body?: any, method = body ? 'POST' : 'GET'): Promise<T> {
  calls.push({ path, body, method });
  const action = run.actions[0];
  if (path.endsWith('/draft')) {
    if (body) {
      if (body.revision !== revision || body.fingerprint !== action.fingerprint) throw new Error('409: draft_changed');
      revision++; const sender = senders.find(item => item.connectionId === (body.connectionId ?? action.connectionId));
      if (!sender) throw new Error('Unknown sender');
      action.connectionId = sender.connectionId; action.account = sender.account;
      action.arguments = { ...body.arguments, attachments: (body.attachmentIds ?? []).map((id: string) => uploads.get(id)) }; action.fingerprint = String(revision).repeat(64); run.eventCursor++;
      if (lost) { lost = false; throw new Error('Connection lost after saving draft'); }
    }
    return structuredClone({ draft: { id: action.id, runId: run.id, agentId: run.agentId, revision, state: action.state, account: action.account, connectionId: action.connectionId, senders, attachments: action.arguments.attachments ?? [], editableFields: ['from', 'to', 'subject', 'body', 'attachments'], arguments: action.arguments, fingerprint: action.fingerprint, expiresAt: at } }) as T;
  }
  if (path.endsWith('/decision')) {
    if (body.fingerprint !== action.fingerprint) throw new Error('Stale approval fingerprint');
    action.state = body.decision === 'allow' ? 'completed' : 'declined'; run.state = 'running'; return {} as T;
  }
  return { run: currentRun() } as T;
}
