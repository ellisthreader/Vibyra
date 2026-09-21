import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { deleteFlag, readFlag, writeFlag } from '../../transport/deviceFlags';
import { VibesError } from '../../vibes/api';
import type { AgentsApi, Teammate, TeammateFields } from '../types';
import { specialistDraft } from './specialists';
import { emptySetup, routinePlanKey, type SetupDraft } from './types';
import { restoreSetup } from './restoreSetup';

export function useSetupChat({ api, identity, enabled, onSaved }: {
  api: AgentsApi; identity: string; enabled: boolean; onSaved(agent: Teammate): void;
}) {
  const key = `agent-setup-chat.${encodeURIComponent(identity)}`;
  const legacyKey = `agent-save.${encodeURIComponent(identity)}.new`;
  const [draft, setDraft] = useState(emptySetup); const current = useRef(draft);
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string | null>(null); const [reload, setReload] = useState(0);
  const queue = useRef(Promise.resolve()); const alive = useRef(true);
  const persist = (value: SetupDraft) => {
    const write = queue.current.catch(() => {}).then(() => writeFlag(key, JSON.stringify(value)));
    queue.current = write; return write;
  };
  useEffect(() => {
    alive.current = true; let active = true;
    void Promise.all([readFlag(key), readFlag(legacyKey)]).then(([raw, legacy]) => {
      if (!active) return;
      const restored = restoreSetup(raw, legacy);
      current.current = restored; setDraft(restored); setReady(true); setError(null);
    }).catch(() => { if (active) setError('Your saved setup could not be restored. Retry to keep its request safe.'); });
    return () => { active = false; alive.current = false; };
  }, [key, legacyKey, reload]);
  const update = (patch: Partial<SetupDraft>) => {
    if (!ready || lock.current || current.current.pending) return;
    const next = { ...current.current, ...patch }; current.current = next; setDraft(next);
    void persist(next).catch(() => { if (alive.current) setError('Your setup could not be saved on this phone. Please retry.'); });
  };
  const fields = (patch: Partial<TeammateFields>) => update({ fields: { ...current.current.fields, ...patch } });
  const job = (value: string, preset = false) => {
    if (!value.trim()) return;
    const proposed = specialistDraft(value.trim());
    const existing = current.current.fields;
    update({ job: value.trim(), fields: { ...existing, name: existing.name || proposed.fields.name,
      avatar: existing.name ? existing.avatar : proposed.fields.avatar, brief: existing.brief && !preset ? value.trim() : proposed.fields.brief },
      routineSuggestion: proposed.routine, step: 'review', text: '' });
  };
  const memory = (value: string, keepFacts = true) => {
    const base = keepFacts ? current.current.fields.memory : '';
    update({ fields: { ...current.current.fields, memory: [base, value.trim()].filter(Boolean).join('\n').slice(0, 4000) }, step: 'review', text: '' });
  };
  const routines = (values: string[]) => {
    const planned = values.map(v => v.trim()).filter(Boolean);
    if (planned.length > 2) { setError('Keep this specialist focused on one or two routines. Put each routine on one line.'); return; }
    setError(null); update({ routines: planned, step: 'review', text: '' });
  };
  const create = async () => {
    if (!ready || lock.current || !enabled) return;
    const value = current.current;
    if (!value.fields.name.trim() || !value.fields.brief.trim() || !Number.isInteger(value.fields.budget) || value.fields.budget < 1 || value.fields.budget > 50) return;
    lock.current = true; setBusy(true); setError(null);
    const pending = value.pending ?? { id: randomUUID(), fields: { ...value.fields, name: value.fields.name.trim(), brief: value.fields.brief.trim() }, routines: value.routines, requestedTools: value.requestedTools };
    const submitted = { ...value, pending }; current.current = submitted; setDraft(submitted);
    try {
      await persist(submitted);
      const saved = await api.save(pending.fields, { id: pending.id });
      await writeFlag(routinePlanKey(identity, saved.id), JSON.stringify({ status: 'draft', routines: pending.routines, requestedTools: pending.requestedTools }));
      await deleteFlag(legacyKey); await deleteFlag(key);
      if (alive.current) onSaved(saved);
    } catch (e) {
      if (e instanceof VibesError && e.status > 0 && e.status < 500) {
        const released = { ...current.current, pending: undefined }; current.current = released; setDraft(released);
        await persist(released).catch(() => {});
      }
      if (alive.current) setError(e instanceof Error ? e.message : 'The save could not be confirmed. Retry the same request.');
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return { draft, ready, busy, error, locked: busy || !ready || Boolean(draft.pending), update, fields, job, memory, routines, create,
    restore: () => setReload(v => v + 1) };
}
