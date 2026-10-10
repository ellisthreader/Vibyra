/**
 * Agent v2 run contract (docs/agent-v2-api-contract.md), shared by the iPhone and
 * the Mac. Pure data and injected I/O only: it imports only other pure files of this folder,
 * so the Mac's node tests load it directly (through `npm test`'s extensionless-import hook).
 */
import { providerName } from './providerLabels';

export type RunState =
  | 'queued' | 'waiting_for_computer' | 'starting' | 'running' | 'waiting_for_tool'
  | 'waiting_for_approval' | 'waiting_for_signin' | 'paused_by_limits'
  | 'completed' | 'failed' | 'cancelled' | 'outcome_unknown';
export interface RunAction {
  id: string; callId: string; tool: string; kind: 'read' | 'write' | 'none'; connectionId: string | null;
  /** The server names both (contract §6d); a client never works them out from the tool name. */
  provider?: string | null; account?: string | null;
  state: string; summary: string | null; arguments?: Record<string, unknown> | null;
  fingerprint?: string | null; expiresAt?: string | null;
  receipt?: { status: string; providerResourceId?: string | null; summary?: string | null } | null;
}
export interface Run {
  job?: import('./jobsModel').JobMetadata;
  outputs?: import('./outputModel').AgentOutput[];
  id: string; agentId: string; conversationId: string; conversationSeq: number; idempotencyKey: string;
  state: RunState; stateReason: string | null; terminal: boolean; prompt: string; answer: string | null;
  runtime?: { id?: string; bindingId?: string; executionTarget?: 'local' | 'cloud'; accountId?: string; provider?: string | null; model?: string | null } | null; eventCursor: number;
  /** Always `connected_account` on v2: the model runs on the person's own AI account and spends no Vibyra tokens. */
  fundingSource?: string;
  attachments?: { id?: string; name: string; mimeType?: string; size?: number; kind?: string }[];
  actions: RunAction[]; createdAt: string;
}
export interface RunEvent { seq: number; type: string; payload: Record<string, any> }
export interface EventsPage { events: RunEvent[]; nextCursor: number; state: string; terminal: boolean; latestSeq: number }
/** An uploaded file, named by the id `POST /attachments` returned. */
export interface AttachmentRef { id: string }
export interface RunBody { agentId: string; idempotencyKey: string; prompt: string; attachments: AttachmentRef[]; runtimeId?: string; executionMode?: 'independent' | 'ordered' }
export interface RunFeed {
  cursor: number; text: string; final: string | null; status: string | null; signin: Record<string, any> | null;
  /** The tool call in flight (from `tool.requested`), cleared by its result; `provider` comes from the event. */
  using: { provider: string | null; tool: string } | null;
  /** Provider per action id, from the journal's own `payload.provider`. */
  providers: Record<string, string>;
}
export type TurnStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export interface RunTool {
  id: string; operation: string; integration: string; account?: string | null; /** The connection the call runs as; cards show its short id when several accounts are granted. */ connectionId?: string | null;
  summary: string | null; expiresAt: number; decision: null; v2: true;
  approval: { state: string; fingerprint: string; arguments: Record<string, unknown>; answer: 'allow' | 'decline' | null } | null;
}
export interface RunTurn {
  outputs?: import('./outputModel').AgentOutput[];
  id: string; chatId: string; model: string; status: TurnStatus; prompt: string; response: string | null;
  error: string | null; notice: string | null; tools: RunTool[]; createdAt: string; reserved: 0; charged: 0; v2: true;
  fundingSource: 'connected_account';
  attachments: { id: string; kind: 'image' | 'pdf' | 'text'; name: string; bytes: number }[];
}

export const emptyFeed = (): RunFeed => ({ cursor: 0, text: '', final: null, status: null, signin: null, using: null, providers: {} });
const ACTIVE_FAST = ['running', 'starting', 'waiting_for_tool'];

/** Contract backoff: 1 s working, 10 s waiting for the Mac, 3 s other waits, 5 s idle. */
export function pollDelay(states: string[]): number {
  if (states.some(s => ACTIVE_FAST.includes(s))) return 1000;
  const live = states.filter(s => !['completed', 'failed', 'cancelled', 'outcome_unknown'].includes(s));
  if (!live.length) return 5000;
  return live.every(s => s === 'waiting_for_computer') ? 10000 : 3000;
}

/** Applies a page gap-free: an event is taken only when it is exactly the next `seq`. */
export function applyEvents(feed: RunFeed, events: RunEvent[]): RunFeed {
  let next = { ...feed };
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.seq <= next.cursor) continue;
    if (event.seq !== next.cursor + 1) break;
    const p = event.payload ?? {};
    if (event.type === 'message.delta' && typeof p.text === 'string') next.text += p.text;
    else if (event.type === 'message.final' && typeof p.text === 'string') next.final = p.text;
    else if (event.type === 'status' && typeof p.text === 'string') next.status = p.text || null;
    else if (event.type === 'run.waiting_signin') next.signin = p;
    else if (event.type === 'run.state' && p.to === 'running') next.signin = null;
    else if (event.type === 'tool.requested' || event.type === 'tool.result' || event.type === 'tool.refused' || event.type === 'approval.requested') {
      const provider = typeof p.provider === 'string' && p.provider ? p.provider : null;
      if (provider && typeof p.actionId === 'string') next.providers = { ...next.providers, [p.actionId]: provider };
      if (event.type === 'tool.requested' && typeof p.tool === 'string') next.using = { provider, tool: p.tool };
      else if (event.type !== 'approval.requested') next.using = null;
    }
    next = { ...next, cursor: event.seq };
  }
  return next;
}

export function turnStatus(state: string): TurnStatus {
  if (['queued', 'waiting_for_computer', 'starting'].includes(state)) return 'queued';
  if (['running', 'waiting_for_tool'].includes(state)) return 'running';
  if (['waiting_for_approval', 'waiting_for_signin', 'paused_by_limits'].includes(state)) return 'waiting';
  if (state === 'completed' || state === 'cancelled') return state;
  return 'failed';
}

/** One plain line for states the transcript cannot show by itself. */
export function runNotice(run: Pick<Run, 'state' | 'stateReason' | 'runtime'>, feed?: RunFeed | null): string | null {
  switch (run.state) {
    case 'waiting_for_computer': return run.runtime?.executionTarget === 'cloud' ? 'Waiting for your Cloud computer to start within the approved allowance.' : 'Waiting for your Mac. Open Vibyra on it to start this task.';
    case 'waiting_for_signin': {
      const s = feed?.signin;
      return s?.scope === 'connection' && s.provider
        ? `Reconnect ${providerName(s.provider)} in Settings → Integrations to continue.`
        : run.runtime?.executionTarget === 'cloud' ? 'Sign in to the selected Cloud AI account in Cloud settings to continue.' : 'Sign in to the AI account on your Mac to continue.';
    }
    case 'paused_by_limits': return run.runtime?.executionTarget === 'cloud' ? 'Paused by the selected Cloud account’s usage limits. Check your account and allowance before continuing.' : 'Paused by your AI account’s usage limits. It continues on your Mac when they reset.';
    case 'failed': return `Could not finish${run.stateReason ? ` · ${run.stateReason}` : '.'}`;
    case 'outcome_unknown': return 'Outcome unconfirmed. Check the connected service before repeating this task.';
    case 'running': case 'waiting_for_tool':
      return feed?.status ?? (feed?.using?.provider ? `Using ${providerName(feed.using.provider)}…` : null);
    default: return null;
  }
}

const APPROVAL: Record<string, string> = { pending_approval: 'pending', approved: 'queued' };
const ANSWER: Record<string, 'allow' | 'decline'> = { approved: 'allow', dispatching: 'allow', completed: 'allow', unknown: 'allow', declined: 'decline' };

/** The provider the server named for this action (its own field, else the journal's event); never a guess from the tool name. */
export const actionProvider = (action: RunAction, feed?: RunFeed | null): string => action.provider ?? feed?.providers?.[action.id] ?? '';

export function actionTool(action: RunAction, feed?: RunFeed | null): RunTool {
  const at = action.expiresAt ? Date.parse(action.expiresAt) : NaN;
  return {
    id: action.id, operation: action.tool, integration: actionProvider(action, feed), account: action.account ?? null, connectionId: action.connectionId ?? null, decision: null, v2: true,
    summary: action.receipt?.summary ?? action.summary ?? null, expiresAt: Number.isFinite(at) ? at / 1000 : 0,
    approval: action.kind === 'write' ? { state: APPROVAL[action.state] ?? action.state,
      fingerprint: action.fingerprint ?? '', arguments: action.arguments ?? {}, answer: ANSWER[action.state] ?? null } : null,
  };
}

export function runToTurn(run: Run, feed?: RunFeed | null): RunTurn {
  const partial = feed?.final ?? (feed?.text || null);
  return {
    id: run.id, chatId: run.conversationId, model: run.runtime?.model ?? 'auto', status: turnStatus(run.state),
    prompt: run.prompt, response: run.answer ?? partial, error: null, notice: runNotice(run, feed),
    tools: (run.actions ?? []).map(a => actionTool(a, feed)), createdAt: run.createdAt, reserved: 0, charged: 0, v2: true,
    outputs: run.outputs ?? [], fundingSource: 'connected_account', attachments: (run.attachments ?? []).map(attachmentOf),
  };
}

const mimeKind = (mime?: string): 'image' | 'pdf' | 'text' => (mime?.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'text');
function attachmentOf(a: NonNullable<Run['attachments']>[number], index: number) {
  return { id: a.id ?? `attachment-${index}`, kind: (a.kind as 'image' | 'pdf' | 'text') ?? mimeKind(a.mimeType), name: a.name, bytes: a.size ?? 0 };
}

/** v2 only when the server answers its own client route; every refusal keeps v1. */
export function modeFromProbe(status: number | null): { mode: 'v1' | 'v2'; final: boolean } {
  if (status !== null && status >= 200 && status < 300) return { mode: 'v2', final: true };
  return { mode: 'v1', final: status === 401 || status === 403 || status === 404 || status === 503 };
}

export { runBody, parseRunBody, confirmedRun, submitRun, type SubmitDeps } from './runAdmission';
