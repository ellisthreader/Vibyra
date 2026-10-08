import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teammateApi } from './api';
import { connectionsClient } from './connectionsClient';
import { words } from './routinesClient';
import { useRunMode } from './useRunHistory';
import { HubMark } from '../settings/HubMark';
import { accountMark } from '../settings/brandMark';
import { PopularServices } from '../settings/PopularServices';
import { useMacHub } from '../settings/useMacHub';
import type { Grant, HubConnection, McpServer } from '../../../../mobile/src/agents/v2/connectionsModel.ts';
import { GRANT_WORDS, STATUS_PILL, accountTitle, connectable, grantState, groupAccounts, operationsFor, readsOn, toggleOperation, toolLabel } from '../../../../mobile/src/agents/v2/hubModel.ts';
import { suggestedOperations, type Template } from '../../../../mobile/src/agents/v2/templatesModel.ts';
import '../../styles/connections-hub.css';

/**
 * Agent v2 per-teammate grants in the Access tab. Connected is not allowed: each connected
 * account is listed, but the teammate reaches only what is ticked here — reads as one choice,
 * each change on its own. Renders nothing without v2, so the v1 Access tab is unchanged.
 */
export function TeammateAccounts({ agentId, identity, template }: { agentId?: string; identity: string; template?: Template | null }) {
  const v2 = useRunMode(identity, Boolean(identity)) === 'v2';
  if (!v2) return null;
  return <section className="teammate-accounts" aria-labelledby="teammate-accounts-title">
    <h3 id="teammate-accounts-title">Accounts</h3>
    <p className="profile-help">Connected isn’t the same as allowed. Pick which accounts this teammate may use, and what it may do with each.</p>
    {agentId ? <Grants key={`${identity}:${agentId}`} agentId={agentId} template={template ?? null} /> : <p className="profile-help">Create the teammate first, then choose its accounts.</p>}
  </section>;
}

function Grants({ agentId, template }: { agentId: string; template: Template | null }) {
  const api = useMemo(() => connectionsClient(teammateApi), []);
  // The accounts, catalogue and MCP servers are the hub's own; only the grants belong to this teammate.
  const hub = useMacHub(true), { connections, catalogue, servers } = hub;
  const [grants, setGrants] = useState<Grant[]>([]), [grantError, setGrantError] = useState('');
  const working = useRef(false);
  const [busy, setBusy] = useState<string | null>(null), [toggleError, setError] = useState('');
  const error = toggleError || grantError || hub.error;
  const loadGrants = useCallback(() => api.grants(agentId).then(held => { setGrants(held); setGrantError(''); }, e => setGrantError(words(e))), [api, agentId]);
  useEffect(() => { if (connections) void loadGrants(); }, [connections, loadGrants]);
  const refresh = () => { setError(''); void hub.refresh(); };
  const ops = (c: HubConnection) => operationsFor(c.provider, catalogue, c.mcp ? servers[c.id] ?? ({ tools: [] } as unknown as McpServer) : null);
  const grantOf = (c: HubConnection) => grants.find(g => g.connectionId === c.id && !g.revokedAt);
  const toggle = async (c: HubConnection, choice: string, on: boolean) => {
    if (working.current) return;
    working.current = true;
    const next = toggleOperation(grantOf(c)?.operations ?? [], ops(c), choice, on);
    setBusy(`${c.id}:${choice}`); setError('');
    try {
      if (next.length) { const saved = await api.putGrant(agentId, c.id, next); setGrants(list => [...list.filter(g => g.connectionId !== c.id), saved]); }
      else { await api.revokeGrant(agentId, c.id); setGrants(list => list.filter(g => g.connectionId !== c.id)); }
    } catch (e) { setError(words(e)); } finally { working.current = false; setBusy(null); }
  };
  if (connections === null && !error) return <small>Checking your accounts…</small>;
  const waiting = hub.busy !== null;
  const mcpEntry = hub.catalogue.find(p => p.kind === 'mcp'), popular = mcpEntry && !connectable(mcpEntry) ? [] : hub.presets;
  return <>
    {connections?.length === 0 ? <p className="profile-help">No accounts connected yet. Connect one in Settings → Integrations, then allow it here.</p> : null}
    {groupAccounts(connections ?? [], catalogue).map(g => <div key={g.provider} className="teammate-accounts__group">
      <header><HubMark id={g.provider} size={22} label={g.name} brand={g.mcp ? accountMark(g.accounts[0]!, hub.allPresets) : undefined} /><strong>{g.name}</strong>
        {g.canAdd ? <button type="button" className="btn btn--ghost btn--compact" aria-label={`Add another ${g.name} account`} disabled={waiting}
          onClick={() => void hub.addAccount(g.provider)}>{hub.busy === `add:${g.provider}` ? 'Waiting for browser…' : 'Add another'}</button> : null}</header>
      {g.accounts.map(c => {
        const o = ops(c), held = grantOf(c)?.operations ?? [], state = grantState(grantOf(c), o), title = accountTitle(c);
        const blocked = c.status === 'unconfigured' || c.status === 'needs_review' || c.status === 'reconnect_required';
        const pill = c.status === 'reconnect_required' ? STATUS_PILL.reconnect_required : null;
        // A starter's suggestion is a tag, never a tick: the person still chooses each one.
        const suggested = suggestedOperations(template, c.provider), tag = <span className="teammate-tag">Suggested</span>;
        return <div key={c.id} className={`teammate-account teammate-account--${state}`}>
          <div className="hub-account__head"><strong>{title}</strong>
            <span className={`hub-pill hub-pill--${pill ? pill.tone : state === 'none' ? 'muted' : 'ok'}`}>{pill ? pill.label : state === 'none' ? 'Not allowed' : 'Allowed'}</span></div>
          <small>{blocked ? blockedWords(c) : GRANT_WORDS[state]}</small>
          {c.reconnect ? <div className="hub-actions"><button type="button" className="btn btn--primary btn--compact" aria-label={`Reconnect ${title}`} disabled={waiting}
            onClick={() => void hub.reconnect(c)}>{hub.busy === `reconnect:${c.id}` ? 'Waiting for browser…' : 'Reconnect'}</button></div> : null}
          {!blocked ? <div className="teammate-account__ops">
            {o.reads.length ? <label><input type="checkbox" aria-label={`Allow reading ${title}`} checked={readsOn(held, o)} disabled={busy !== null}
              onChange={e => void toggle(c, 'reads', e.target.checked)} />Read<small>Search and read</small>{o.reads.some(t => suggested.includes(t)) && tag}</label> : null}
            {o.writes.map(tool => <label key={tool}><input type="checkbox" aria-label={`Allow ${toolLabel(tool, c.provider).toLowerCase()} for ${title}`}
              checked={held.includes(tool)} disabled={busy !== null} onChange={e => void toggle(c, tool, e.target.checked)} />{toolLabel(tool, c.provider)}<small>Asks you first</small>{suggested.includes(tool) && tag}</label>)}
          </div> : null}
        </div>;
      })}
    </div>)}
    {hub.waiting ? <p className="hub-note">Finish signing in in your browser. <button type="button" className="btn btn--ghost btn--compact" onClick={hub.cancel}>Stop waiting</button></p> : null}
    <PopularServices presets={popular} busy={hub.busy} onAdd={p => void hub.addPreset(p)} onCancel={hub.cancel} />
    {error ? <p role="alert">{error} <button type="button" onClick={refresh}>Refresh accounts</button></p> : null}
  </>;
}

/** Why an account cannot be allowed right now, in plain words. */
function blockedWords(c: HubConnection) {
  if (c.status === 'needs_review') return 'Its tools changed. Review them in Settings → Integrations first.';
  if (c.status === 'reconnect_required') return 'Sign in again before a teammate can use it.';
  return 'This service isn’t set up on Vibyra yet.';
}
