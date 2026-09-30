import { PreferencesError, type Memory, type PersonalityStyle, type Preferences, type PreferencesApi, type ProfileField,
  type ProfileSwitch } from '../vibes/preferencesApi';

export type Availability = 'idle' | 'loading' | 'ready' | 'unavailable' | 'signedOut';
export interface PersonalizationState {
  status: Availability;
  preferences: Preferences | null;
  memories: Memory[] | null;
  limit: number;
  /** Why nothing loaded, when the server said more than "not here yet" (offline, a 500). */
  problem: string | null;
  /** The last change the server refused, in its own words. The next change clears it. */
  error: string | null;
  busy: TextField | 'add' | 'clear' | null;
  /** When the server last confirmed a text, and which. Nothing says "Saved" before that. */
  savedAt: number | null;
  savedField: TextField | null;
}
/** A box that saves when it is left: the instructions, or a part of Settings > Memory. */
export type TextField = 'instructions' | ProfileField;
/** A switch that applies on the tap: memory as a whole, or one part of it. */
export type MemorySwitch = 'memoryEnabled' | ProfileSwitch;
export const styleNames: Record<PersonalityStyle, string> = {
  balanced: 'Balanced', concise: 'Concise', detailed: 'Detailed', friendly: 'Friendly',
};
const initial: PersonalizationState = { status: 'idle', preferences: null, memories: null, limit: 50,
  problem: null, error: null, busy: null, savedAt: null, savedField: null };
const message = (error: unknown) => error instanceof Error ? error.message : 'That didn’t save. Please try again.';
// Newest first, the order the server lists them in; ids are time-ordered, so they break ties.
const newestFirst = (a: Memory, b: Memory) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/**
 * Personality and Memory for one account (or guest) while the sheet is open. The home
 * rows and both pages read this one copy, so a change on a page is already on the
 * row when Back reaches the list.
 *
 * A switch or a style changes on the tap and goes back if the server refuses; the
 * newest tap of a field is the only one allowed to decide it, so an older answer
 * landing late cannot flip it back. Text — the instructions and each part of
 * Settings > Memory — and new memories wait for the server, because what they would
 * show before it answers is a promise.
 */
export class Personalization {
  state = initial;
  private listeners = new Set<() => void>();
  private loads = 0;
  private writes: Partial<Record<'style' | MemorySwitch, number>> = {};
  // Removals still in flight: a list the server sends back meanwhile must not revive them.
  private removing = new Set<string>();
  constructor(private readonly api: PreferencesApi) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private set(patch: Partial<PersonalizationState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private listed = (memories: Memory[]) => memories.filter(memory => !this.removing.has(memory.id));

  async load() {
    const run = ++this.loads;
    if (!(await this.api.signedIn().catch(() => false))) { if (run === this.loads) this.set({ ...initial, status: 'signedOut' }); return; }
    if (run !== this.loads) return;
    if (this.state.status !== 'ready') this.set({ status: 'loading', problem: null });
    try {
      const [preferences, list] = await Promise.all([this.api.getPreferences(), this.api.listMemories()]);
      if (run === this.loads) this.set({ status: 'ready', preferences, memories: this.listed(list.memories), limit: list.limit, problem: null });
    } catch (error) {
      if (run !== this.loads) return;
      const kind = error instanceof PreferencesError ? error.kind : 'refused';
      if (kind === 'signedOut') this.set({ ...initial, status: 'signedOut' });
      // A reload that fails keeps what the page already shows; only a first load can be "not available".
      else if (this.state.status === 'ready') this.set({ error: message(error) });
      else this.set({ status: 'unavailable', problem: kind === 'unavailable' ? null : message(error) });
    }
  }
  setStyle = (style: PersonalityStyle) => this.optimistic('style', style);
  setMemoryEnabled = (on: boolean) => this.optimistic('memoryEnabled', on);
  setSwitch = (key: MemorySwitch, on: boolean) => this.optimistic(key, on);
  private async optimistic<K extends 'style' | MemorySwitch>(key: K, value: Preferences[K]) {
    const before = this.state.preferences;
    if (!before || before[key] === value) return;
    const run = this.writes[key] = (this.writes[key] ?? 0) + 1;
    this.set({ preferences: { ...before, [key]: value }, error: null });
    try {
      const saved = await this.api.savePreferences({ [key]: value });
      if (run === this.writes[key]) this.set({ preferences: { ...this.state.preferences!, [key]: saved[key] } });
    } catch (error) {
      if (run === this.writes[key]) this.set({ preferences: { ...this.state.preferences!, [key]: before[key] }, error: message(error) });
    }
  }
  saveInstructions = (text: string) => this.saveText('instructions', text);
  /** True once the server holds `text` (or already did). A name and an occupation are one line. */
  async saveText(field: TextField, text: string) {
    const current = this.state.preferences;
    if (!current) return false;
    const lines = text.replace(/\r\n?/g, '\n').trim();
    const clean = field === 'name' || field === 'occupation' ? lines.replace(/\s+/g, ' ') : lines;
    if (clean === current[field]) return true;
    this.set({ busy: field, error: null, savedAt: null, savedField: null });
    // Another box saving meanwhile owns the spinner from then on; this one only clears its own.
    const done = () => (this.state.busy === field ? { busy: null } : {});
    try {
      const saved = await this.api.savePreferences({ [field]: clean });
      this.set({ preferences: { ...this.state.preferences!, [field]: saved[field] }, ...done(), savedAt: Date.now(), savedField: field });
      return true;
    } catch (error) { this.set({ ...done(), error: message(error) }); return false; }
  }
  /** Adding or clearing the list waits for the one before; a box saving does not hold it up. */
  private get listBusy() { return this.state.busy === 'add' || this.state.busy === 'clear'; }
  async addMemory(text: string) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || this.listBusy) return false;
    this.set({ busy: 'add', error: null });
    try {
      const list = await this.api.addMemory(clean);
      this.set({ memories: this.listed(list.memories), limit: list.limit, busy: null });
      return true;
    } catch (error) { this.set({ busy: null, error: message(error) }); return false; }
  }
  async removeMemory(id: string) {
    const memory = this.state.memories?.find(item => item.id === id);
    if (!memory) return;
    this.removing.add(id);
    this.set({ memories: this.state.memories!.filter(item => item.id !== id), error: null });
    try {
      const list = await this.api.removeMemory(id);
      this.removing.delete(id);
      this.set({ memories: this.listed(list.memories), limit: list.limit });
    } catch (error) {
      this.removing.delete(id);
      // Already gone on the server is the outcome that was asked for: just catch up.
      if (error instanceof PreferencesError && error.kind === 'gone') { await this.refreshMemories(); return; }
      this.set({ memories: [...(this.state.memories ?? []), memory].sort(newestFirst), error: message(error) });
    }
  }
  async clearMemories() {
    const before = this.state.memories;
    if (!before?.length || this.listBusy) return;
    this.set({ memories: [], busy: 'clear', error: null });
    try {
      const list = await this.api.clearMemories();
      this.set({ memories: this.listed(list.memories), limit: list.limit, busy: null });
    } catch (error) { this.set({ memories: before, busy: null, error: message(error) }); }
  }
  clearError = () => { if (this.state.error) this.set({ error: null }); };
  private async refreshMemories() {
    try { const list = await this.api.listMemories(); this.set({ memories: this.listed(list.memories), limit: list.limit }); } catch { /* the row is already off the list */ }
  }
}

/**
 * What the two home rows show. They are always there, from the first frame, so they
 * never arrive late and push the list down; until there is an answer — or with nobody
 * to ask for, where the page offers the sign-in — they carry no value.
 */
export function personalizationRows(state: PersonalizationState) {
  const preferences = state.status === 'ready' ? state.preferences : null;
  const count = state.memories?.length ?? 0;
  return {
    personality: preferences ? styleNames[preferences.style] : null,
    memory: preferences ? (preferences.memoryEnabled ? (count ? `On · ${count}` : 'On') : 'Off') : null,
  };
}
