import type { AgentsApi, Teammate } from '../src/agents/types';
import { VibesError } from '../src/vibes/api';
import type { VibesApi, VibesTurn } from '../src/vibes/types';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';

const query = new URLSearchParams(location.search);
const teammate = (id: string, name: string, avatar: Teammate['avatar']): Teammate => ({ id, chatId: `chat-${id}`, name, avatar,
  brief: 'Review the website and prepare improvements.', memory: '', integrations: ['github'], budget: 5, revision: 1, archived: false,
  status: id === 'site' ? 'needs_approval' : 'idle', lastMessage: id === 'site' ? 'The opening-hours change is ready for review.' : 'Ready for your first task.',
  updatedAt: '2026-09-15T10:00:00Z', lastRunId: id === 'site' ? 'turn-site' : null });
let teammates = query.has('empty') ? [] : [teammate('site', 'Website helper', 'site'), teammate('review', 'Code reviewer', 'review')];
const turns: VibesTurn[] = [{ id: 'turn-site', chatId: 'chat-site', model: 'auto', status: 'waiting', prompt: 'Prepare the opening-hours update.',
  response: 'The proposed update is ready. Review the repository, path, and content before it is written.', error: null, reserved: 5, charged: 0, createdAt: '2026-09-15T10:00:00Z',
  tools: [{ id: 'decision-site', operation: 'update_file', integration: 'github', decision: null, summary: 'Review this action before it runs.', expiresAt: Date.now() / 1000 + 900,
    approval: { state: 'pending', fingerprint: 'a'.repeat(64), arguments: { repository: 'bakery/website', path: 'opening-hours.json', content: '{"sunday":"09:00–16:00"}' }, answer: null } }] }];
export const calls: unknown[] = []; let createFailed = false; let decisionFailed = false;
export const agentsApi: AgentsApi = {
  list: async () => ({ version: 1, enabled: !query.has('paused'), teammates: structuredClone(teammates) }),
  chats: async id => [{ id: `chat-${id}`, title: teammates.find(a => a.id === id)?.name ?? '', trial_slot: null, trial_used: 0 }],
  save: async (fields, target) => {
    calls.push({ action: 'save', ...target, fields });
    let a = teammates.find(a => a.id === target.id);
    if (!a) { a = { ...teammate(target.id, fields.name, fields.avatar), ...fields }; teammates.push(a); }
    else if (target.revision !== undefined) { a = { ...a, ...fields, revision: a.revision + 1 }; teammates = teammates.map(old => old.id === a!.id ? a! : old); }
    if (query.has('save-timeout') && !createFailed) { createFailed = true; throw new VibesError('Save response was interrupted.', 0); }
    return structuredClone(a);
  },
  archive: async (a, archived) => {
    const saved = { ...a, archived, revision: a.revision + 1 }; teammates = teammates.map(old => old.id === a.id ? saved : old); return saved;
  },
  decide: async (id, fingerprint, decision) => {
    calls.push({ action: 'decision', id, fingerprint, decision }); const tool = turns[0]!.tools![0]!;
    tool.approval = { ...tool.approval!, answer: decision, state: decision === 'allow' ? 'queued' : 'declined' };
    if (decision === 'decline') { turns[0]!.status = 'completed'; teammates[0]!.status = 'completed'; }
    if (query.has('decision-timeout') && !decisionFailed) { decisionFailed = true; throw new VibesError('Decision response was interrupted.', 0); }
  },
};
export const chatApi: VibesApi = { ...sampleVibesApi, wallet: async () => ({ ...sampleWallet, available: 50, paidAvailable: 50 }),
  chats: async () => [], turns: async chat => structuredClone(turns.filter(t => t.chatId === chat)),
  turn: async id => {
    const t = turns.find(t => t.id === id); if (!t) throw new VibesError('Not found', 404); return structuredClone(t);
  },
  quote: async (chatId, text, model, effort, integrations, attachments) => {
    calls.push({ action: 'quote', chatId, text, integrations, attachments });
    return { quote: JSON.stringify({ chatId, text, model }), model, maxCredits: 3, estimatedCredits: 1, expiresAt: Date.now() / 1000 + 120 };
  },
  submit: async (id, quote) => {
    const q = JSON.parse(quote); calls.push({ action: 'submit', id, ...q });
    const turn: VibesTurn = { ...turns[0]!, id, chatId: q.chatId, prompt: q.text, response: 'Fixture reply only.', tools: [], status: 'completed' };
    turns.push(turn); return turn;
  },
  cancel: async id => { calls.push({ action: 'stop', id }); turns.forEach(t => { if (t.id === id) t.status = 'cancelled'; }); },
};
Object.assign(window, { agentCalls: calls, expireAgentDecision: () => { turns[0]!.tools![0]!.expiresAt = 0; },
  changeAgentDecision: () => { turns[0]!.tools![0]!.approval!.fingerprint = 'b'.repeat(64); } });
