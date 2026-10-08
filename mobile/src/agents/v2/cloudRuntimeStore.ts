import type { CloudAgentQuote as ComputeQuote } from './cloudRuntimeQuote';
import { cloudSaveBody, selectedRuntime, type AgentExecutionTarget, type CloudAgentApi, type CloudAgentPage, type CloudAgentSave } from './cloudRuntimeModel';

export interface CloudAgentForm { accountId: string; model: string; effort: string; starts: string; tokens: string; hours: string; minutes: string }
export interface CloudAgentSnapshot {
  target: AgentExecutionTarget; restored: boolean; page: CloudAgentPage | null; loading: boolean; busy: boolean; unknown: boolean; error: string;
  form: CloudAgentForm; review: { quote: ComputeQuote; body: CloudAgentSave; accountLabel: string } | null;
}
const emptyForm = (): CloudAgentForm => ({ accountId: '', model: '', effort: '', starts: '1', tokens: '1', hours: '24', minutes: '15' });
const words = (e: unknown) => e instanceof Error ? e.message : 'Cloud could not be reached. Refresh before continuing.';

/** One mounted account/teammate owns this state. Unknown policy writes never replay; a fresh read resolves them. */
export class CloudRuntimeStore {
  private epoch = 0;
  private lock = false;
  private restored: boolean;
  private listeners = new Set<() => void>();
  private value: CloudAgentSnapshot;
  constructor(private api: CloudAgentApi, private deviceId: string, target?: AgentExecutionTarget,
    private persist: (target: AgentExecutionTarget) => void | Promise<void> = () => {}) {
    this.restored = target !== undefined;
    this.value = { target: target ?? 'local', restored: this.restored, page: null, loading: false, busy: false, unknown: false, error: '', form: emptyForm(), review: null };
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<CloudAgentSnapshot>) { this.value = { ...this.value, ...patch }; this.listeners.forEach(f => f()); }
  dispose = () => { this.epoch++; this.lock = false; this.listeners.clear(); };
  restoreTarget = (target: AgentExecutionTarget) => { if (this.restored) return; this.restored = true; this.update({ target, restored: true }); };
  choose = async (target: AgentExecutionTarget) => {
    if (this.lock) return;
    this.lock = true; const version = this.epoch; this.update({ busy: true });
    try { await this.persist(target); if (version === this.epoch) { this.restored = true; this.update({ target, restored: true, review: null, error: '' }); } }
    catch { if (version === this.epoch) this.update({ error: 'Your runtime choice could not be saved. Try again.' }); }
    finally { if (version === this.epoch) { this.lock = false; this.update({ busy: false }); } }
  };
  edit = (patch: Partial<CloudAgentForm>) => {
    if (this.lock || this.value.unknown) return;
    this.update({ form: { ...this.value.form, ...patch }, review: null, error: '' });
  };
  runtimeId = (): string | undefined => {
    if (!this.restored) throw new Error('Restoring your runtime choice…');
    if (this.value.busy) throw new Error('Wait for the runtime change to finish.');
    if (this.value.target === 'cloud' && (this.value.loading || this.value.busy || this.value.unknown)) throw new Error('Refresh the Cloud allowance before sending.');
    return selectedRuntime(this.value.target, this.value.page);
  };
  refresh = async () => {
    if (this.lock) return;
    this.lock = true; const version = this.epoch; this.update({ loading: true, error: '', review: null });
    try { const page = await this.api.read(); if (version === this.epoch) this.update({ page, unknown: false }); }
    catch (e) { if (version === this.epoch) this.update({ page: null, error: words(e) }); }
    finally { if (version === this.epoch) { this.lock = false; this.update({ loading: false }); } }
  };
  prepare = async () => {
    if (this.lock || this.value.unknown || !this.value.page?.enabled) return;
    const form = { ...this.value.form }, page = this.value.page, tokens = Number(form.tokens), hours = Number(form.hours), seconds = Number(form.minutes) * 60;
    if (!Number.isFinite(tokens) || tokens <= 0 || !Number.isSafeInteger(tokens * 10000) || !Number.isFinite(hours) || hours <= 0 || hours > 168 || !Number.isSafeInteger(seconds) || seconds < 60) {
      this.update({ error: 'Enter a positive token limit and an expiry within seven days.' }); return;
    }
    this.lock = true; const version = this.epoch; this.update({ busy: true, error: '', review: null });
    try {
      const quote = await this.api.quote(this.deviceId, tokens * 10000, seconds);
      const body = cloudSaveBody(page, quote, form.accountId, form.model, form.effort, Number(form.starts), new Date(Date.now() + hours * 3600000).toISOString());
      if (version === this.epoch) this.update({ review: { quote, body, accountLabel: page.accounts.find(a => a.accountId === body.accountId)!.label } });
    } catch (e) { if (version === this.epoch) this.update({ error: words(e) }); }
    finally { if (version === this.epoch) { this.lock = false; this.update({ busy: false }); } }
  };
  private mutate = async (operation: () => Promise<CloudAgentPage>) => {
    if (this.lock || this.value.unknown) return;
    this.lock = true; const version = this.epoch; this.update({ busy: true, unknown: true, error: '' });
    try { const page = await operation(); if (version === this.epoch) this.update({ page, unknown: false, review: null }); }
    catch (e) { if (version === this.epoch) this.update({ error: `${words(e)} Refresh to check the saved allowance before changing it again.` }); }
    finally { if (version === this.epoch) { this.lock = false; this.update({ busy: false }); } }
  };
  approve = async () => {
    const review = this.value.review;
    if (!review || review.quote.expiresAt * 1000 <= Date.now()) { this.update({ review: null, error: 'This quote expired. Request a fresh review.' }); return; }
    await this.mutate(() => this.api.save(review.body));
  };
  revoke = async () => {
    const policy = this.value.page?.policy;
    if (policy) await this.mutate(() => this.api.revoke(policy.revision));
  };
}
