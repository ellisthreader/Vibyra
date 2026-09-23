/**
 * Settings > Personality and Settings > Memory: how Vibyra replies in phone chats,
 * and what it has been asked to remember. It asks with the same bearer the Vibes
 * chat uses — the account's, or the guest session's — because a guest may shape its
 * chats too, and the server keeps what it chose on the row sign-up converts.
 *
 * The server tells a missing route from a missing memory by the body: its own 404
 * carries `error`, a deployment without these routes answers in Laravel's `message`
 * or nothing. The first is "already removed", the second "not available yet", and
 * neither may ever read as saved.
 */
import { preferencesChanged } from './preferenceChanges';

export type PersonalityStyle = 'balanced' | 'concise' | 'detailed' | 'friendly';
export const personalityStyles: PersonalityStyle[] = [
  'balanced',
  'concise',
  'detailed',
  'friendly',
];
/** What a person writes about themselves on Settings > Memory; each has its own switch. */
export type ProfileField = 'name' | 'occupation' | 'about' | 'summary';
export const profileFields: ProfileField[] = ['name', 'occupation', 'about', 'summary'];
export type ProfileSwitch = `${ProfileField}Enabled`;
export interface Preferences extends Record<ProfileField, string>, Record<ProfileSwitch, boolean> {
  style: PersonalityStyle;
  instructions: string;
  memoryEnabled: boolean;
}
/** `source` is 'chat' for one a phone chat saved; older servers send none. */
export interface Memory {
  id: string;
  text: string;
  createdAt: string;
  source?: 'user' | 'chat';
}
export interface MemoryList {
  memories: Memory[];
  limit: number;
}
export const INSTRUCTIONS_MAX = 1000;
export const MEMORY_MAX = 200;
/** The longest each part may be, as `Personalization::PROFILE` has it. */
export const PROFILE_MAX: Record<ProfileField, number> = {
  name: 60,
  occupation: 120,
  about: 1500,
  summary: 8000,
};

/** `unavailable`: a server without these routes. `offline`: no answer at all. `gone`: a
 *  memory already removed. `refused`: anything else, in the server's own sentence. */
export type PreferencesFailure = 'signedOut' | 'unavailable' | 'offline' | 'gone' | 'refused';
export class PreferencesError extends Error {
  constructor(
    message: string,
    readonly kind: PreferencesFailure,
    readonly status: number,
  ) {
    super(message);
  }
}
export interface PreferencesApi {
  /** Whether there is anyone to ask for: an account, or a guest session. */
  signedIn(): Promise<boolean>;
  getPreferences(): Promise<Preferences>;
  savePreferences(changes: Partial<Preferences>): Promise<Preferences>;
  listMemories(): Promise<MemoryList>;
  addMemory(text: string): Promise<MemoryList>;
  removeMemory(id: string): Promise<MemoryList>;
  clearMemories(): Promise<MemoryList>;
}

const MISSING = 'This isn’t available on Vibyra’s server yet.';
const OFFLINE = 'Vibyra couldn’t be reached. Check your connection and try again.';

function unexplained(status: number) {
  if (status === 429) return 'That was a lot at once. Please try again in a moment.';
  if (status >= 500) return 'Vibyra couldn’t answer just now. Please try again.';
  return 'That didn’t save. Please try again.';
}
/** The body, whatever arrived: a proxy error page or an empty 405 is not JSON. */
async function parse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => '');
  try {
    const value: unknown = text ? JSON.parse(text) : null;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
/** A body that is not what this endpoint promises is a server that does not have it. */
function preferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') throw new PreferencesError(MISSING, 'unavailable', 502);
  const p = value as Record<string, unknown>;
  const text = (key: string) => (typeof p[key] === 'string' ? (p[key] as string) : '');
  return {
    style: personalityStyles.includes(p.style as PersonalityStyle)
      ? (p.style as PersonalityStyle)
      : 'balanced',
    instructions: text('instructions'),
    memoryEnabled: p.memoryEnabled !== false,
    name: text('name'),
    nameEnabled: p.nameEnabled !== false,
    occupation: text('occupation'),
    occupationEnabled: p.occupationEnabled !== false,
    about: text('about'),
    aboutEnabled: p.aboutEnabled !== false,
    summary: text('summary'),
    summaryEnabled: p.summaryEnabled !== false,
  };
}
function memoryList(data: Record<string, unknown>): MemoryList {
  if (!Array.isArray(data.memories)) throw new PreferencesError(MISSING, 'unavailable', 502);
  const memories = (data.memories as Record<string, unknown>[])
    .filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string')
    .map((item) => ({
      id: item.id as string,
      text: item.text as string,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      source: item.source === 'chat' ? ('chat' as const) : ('user' as const),
    }));
  const limit = typeof data.limit === 'number' && data.limit > 0 ? data.limit : 50;
  return { memories, limit };
}

export function createPreferencesApi(
  baseUrl: string,
  token: () => string | null | Promise<string | null>,
  fetcher: typeof fetch = (...args) => fetch(...args),
): PreferencesApi {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/vibes/`;
  const call = async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: object) => {
    const identity = await token();
    if (!identity) throw new PreferencesError('Sign in to change this.', 'signedOut', 401);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      let response: Response;
      try {
        response = await fetcher(root + path, {
          method,
          signal: controller.signal,
          body: body ? JSON.stringify(body) : undefined,
          headers: {
            Authorization: `Bearer ${identity}`,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
        });
      } catch {
        throw new PreferencesError(OFFLINE, 'offline', 0);
      }
      const data = await parse(response);
      if (identity !== (await token()))
        throw new PreferencesError('Your account changed. Please try again.', 'signedOut', 401);
      if (response.ok && data.ok !== false) {
        if (method !== 'GET') preferencesChanged();
        return data;
      }
      const error = typeof data.error === 'string' && data.error ? data.error : null;
      if ((response.status === 404 || response.status === 405) && !error)
        throw new PreferencesError(MISSING, 'unavailable', response.status);
      if (response.status === 404) throw new PreferencesError(error!, 'gone', 404);
      if (response.status === 401)
        throw new PreferencesError(error ?? 'Sign in again to change this.', 'signedOut', 401);
      throw new PreferencesError(error ?? unexplained(response.status), 'refused', response.status);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    signedIn: async () => Boolean(await token()),
    getPreferences: async () => preferences((await call('GET', 'preferences')).preferences),
    // Only the fields being changed are sent, so two changes in flight never undo each other.
    savePreferences: async (changes) =>
      preferences(
        (
          await call(
            'POST',
            'preferences',
            Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
          )
        ).preferences,
      ),
    listMemories: async () => memoryList(await call('GET', 'memories')),
    addMemory: async (text) => memoryList(await call('POST', 'memories', { text })),
    removeMemory: async (id) =>
      memoryList(await call('DELETE', `memories/${encodeURIComponent(id)}`)),
    clearMemories: async () => memoryList(await call('DELETE', 'memories')),
  };
}
