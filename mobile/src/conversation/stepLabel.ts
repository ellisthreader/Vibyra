import type { AgentItem } from '../state/conversationTypes';
import type { ConversationActivity } from './types';

/**
 * What one step of an agent's work says, the way the Codex and Claude apps say
 * it: the verb in the present while it runs ("Reading app.tsx"), in the past once
 * done ("Read app.tsx"), and the thing it touched named. Every provider maps onto
 * the same operation kinds on the computer, so Codex, Claude and Gemini read alike.
 */
export type StepKind = 'command' | 'read' | 'search' | 'list' | 'edit' | 'web' | 'think' | 'plan' | 'tool';
export interface StepLabel {
  kind: StepKind;
  verb: string;
  /** The file, query or command, drawn in the text colour; `code` sets it in monospace. */
  subject?: string;
  code?: boolean;
  added?: number;
  removed?: number;
}

const fileName = (path?: string) => (path ?? '').split('/').filter(Boolean).pop() ?? path ?? '';
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const tense = (running: boolean, now: string, then: string) => (running ? now : then);
const PAST: Record<string, string> = {
  'Reading files': 'Read files', 'Searching files': 'Searched files', 'Exploring files': 'Explored files',
  'Running command': 'Ran a command', 'Updating files': 'Edited files',
};

/** A command as a person would retype it: its first line, without a leading `cd … &&`. */
export function commandText(command?: string) {
  // Codex runs each command through a login shell: `/bin/zsh -lc 'npm test'`.
  const unwrapped = /^(?:\/\S+\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec((command ?? '').trim())?.[2] ?? command ?? '';
  const line = unwrapped.split('\n')[0].replace(/^cd\s+\S+\s*&&\s*/, '').trim();
  return line.length > 64 ? `${line.slice(0, 63)}…` : line;
}

function humanTool(name: string) {
  const words = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toolArguments(detail?: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(detail ?? '');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function stepLabel(item: ConversationActivity): StepLabel {
  const source: Partial<AgentItem> = item.source ?? {};
  const running = item.status === 'running';
  const category = source.category;
  if (category === 'commandExecution') {
    const actions = source.actions ?? [];
    const every = (type: string) => actions.length > 0 && actions.every((action) => action.type === type);
    if (every('read')) {
      const files = [...new Set(actions.map((action) => fileName(action.path)))];
      return { kind: 'read', verb: tense(running, 'Reading', 'Read'), subject: files.length === 1 ? files[0] : plural(files.length, 'file') };
    }
    if (every('search')) {
      const query = actions[0].query;
      return { kind: 'search', verb: tense(running, 'Searching for', 'Searched for'), subject: query ? `“${query}”` : 'files' };
    }
    if (every('listFiles'))
      return { kind: 'list', verb: tense(running, 'Listing', 'Listed'), subject: fileName(actions[0].path) || 'files' };
    const command = commandText(source.command);
    // Older history kept only the engine's general title for a step.
    if (!command) return { kind: 'command', verb: running ? item.title : PAST[item.title] ?? item.title };
    return { kind: 'command', verb: running ? 'Running' : item.status === 'failed' ? 'Failed' : 'Ran', subject: command, code: true };
  }
  if (category === 'fileChange') {
    const changes = source.changes ?? [];
    const added = changes.reduce((sum, change) => sum + (change.added ?? 0), 0);
    const removed = changes.reduce((sum, change) => sum + (change.removed ?? 0), 0);
    const created = changes.length > 0 && changes.every((change) => change.kind?.type === 'add');
    return {
      kind: 'edit',
      verb: created ? tense(running, 'Creating', 'Created') : tense(running, 'Editing', 'Edited'),
      subject: changes.length === 1 ? fileName(changes[0].path) : changes.length ? plural(changes.length, 'file') : 'files',
      added: changes.length ? added : undefined,
      removed: changes.length ? removed : undefined,
    };
  }
  if (category === 'webSearch') {
    const query = toolArguments(item.detail).query;
    const page = typeof query === 'string' && /^https?:\/\//.test(query) ? query.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;
    return page
      ? { kind: 'web', verb: tense(running, 'Reading', 'Read'), subject: page }
      : { kind: 'web', verb: tense(running, 'Searching the web for', 'Searched the web for'), subject: typeof query === 'string' ? `“${query}”` : undefined };
  }
  if (category === 'reasoning') return { kind: 'think', verb: tense(running, 'Thinking', 'Thought') };
  if (category === 'plan') return { kind: 'plan', verb: 'Updated the plan' };
  if (category === 'mcpToolCall' || category === 'dynamicToolCall') {
    const call = toolArguments(item.detail) as { server?: string; tool?: string; arguments?: { description?: string } };
    const tool = call.tool ?? item.title;
    if (tool === 'Task')
      return { kind: 'tool', verb: tense(running, 'Delegating', 'Delegated'), subject: call.arguments?.description };
    const server = call.server && !['Claude', 'Gemini'].includes(call.server) ? humanTool(call.server) : null;
    return { kind: 'tool', verb: tense(running, 'Using', 'Used'), subject: server ? `${server} · ${humanTool(tool)}` : humanTool(tool) };
  }
  return { kind: 'tool', verb: item.title };
}

/** One line for a finished group of steps: "Read 3 files · ran 2 commands · edited 1 file". */
export function groupSummary(items: ConversationActivity[]): string {
  const counts = new Map<StepKind, number>();
  for (const item of items) {
    const kind = stepLabel(item).kind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  const explored = (counts.get('read') ?? 0) + (counts.get('search') ?? 0) + (counts.get('list') ?? 0);
  if (explored) parts.push(`explored ${plural(explored, 'file')}`);
  if (counts.get('command')) parts.push(`ran ${plural(counts.get('command')!, 'command')}`);
  const edited = new Set(items.flatMap((item) => (item.source?.category === 'fileChange' ? item.source.changes ?? [] : []).map((change) => change.path)));
  if (counts.get('edit')) parts.push(`edited ${plural(edited.size || counts.get('edit')!, 'file')}`);
  if (counts.get('web')) parts.push(`looked up ${plural(counts.get('web')!, 'page')}`);
  if (counts.get('tool')) parts.push(`used ${plural(counts.get('tool')!, 'tool')}`);
  if (!parts.length) return counts.get('think') ? 'Thought it through' : plural(items.length, 'step');
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}
