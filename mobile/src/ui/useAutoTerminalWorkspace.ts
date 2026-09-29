import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { useVibesStore } from '../vibes/VibesProvider';
import { canStartWork } from './mode';
import { setDraftForScope } from './useDraft';
import type { AutoSelectionProgress } from './autoSelectionState';
import { useTerminalAuto } from './useTerminalAuto';
import type { TerminalLaunchOptions, WorkspaceModel } from './types';
import { useAutoTerminalRecords, type AutoChoice, type AutoRecord } from './useAutoTerminalRecords';

/** Auto is a durable, phone-local empty terminal until its first explicit Send. */
export function useAutoTerminalWorkspace(base: WorkspaceModel): WorkspaceModel {
  const store = useVibesStore();
  const choose = useTerminalAuto(base, store?.api);
  const scope = `auto-terminals:${base.account?.email}:${base.host?.id}`;
  const records = useAutoTerminalRecords(scope);
  const [selected, setSelected] = useState<string | null>(null);
  const selection = useRef(selected); selection.current = selected;
  const live = useRef({ base, store, scope }); live.current = { base, store, scope };
  const lifecycle = useRef({ scope, store, status: base.status, version: 0 });
  if (lifecycle.current.scope !== scope || lifecycle.current.store !== store || lifecycle.current.status !== base.status)
    lifecycle.current = { scope, store, status: base.status, version: lifecycle.current.version + 1 };
  const navigation = useRef(0);
  const busy = useRef(new Set<string>());
  const [activity, setActivity] = useState<{ scope: string; id: string; epoch: number; progress: AutoSelectionProgress }>();
  useEffect(() => { setSelected(null); }, [scope]);
  const rows = records.rows.filter(row => !row.completed);
  const complete = (id: string) => records.change(items => items.map(row => row.id !== id ? row :
    { ...row, completed: true, autoChoice: row.autoChoice && { ...row.autoChoice, text: '' } }));
  const select = (id: string | null) => { if (selection.current !== id) navigation.current++; selection.current = id; setSelected(id); };
  const openResolved = (id: string) => {
    const target = rows.find(row => row.id === id)?.resolvedAutoSession;
    if (!target || busy.current.has(id)) return;
    const text = rows.find(row => row.id === id)?.autoChoice?.text;
    if (text) setDraftForScope(target.fundedChatId ? `funded:${store?.state.wallet?.accountToken}:${target.fundedChatId}`
      : `${base.host?.id}:${target.projectId}:${target.id}`, text);
    void complete(id).then(() => {
      if (live.current.scope !== scope || selection.current !== id) return;
      select(null); live.current.base.actions.selectSession(target.id);
    }).catch(() => {});
  };
  const submit = async (id: string, text: string) => {
    if (busy.current.has(id)) throw new Error('Your message is already being sent.');
    let row = records.read().find(item => item.id === id && !item.completed);
    if (!row?.automatic || !text.trim() || text.length > 4000) throw new Error('Use a message under 4,000 characters.');
    if (new TextEncoder().encode(text).length > 8192) throw new Error('Use a message under 8 KB.');
    const epoch = lifecycle.current.version; const route = navigation.current;
    const assertCurrent = () => {
      if (lifecycle.current.version !== epoch || navigation.current !== route) throw new Error(
        'This connection or terminal changed. Open this terminal and send again.');
      if (live.current.scope !== scope || live.current.store !== store || selection.current !== id ||
        live.current.base.status !== 'connected' || !canStartWork(live.current.base))
        throw new Error('Reconnect and open this terminal to send.');
    };
    assertCurrent(); busy.current.add(id);
    const publish = (progress: AutoSelectionProgress) => { assertCurrent(); setActivity({ scope, id, epoch, progress }); };
    const decision = { text, assertSelection: assertCurrent, terminalId: id,
      onCandidates: (candidates: import('../vibes/terminalDecision').TerminalCandidate[]) => publish({ phase: 'selecting', candidates }) };
    const update = async (value: AutoRecord) => { await records.change(items => items.map(item => item.id === id ? value : item)); row = value; assertCurrent(); };
    try {
      publish({ phase: 'checking' });
      const options = row.automatic!;
      if (row.deliveryAttempted) throw new Error('Open the terminal to check your message before sending again.');
      if ((row.launchAttempted || row.resolvedAutoSession) && row.autoChoice?.text !== text)
        throw new Error('This terminal was picked for your original message. Restore it to retry, or open a new Auto terminal.');
      if (!row.autoChoice || (!row.resolvedAutoSession && row.autoChoice.text !== text)) {
        let choice: AutoChoice;
        if (options.source === 'vibyra') {
          const models = await store?.api.terminalModels?.(); assertCurrent();
          const result = await choose({ ...decision, source: 'vibyra', rows: (models ?? []).filter(model => model.available) });
          const model = models?.find(model => model.id === result.model);
          if (!model) throw new Error('This model is no longer available.');
          choice = { ...result, text, kind: 'vibyra', tools: model.tools };
        } else {
          const catalogue = await base.actions.listTerminalModels?.(); assertCurrent();
          if (catalogue?.effortVersion !== 1 || !base.actions.submitTurn || !base.conversationAvailable) throw new Error('Update Vibyra on your computer to use Auto.');
          const models = catalogue.models.filter(model => ['codex', 'claude', 'gemini'].includes(model.kind) &&
            (base.conversationProviders ?? ['codex']).includes(model.kind));
          const result = await choose({ ...decision, source: 'accounts', rows: models });
          const model = models.find(model => model.id === result.model)!;
          choice = { ...result, text, kind: model.kind };
        }
        await update({ ...row, autoChoice: choice });
      }
      const choice = row.autoChoice!;
      publish({ phase: 'starting', selection: choice });
      if (!row.resolvedAutoSession) {
        const launch: TerminalLaunchOptions = { ...options, automatic: false, requestId: id.slice(5),
          model: choice.model, effort: choice.effort, tools: choice.tools };
        await update({ ...row, launchAttempted: true });
        const target = await base.actions.createSession(row.projectId, choice.kind, row.title, launch);
        if (!target) throw new Error('Your computer could not open this terminal.');
        await update({ ...row, resolvedAutoSession: target });
      }
      const target = row.resolvedAutoSession!;
      publish({ phase: 'sending', selection: choice });
      if (target.fundedChatId && store) {
        await store.select(target.fundedChatId); assertCurrent();
        const quote = await store.api.quote(target.fundedChatId, text, choice.model, choice.effort);
        assertCurrent();
        if (store.state.selected !== target.fundedChatId) throw new Error('This terminal is no longer selected.');
        await update({ ...row, deliveryAttempted: true });
        if (!await store.send(quote.quote)) throw new Error(store.state.error ?? 'Your message could not be sent.');
      } else {
        if (target.runner !== 'conversation' || !base.actions.submitTurn) throw new Error('Open this terminal to continue on your computer.');
        await update({ ...row, deliveryAttempted: true });
        await base.actions.submitTurn(text, true, [], target.id);
      }
      // Persist attribution and acknowledgement even after navigation/account changes.
      await complete(id);
      if (live.current.scope === scope && selection.current === id) {
        select(null); live.current.base.actions.selectSession(target.id);
      }
    } finally {
      busy.current.delete(id);
      setActivity(current => current?.scope === scope && current.id === id ? undefined : current);
    }
  };
  const hidden = new Set(rows.map(row => row.resolvedAutoSession?.id));
  const completed = new Map(records.rows.filter(row => row.completed && row.autoChoice).map(row => [row.resolvedAutoSession?.id, row.autoChoice!]));
  return { ...base, sessions: [...base.sessions.filter(session => !hidden.has(session.id)).map(session => {
    const choice = completed.get(session.id);
    return choice ? { ...session, autoSelection: { model: choice.model, name: choice.name || choice.model, effort: choice.effort } } : session;
  }), ...rows.map(row => ({ ...row, autoProgress: activity?.scope === scope && activity.id === row.id
    && activity.epoch === lifecycle.current.version ? activity.progress : undefined }))],
    selectedSessionId: rows.some(row => row.id === selected) ? selected : base.selectedSessionId,
    actions: { ...base.actions, submitAutoTerminal: submit, openResolvedAutoTerminal: openResolved,
      selectSession: id => {
        const pending = rows.some(row => row.id === id);
        select(pending ? id : null);
        base.actions.selectSession(pending ? null : id);
      },
      createSession: async (projectId, kind, title, options) => {
        if (!options?.automatic) return base.actions.createSession(projectId, kind, title, options);
        if (!records.ready || !canStartWork(base) || base.status !== 'connected') throw new Error('Reconnect to open a terminal.');
        const session: AutoRecord = { id: `auto:${randomUUID()}`, projectId, kind: 'vibyra', title,
          automatic: options, status: 'running', canInput: true, createdAt: new Date().toISOString() };
        await records.change(items => [...items, session]); select(session.id); return session;
      },
      stopSession: async id => {
        const row = rows.find(row => row.id === id);
        if (!row) return base.actions.stopSession(id);
        if (busy.current.has(id)) throw new Error('Wait for your message to finish sending.');
        if (row.resolvedAutoSession) await base.actions.stopSession(row.resolvedAutoSession.id);
        await records.change(items => items.filter(row => row.id !== id));
        if (selected === id) select(null);
      },
    } };
}
