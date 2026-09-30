import { profileRefusal, sampleProfile } from '../src/demo/samplePreferences';
import { profileFields, type Memory, type Preferences } from '../src/vibes/preferencesApi';

/**
 * The backend's Personality and Memory routes, in memory, answering exactly as
 * `VibesPersonalizationController` does — including its sentences, the 404 with
 * `error` for a memory already gone, and Laravel's bare 405 on a server without the
 * routes. `fail` answers one call with a chosen refusal; `delay` holds every answer.
 */
export const mockupMemories = ['Builds Vibyra, an app for coding from your phone.', 'Uses Expo SDK 57 with TypeScript.',
  'Writes in British English.', 'Keeps source files under 200 lines.', 'Prefers calm, minimal interfaces.'];
export const mockupInstructions = 'I build with Expo and TypeScript. Keep diffs small, and explain backend steps like I’m new to them.';
export type ServerMode = 'ready' | 'missing' | 'offline';

export function preferencesServer({ mode = 'ready', memories = mockupMemories, delay = 0 }: {
  mode?: ServerMode; memories?: string[]; delay?: number;
} = {}) {
  let next = 0;
  const id = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;
  const stamp = (offset: number) => new Date(Date.UTC(2026, 8, 11, 12, 0, 0) - offset * 60000).toISOString();
  const state = {
    preferences: { style: 'concise', instructions: mockupInstructions, memoryEnabled: true, ...sampleProfile,
      nameEnabled: true, occupationEnabled: true, aboutEnabled: true, summaryEnabled: true } as Preferences,
    // Newest first, as the server lists them. The second was saved by a chat.
    memories: memories.map((text, index) => ({ id: id(), text, createdAt: stamp(index), source: index === 1 ? 'chat' : 'user' })) as Memory[],
    limit: 50, mode,
  };
  const calls: string[] = [];
  const fail = new Map<string, { status: number; error?: string }>();
  const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const list = (extra: object = {}) => json(200, { ok: true, ...extra, memories: state.memories, limit: state.limit });
  const refuse = (error: string, status = 422) => json(status, { ok: false, error });
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(input)).pathname.replace(/^\/api\/vibes\//, '');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (state.mode === 'offline') throw new TypeError('Network request failed');
    if (state.mode === 'missing') return json(405, { message: `The ${method} method is not supported for route api/vibes/${path}.` });
    const forced = fail.get(`${method} ${path}`);
    if (forced) { fail.delete(`${method} ${path}`); return json(forced.status, forced.error ? { ok: false, error: forced.error } : {}); }
    if (path === 'preferences' && method === 'GET') return json(200, { ok: true, preferences: state.preferences });
    if (path === 'preferences' && method === 'POST') {
      const changes = body ?? {};
      if ('style' in changes && !['balanced', 'concise', 'detailed', 'friendly'].includes(changes.style as string)) {
        return refuse('Choose Balanced, Concise, Detailed or Friendly.');
      }
      if ('instructions' in changes) {
        const words = String(changes.instructions ?? '').replace(/\r\n?/g, '\n').trim();
        if (words.length > 1000) return refuse('Keep instructions to 1,000 characters.');
        changes.instructions = words;
      }
      if ('memoryEnabled' in changes && typeof changes.memoryEnabled !== 'boolean') return refuse('Turn memory on or off.');
      for (const field of profileFields.filter(key => key in changes)) {
        const words = String(changes[field] ?? '').replace(/\r\n?/g, '\n').trim();
        changes[field] = field === 'name' || field === 'occupation' ? words.replace(/\s+/g, ' ') : words;
      }
      const refused = profileRefusal(changes as Partial<Preferences>);
      if (refused) return refuse(refused);
      state.preferences = { ...state.preferences, ...changes };
      return json(200, { ok: true, preferences: state.preferences });
    }
    if (path === 'memories' && method === 'GET') return list();
    if (path === 'memories' && method === 'POST') {
      const text = String(body?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return refuse('Write something for Vibyra to remember.');
      if (text.length > 200) return refuse('Keep each memory to 200 characters.');
      if (state.memories.length >= state.limit) return refuse('You can keep up to 50 memories. Remove one to add another.');
      const memory = { id: id(), text, createdAt: new Date().toISOString() };
      state.memories = [memory, ...state.memories];
      return list({ memory });
    }
    if (path === 'memories' && method === 'DELETE') { state.memories = []; return list(); }
    const one = path.match(/^memories\/(.+)$/);
    if (one && method === 'DELETE') {
      const target = decodeURIComponent(one[1]!);
      if (!state.memories.some(memory => memory.id === target)) return refuse('That memory was already removed.', 404);
      state.memories = state.memories.filter(memory => memory.id !== target);
      return list();
    }
    return json(404, { message: 'Not Found' });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls, state, fail };
}
