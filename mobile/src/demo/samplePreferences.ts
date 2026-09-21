import { INSTRUCTIONS_MAX, MEMORY_MAX, PROFILE_MAX, PreferencesError, profileFields, type Memory, type MemoryList,
  type Preferences, type PreferencesApi } from '../vibes/preferencesApi';

export const sampleInstructions = 'I build with Expo and TypeScript. Keep diffs small, and explain backend steps like I’m new to them.';
export const sampleMemoryTexts = ['Builds Vibyra, an app for coding from your phone.', 'Uses Expo SDK 57 with TypeScript.',
  'Writes in British English.', 'Keeps source files under 200 lines.', 'Prefers calm, minimal interfaces.'];
export const sampleProfile = { name: 'Sam', occupation: 'Indie app developer',
  about: 'I learn best from small working examples. Outside code I run, cook and read science fiction.',
  summary: 'I’m building Vibyra, an app for coding from your phone, mostly on evenings and weekends.\n\n'
    + 'Stack: Expo and TypeScript on the phone, Laravel on the server, Tauri on the desktop.\n'
    + 'I’m based in London and I like calm, minimal interfaces with plain words.' };
const LIMIT = 50;
const refuse = (message: string): never => { throw new PreferencesError(message, 'refused', 422); };
const PROFILE_NAMES = { name: 'your name', occupation: 'your occupation', about: '“More about you”', summary: 'your memory summary' };

/** The server's own sentence for the first part of Settings > Memory it would refuse, if any. */
export function profileRefusal(changes: Partial<Preferences>): string | null {
  for (const field of profileFields) {
    const value = changes[field];
    if (value !== undefined && value.trim().length > PROFILE_MAX[field]) {
      return `Keep ${PROFILE_NAMES[field]} to ${PROFILE_MAX[field].toLocaleString('en-GB')} characters.`;
    }
  }
  return null;
}

/**
 * The sample workspace's Personality and Memory: the mockup's, held in memory so
 * both pages can be tried end to end and nothing leaves the phone. It refuses what
 * the server refuses, in the server's words, so the sample never shows a limit the
 * real account would not have. Leaving the sample throws the whole thing away.
 */
export function createSamplePreferences(): PreferencesApi {
  let serial = 0;
  let preferences: Preferences = { style: 'concise', instructions: sampleInstructions, memoryEnabled: true, ...sampleProfile,
    nameEnabled: true, occupationEnabled: true, aboutEnabled: true, summaryEnabled: true };
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
  let memories: Memory[] = sampleMemoryTexts.map((text, index) => ({ id: `sample-${++serial}`, text, createdAt: minutesAgo(index + 1),
    source: index === 1 ? 'chat' as const : 'user' as const }));
  const list = (): MemoryList => ({ memories: [...memories], limit: LIMIT });
  return {
    signedIn: async () => true,
    getPreferences: async () => ({ ...preferences }),
    savePreferences: async changes => {
      if (changes.instructions !== undefined && changes.instructions.length > INSTRUCTIONS_MAX) refuse('Keep instructions to 1,000 characters.');
      const refused = profileRefusal(changes);
      if (refused) refuse(refused);
      // Only what was sent moves, as on the server.
      const sent = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      preferences = { ...preferences, ...sent };
      return { ...preferences };
    },
    listMemories: async () => list(),
    addMemory: async text => {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) refuse('Write something for Vibyra to remember.');
      if (clean.length > MEMORY_MAX) refuse('Keep each memory to 200 characters.');
      if (memories.length >= LIMIT) refuse('You can keep up to 50 memories. Remove one to add another.');
      memories = [{ id: `sample-${++serial}`, text: clean, createdAt: new Date().toISOString() }, ...memories];
      return list();
    },
    removeMemory: async id => {
      if (!memories.some(memory => memory.id === id)) throw new PreferencesError('That memory was already removed.', 'gone', 404);
      memories = memories.filter(memory => memory.id !== id);
      return list();
    },
    clearMemories: async () => { memories = []; return list(); },
  };
}
