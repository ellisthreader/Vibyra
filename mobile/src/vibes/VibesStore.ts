import type { Effort, PurchaseBridge, VibesApi, VibesChat, VibesModel, VibesTurn, VibesWallet } from './types';
import { activeTurn } from './types';
import { asEffort, resolveEffort } from '../ui/effort';
import { AUTO } from '../ui/agents';
import { VibesError } from './api';
import { fallbackModels } from './catalogue';

export interface VibesState {
  wallet: VibesWallet | null; models: VibesModel[]; chats: VibesChat[]; turns: VibesTurn[];
  selected: string | null; draftScope: string; model: string; effort: Effort | null;
  ready: boolean; error: string | null; errorStatus: number | null; pending: string | null;
  revision: number; selectionVersion: number;
}
export class VibesStore {
  // The catalogue ships with the app so the picker always offers every family;
  // the server's list replaces it as soon as one arrives.
  state: VibesState = { wallet: null, models: fallbackModels, chats: [], turns: [], selected: null,
    draftScope: 'new', model: 'auto', effort: null, ready: false, error: null, errorStatus: null, pending: null,
    revision: 0, selectionVersion: 0 };
  private listeners = new Set<() => void>();
  private chatListeners = new Set<() => void>();
  private chatState = { chats: this.state.chats, selected: this.state.selected };
  private generation = 0;
  private refreshPromise: Promise<void> | null = null;
  private chatPromise: Promise<string> | null = null;
  private modelsPromise: Promise<void> | null = null;
  private savePending: Promise<void> = Promise.resolve();
  constructor(readonly api: VibesApi, readonly uuid: () => string,
    readonly persistence: { read(): Promise<string | null>; write(value: string): Promise<void> },
    readonly purchases: PurchaseBridge | null = null, readonly prepare?: () => Promise<void>) {}
  snapshot = () => this.state;
  chatsSnapshot = () => this.chatState;
  get needsPolling() { return Boolean(this.state.pending || this.state.turns.some(activeTurn)); }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  subscribeChats = (fn: () => void) => { this.chatListeners.add(fn); return () => { this.chatListeners.delete(fn); }; };
  update(patch: Partial<VibesState>) {
    this.state = { ...this.state, ...patch };
    if (this.chatState.chats !== this.state.chats || this.chatState.selected !== this.state.selected) {
      this.chatState = { chats: this.state.chats, selected: this.state.selected };
      this.chatListeners.forEach(fn => fn());
    }
    this.listeners.forEach(fn => fn());
  }
  error(e: unknown) { this.update({ error: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
    errorStatus: e instanceof VibesError ? e.status : null }); }
  async initialize() {
    try {
      const saved = await this.persistence.read();
      if (saved) {
        const p = JSON.parse(saved);
        this.update({ pending: typeof p.pending === 'string' ? p.pending : null, selected: typeof p.selected === 'string' ? p.selected : null,
          draftScope: typeof p.selected === 'string' ? p.selected : 'new',
          model: typeof p.model === 'string' && p.model ? p.model : this.state.model, effort: asEffort(p.effort) });
      }
    } catch { /* A damaged cache cannot grant credits or start execution. */ }
    this.reconcileEffort();
    void this.loadModels();
    await this.refresh();
  }
  private save() {
    const value = JSON.stringify({ pending: this.state.pending, selected: this.state.selected,
      model: this.state.model, effort: this.state.effort });
    const write = () => this.persistence.write(value);
    this.savePending = this.savePending.then(write, write);
    return this.savePending;
  }
  /** Wait for every state snapshot queued before this call to reach device storage. */
  flushPersistence() { return this.savePending; }
  /**
   * Keeps the chosen effort legal for the chosen model. An unknown model is not
   * proof that it has no levels - before the catalogue answers, every model is
   * unknown - so a saved choice survives a cold start instead of being wiped by
   * a fallback list that carries no effort data at all.
   */
  private reconcileEffort(model = this.state.model, models = this.state.models) {
    // Auto chooses the level as well as the model, and the composer shows no
    // control for it, so a level held here is one nobody can see or change. Left
    // behind by the last model picked, it used to be sent alongside "choose for
    // me" and priced into the turn.
    if (model === AUTO) { if (this.state.effort !== null) this.update({ effort: null }); return; }
    const known = models.find(entry => entry.id === model);
    if (!known?.reasoning) return;
    const effort = resolveEffort(known, this.state.effort);
    if (effort !== this.state.effort) this.update({ effort });
  }
  setModel(model: string) {
    this.update({ model });
    this.reconcileEffort(model);
    void this.save().catch(error => this.error(error));
  }
  setEffort(effort: Effort | null) {
    this.update({ effort }); this.reconcileEffort(); void this.save().catch(error => this.error(error));
  }
  // Models are a menu, not account state: they load on their own so a failed
  // wallet call, a signed-out phone or a backend without the route still offers
  // the full list rather than Auto alone.
  loadModels = () => {
    if (this.modelsPromise) return this.modelsPromise;
    this.modelsPromise = this.api.models()
      .then(models => { if (models.length) { this.update({ models }); this.reconcileEffort(this.state.model, models); } })
      .catch(() => {})
      .finally(() => { this.modelsPromise = null; });
    return this.modelsPromise;
  };
  refresh = () => {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = Promise.resolve(this.prepare?.()).then(() => this.load()).catch(error => {
      this.update({ ready: false }); this.error(error);
    }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  };
  private async load() {
    try {
      const [wallet, chats] = await Promise.all([this.api.wallet(), this.api.chats()]);
      this.update({ wallet, chats, ready: true, error: null, errorStatus: null, revision: this.state.revision + 1 });
      if (this.state.pending) {
        try {
          const turn = await this.api.turn(this.state.pending);
          if (!activeTurn(turn)) { this.update({ pending: null }); await this.save(); }
        } catch (e) {
          // A 404 means no accepted turn exists. Keep the draft; a new explicit Send is allowed.
          if (e instanceof VibesError && e.status === 404) { this.update({ pending: null }); await this.save(); }
          else throw e;
        }
      }
      const selected = this.state.selected; const generation = this.generation;
      if (selected) {
        const turns = await this.api.turns(selected);
        if (generation === this.generation && selected === this.state.selected) this.update({ turns });
      }
    } catch (e) { this.update({ ready: false }); this.error(e); }
  }
  async select(id: string | null) {
    const epoch = ++this.generation;
    this.update({ selected: id, draftScope: id ?? 'new', turns: id === this.state.selected ? this.state.turns : [], selectionVersion: epoch });
    await this.save();
    if (!id) return;
    const turns = await this.api.turns(id);
    if (epoch === this.generation) this.update({ turns });
  }
  /** The open chat and any turn waited on belong to an identity this store no longer speaks for. */
  async forgetChat() {
    ++this.generation;
    this.update({ selected: null, draftScope: 'new', turns: [], pending: null });
    await this.save().catch(error => this.error(error));
  }
  chat(text: string) {
    if (this.state.selected) return Promise.resolve(this.state.selected);
    if (this.chatPromise) return this.chatPromise;
    this.chatPromise = this.createChat(text).finally(() => { this.chatPromise = null; });
    return this.chatPromise;
  }
  private async createChat(text: string) {
    const generation = this.generation;
    const id = this.uuid();
    const chats = await this.api.createChat(id, text.trim().slice(0, 80) || 'New chat');
    if (generation !== this.generation || this.state.selected) throw new Error('The selected chat changed. Please send from your current chat.');
    this.update({ chats, selected: id }); await this.save(); return id;
  }
  async send(quote: string): Promise<boolean> {
    if (this.state.pending || !this.state.ready) return false;
    const id = this.uuid(); this.update({ pending: id, error: null, errorStatus: null });
    let dispatched = false;
    try {
      // Persist identity before the network write. Ambiguous sends are reconciled, never repeated.
      await this.save();
      dispatched = true;
      const turn = await this.api.submit(id, quote);
      if (this.state.selected === turn.chatId) {
        ++this.generation;
        this.update({ turns: [...this.state.turns.filter(t => t.id !== turn.id), turn] });
      }
      // A poll already in flight predates this acceptance and cannot verify its balance.
      await this.refreshPromise;
      await this.refresh(); return true;
    } catch (e) {
      // Every status here is proof the submission was refused before a turn row
      // existed, so the draft is released rather than left waiting on a reply that
      // is never coming. 429 is on the list for both of its senders: the route's
      // own throttle rejects ahead of the controller, and a usage window rejects
      // inside `Turns::submit` before anything is written.
      if (!dispatched || e instanceof VibesError && [400, 401, 402, 403, 404, 405, 409, 422, 429].includes(e.status)) {
        this.update({ pending: null }); await this.save().catch(() => {});
      }
      this.error(e); return false;
    }
  }
  async stop() {
    const turn = this.state.turns.find(activeTurn); const id = turn?.id ?? this.state.pending;
    if (id) { await this.api.cancel(id); await this.refresh(); }
  }
}
