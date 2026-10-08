import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelChoice } from '../../../../mobile/src/conversation/inspection';
import { AgentLogo } from '../common/AgentLogo';
import { CheckIcon } from '../common/Icons';
import { ChatSearchIcon } from './chatIcons';
import { effortWords, type ChatModels } from './useChatModels';
import type { ChatCompany, CompanyModel } from './useCompanyModels';
import { useWorkspaceStore } from '../../state/workspaceStore';

/** "Low–X-high": the levels a model offers, as quiet detail beside its name. */
function range(model: ModelChoice) {
  const levels = model.supportedReasoningEfforts.map(level => level.reasoningEffort).filter(level => level !== 'none');
  if (!levels.length) return 'Auto';
  const first = effortWords(levels[0]).label, last = effortWords(levels.at(-1)).label;
  return first === last ? first : `${first}–${last}`;
}

type Row = { key: string; agentId: string; label: string; meta: string; current?: boolean; live?: ModelChoice; other?: CompanyModel };

/**
 * The composer's model menu: search, the company across the top and its
 * models below.
 * The chat's own company switches in place; another company opens a new chat
 * here with this conversation handed over as a draft.
 */
export function ChatModelSwitcher({ models: state, companies, onSwitch, onClose }: {
  models: ChatModels; companies: ChatCompany[]; onSwitch(target: CompanyModel): Promise<boolean>; onClose(): void;
}) {
  const own = state.agent.id;
  const [company, setCompany] = useState(own);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const search = query.trim().toLowerCase();
  const tabs = companies;
  const rowsFor = (agentId: string): Row[] => agentId === own
    ? state.models.map(model => ({ key: `${own}:${model.model}`, agentId: own, label: model.displayName, meta: range(model), current: model === state.chosen, live: model }))
    : (companies.find(item => item.agentId === agentId)?.models ?? []).map(other => ({ key: `${agentId}:${other.model.id}`, agentId, label: other.model.label, meta: 'New chat', other }));
  const rows = useMemo(() => {
    if (!search) return rowsFor(company);
    return tabs.flatMap(item => rowsFor(item.agentId)).filter(row => `${row.label} ${row.live?.model ?? row.other?.model.id ?? ''}`.toLowerCase().includes(search));
  }, [search, company, state.models, state.chosen, companies]);
  useEffect(() => { setActive(Math.max(0, rows.findIndex(row => row.current))); }, [company, search]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const choose = async (row?: Row) => {
    if (!row || state.saving || pending) return;
    if (row.live) { if (row.current || await state.chooseModel(row.live)) onClose(); return; }
    if (!row.other) return;
    setPending(row.key);
    try { if (await onSwitch(row.other)) onClose(); } finally { setPending(''); }
  };
  const step = (by: number) => {
    const index = tabs.findIndex(item => item.agentId === company);
    setCompany(tabs[(index + by + tabs.length) % tabs.length].agentId);
  };
  const selected = tabs.find(item => item.agentId === company);
  const blocked = !search && company !== own && !selected?.models.length;
  const note = search ? 'No models match.' : company !== own ? ''
    : !state.live ? 'Models load once this chat is running.' : state.loading ? 'Loading models…' : state.error ? '' : 'No models on this account.';
  const grouped = Boolean(search);
  return <div className="model-switcher chat-pop" role="dialog" aria-label="Choose company and model" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(rows.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && !query) { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
    else if (event.key === 'Enter') { event.preventDefault(); void choose(rows[active]); }
  }}>
    <label className="model-switcher__search">
      <ChatSearchIcon size={14} />
      <input autoFocus aria-label="Search models" placeholder="Search models" value={query} spellCheck={false}
        onChange={event => setQuery(event.target.value)} />
    </label>
    {!search && <div className="model-switcher__tabs" role="tablist" aria-label="Company">
      {tabs.map(item => <button type="button" role="tab" key={item.agentId} aria-selected={item.agentId === company}
        className={item.agentId === company ? 'is-on' : ''} onClick={() => setCompany(item.agentId)} title={item.name}>
        <AgentLogo agentId={item.agentId} name={item.company} size={16} className="model-switcher__logo" />
        <span>{item.company}</span>
      </button>)}
    </div>}
    <div ref={list} className="model-switcher__rows" role="listbox" aria-label="Models">
      {rows.map((row, index) => <div key={row.key}>
        {grouped && (index === 0 || rows[index - 1].agentId !== row.agentId) && <p className="model-switcher__group">
          <AgentLogo agentId={row.agentId} name={row.agentId} size={14} className="model-switcher__logo" />
          {companies.find(item => item.agentId === row.agentId)?.company}</p>}
        <button type="button" role="option" data-index={index} aria-selected={Boolean(row.current)}
          className={`model-switcher__row ${index === active ? 'is-active' : ''} ${row.other ? 'is-other' : ''}`}
          disabled={state.saving || Boolean(pending)} onMouseEnter={() => setActive(index)} onClick={() => void choose(row)}>
          <span className="model-switcher__name">{row.label}</span>
          <span className="model-switcher__meta">{pending === row.key ? 'Opening…' : row.meta}</span>
          <span className="model-switcher__tick">{row.current && <CheckIcon size={13} />}</span>
        </button>
      </div>)}
      {blocked && <div className="model-switcher__setup">
        <strong>{selected?.name} isn’t ready on this Mac</strong><span>{selected?.blocked}</span>
        <button type="button" onClick={() => { onClose(); useWorkspaceStore.getState().openSettingsSection('ai', 'integrations'); }}>Open AI settings</button>
      </div>}
      {!rows.length && note && <p className="model-switcher__note">{note}</p>}
      {state.error && company === own && !search && <p className="model-switcher__note is-error" role="alert">{state.error}{' '}
        <button type="button" className="chat-link-button" onClick={state.retry}>Try again</button></p>}
    </div>
    {(company !== own || search) && !blocked && <p className="model-switcher__foot">{search ? 'Another company’s model opens a new chat here, with this conversation ready to send.' : `Opens a new ${selected?.name ?? ''} chat in this project, with this conversation ready to send.`}</p>}
  </div>;
}
