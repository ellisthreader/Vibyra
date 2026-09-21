import type { AgentSkill, AgentsApi, Teammate, TeammateFields } from '../agents/types';
import { VibesError } from '../vibes/api';
import type { VibesApi, VibesAttachment, VibesTurn } from '../vibes/types';
import { sampleWallet } from './sampleVibes';

/** A complete local sample session. It owns no fetcher, credentials, purchases or connected-service runner. */
export function createSampleAgents() {
  const now = () => new Date().toISOString();
  const make = (id: string, fields: TeammateFields): Teammate => ({ ...fields, id, chatId: `sample-agent-chat-${id}`,
    revision: 1, archived: false, status: 'idle', lastMessage: 'Ready for your first task.', updatedAt: now(), lastRunId: null });
  let teammates = [make('website', { name: 'Website helper', avatar: 'site', brief: 'Review a website and prepare useful improvements.',
    memory: '', integrations: [], budget: 5 }), make('reviewer', { name: 'Code reviewer', avatar: 'review', brief: 'Review changes and explain what to improve.',
    memory: '', integrations: [], budget: 5 })];
  const turns: VibesTurn[] = []; const uploads: VibesAttachment[] = []; let serial = 0;
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const owned = (id: string) => {
    const agent = teammates.find(a => a.id === id || a.chatId === id);
    if (!agent) throw new VibesError('This sample teammate could not be found.', 404);
    return agent;
  };
  const chat = (id: string) => { const a = owned(id); return { id: a.chatId, title: a.name, trial_slot: null, trial_used: 0 }; };
  const unavailable = async (): Promise<never> => { throw new Error('This action is unavailable in the sample workspace.'); };
  let skills: AgentSkill[] = [];
  const agentsApi: AgentsApi = {
    skills: async () => copy(skills),
    saveSkill: async skill => { const saved = {...skill,revision:skill.revision+1}; skills = [saved,...skills.filter(s=>s.id!==skill.id)]; return copy(saved); },
    list: async () => ({ version: 1, enabled: true, teammates: copy(teammates) }),
    chats: async id => [chat(id)],
    save: async (fields, target) => {
      const existing = teammates.find(a => a.id === target.id);
      if (existing && target.revision === undefined) return copy(existing);
      if (existing && target.revision !== existing.revision) throw new VibesError('Reload this teammate before editing.', 409);
      const saved = existing ? { ...existing, ...fields, revision: existing.revision + 1, updatedAt: now() } : make(target.id, fields);
      teammates = [saved, ...teammates.filter(a => a.id !== saved.id)]; return copy(saved);
    },
    archive: async (agent, archived) => {
      const saved = { ...owned(agent.id), archived, revision: agent.revision + 1, updatedAt: now() };
      teammates = teammates.map(a => a.id === saved.id ? saved : a); return copy(saved);
    },
    decide: unavailable,
  };
  const chatApi: VibesApi = {
    wallet: async () => ({ ...sampleWallet, available: 50, total: 50, paidAvailable: 50 }),
    models: async () => [], consent: async () => {}, chats: async () => teammates.map(a => chat(a.id)), createChat: unavailable,
    quote: async (chatId, text, model, effort, _integrations, attachments = []) => {
      const agent = owned(chatId); if (agent.archived) throw new VibesError('Restore this sample teammate first.', 409);
      const maxCredits = Math.min(agent.budget, 3);
      return { quote: JSON.stringify({ chatId, text, model, attachments, maxCredits }), model, effort,
        maxCredits, estimatedCredits: 1, expiresAt: Date.now() / 1000 + 120 };
    },
    submit: async (id, quote) => {
      const prior = turns.find(t => t.id === id); if (prior) return copy(prior);
      const q = JSON.parse(quote); const agent = owned(q.chatId);
      const response = `I’d start by clarifying the result, reviewing the relevant material, and preparing a change for you to review.\n\n`
        + `This is a sample conversation with ${agent.name}. No model or connected service was called.`;
      const turn: VibesTurn = { id, chatId: agent.chatId, model: q.model, status: 'completed', prompt: q.text, response,
        error: null, reserved: q.maxCredits, charged: 0, createdAt: now(), tools: [],
        attachments: uploads.filter(a => q.attachments.includes(a.id)) };
      turns.push(turn); Object.assign(agent, { status: 'completed', lastMessage: response, updatedAt: now(), lastRunId: id }); return copy(turn);
    },
    turns: async id => { owned(id); return copy(turns.filter(t => t.chatId === id)); },
    turn: async id => { const turn = turns.find(t => t.id === id); if (!turn) throw new VibesError('Sample turn not found.', 404); return copy(turn); },
    cancel: async id => { const turn = turns.find(t => t.id === id); if (turn) turn.status = 'cancelled'; },
    upload: async source => {
      const attachment: VibesAttachment = { id: `sample-agent-file-${++serial}`, name: source.name, bytes: source.file?.size ?? 0,
        kind: source.mimeType.startsWith('image/') ? 'image' : source.mimeType === 'application/pdf' ? 'pdf' : 'text' };
      uploads.push(attachment); return copy(attachment);
    },
    purchase: unavailable,
  };
  return { agentsApi, chatApi };
}
