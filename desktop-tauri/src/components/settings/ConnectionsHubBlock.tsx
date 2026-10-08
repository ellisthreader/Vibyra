import { useState } from 'react';
import { useAccountStore } from '../../state/accountStore';
import { useRunMode } from '../teammates/useRunHistory';
import { catalogueLine, connectable, groupAccounts, mcpUrlProblem, unavailableReason } from '../../../../mobile/src/agents/v2/hubModel.ts';
import { HubAccount } from './HubAccount';
import { HubMark } from './HubMark';
import { accountMark } from './brandMark';
import { LocalMcpBlock } from './LocalMcpBlock';
import { PopularServices } from './PopularServices';
import { SettingsBlock } from './SettingsShared';
import { useMacHub } from './useMacHub';
import '../../styles/connections-hub.css';

/**
 * Agent v2 connections hub on the Mac (§6c). Only when v2 is on for this account; otherwise
 * nothing renders and Settings keeps today's Integrations. Connecting here does not give an
 * account to a teammate — that is each teammate's Access tab.
 */
export function ConnectionsHubBlock() {
  const identity = useAccountStore(s => s.snapshot.profile?.email ?? '');
  const v2 = useRunMode(identity, Boolean(identity)) === 'v2';
  return v2 ? <HubBody /> : null;
}

function HubBody() {
  const hub = useMacHub(true);
  const [url, setUrl] = useState(''), [tried, setTried] = useState(false);
  const [pasting, setPasting] = useState<string | null>(null), [token, setToken] = useState('');
  // A local server is managed in its own block below; it appears in each teammate's Access tab like any account.
  const groups = groupAccounts((hub.connections ?? []).filter(c => c.mcp?.kind !== 'local'), hub.catalogue);
  const mcpEntry = hub.catalogue.find(p => p.kind === 'mcp');
  const problem = mcpUrlProblem(url);
  // Without remote MCP there is nothing to stand in for a built-in service, so its own row stays.
  const mcpOff = Boolean(mcpEntry && !connectable(mcpEntry));
  const popular = mcpOff ? [] : hub.presets, standIns = mcpOff ? new Set<string>() : hub.standIns;
  return <div className="connections-hub" data-testid="connections-hub">
    <SettingsBlock label="Teammate accounts" note="Every account teammates could use. Connecting one doesn’t give it to a teammate — choose that in each teammate’s Access tab.">
      {hub.connections === null && !hub.error ? <p className="hub-note">Checking your accounts…</p> : null}
      {hub.connections?.length === 0 ? <p className="hub-note">Nothing connected yet. Add a service below.</p> : null}
      {groups.map(g => <section key={g.provider} className="hub-group" aria-label={g.name}>
        <header><HubMark id={g.provider} label={g.name} brand={g.mcp ? accountMark(g.accounts[0]!, hub.allPresets) : undefined} /><h4>{g.name}</h4>
          {g.canAdd ? <button type="button" className="btn btn--ghost btn--compact" aria-label={`Add another ${g.name} account`} disabled={hub.busy !== null}
            onClick={() => void hub.addAccount(g.provider)}>{hub.busy === `add:${g.provider}` ? 'Waiting for browser…' : 'Add another'}</button> : null}
        </header>
        {g.accounts.map(c => <HubAccount key={c.id} c={c} hub={hub} />)}
      </section>)}
      {hub.waiting ? <p className="hub-note">Finish signing in in your browser. <button type="button" className="btn btn--ghost btn--compact" onClick={hub.cancel}>Stop waiting</button></p> : null}
      {hub.error ? <p className="hub-error" role="alert">{hub.error}</p> : null}
    </SettingsBlock>
    <SettingsBlock label="Add a service">
      <div className="hub-catalogue">
        {hub.catalogue.filter(p => p.kind !== 'mcp' && !(standIns.has(p.provider) && unavailableReason(p))).map(p => {
          const reason = unavailableReason(p);
          return <div key={p.provider} className={`hub-provider${reason ? ' hub-provider--off' : ''}`}>
            <HubMark id={p.provider} label={p.name} />
            <span><strong>{p.name}</strong><small>{reason ?? catalogueLine(p)}</small></span>
            {reason ? null : <>
              {p.connect.includes('token') ? <button type="button" className="btn btn--ghost btn--compact" onClick={() => setPasting(pasting === p.provider ? null : p.provider)}>Use a token</button> : null}
              <button type="button" className="btn btn--primary btn--compact" aria-label={`Connect ${p.name}`} disabled={hub.busy !== null} onClick={() => void hub.addAccount(p.provider)}>Connect</button>
            </>}
            {pasting === p.provider ? <form className="hub-paste" onSubmit={e => { e.preventDefault(); void hub.paste(p.provider, token.trim()); setToken(''); setPasting(null); }}>
              <input className="input" type="password" aria-label={`${p.name} access token`} placeholder="Paste an access token" value={token} onChange={e => setToken(e.target.value)} />
              <button className="btn btn--primary btn--compact" disabled={!token.trim() || hub.busy !== null}>Add account</button>
            </form> : null}
          </div>;
        })}
      </div>
      <PopularServices presets={popular} busy={hub.busy} onAdd={p => void hub.addPreset(p)} onCancel={hub.cancel} />
    </SettingsBlock>
    <SettingsBlock label="MCP server" note="Add a remote MCP server by its HTTPS address. Sign-in opens in your browser, and every tool asks you first until you mark it as a read.">
      {mcpEntry && connectable(mcpEntry) ? <form className="hub-paste" onSubmit={e => { e.preventDefault(); setTried(true); if (!problem) void hub.addMcp(url).then(ok => { if (ok) { setUrl(''); setTried(false); } }); }}>
        <input className="input" aria-label="MCP server address" placeholder="https://mcp.example.com/mcp" value={url} onChange={e => { setUrl(e.target.value); setTried(false); }} />
        <button className="btn btn--primary btn--compact" disabled={!url.trim() || hub.busy !== null}>Add MCP server</button>
      </form> : <p className="hub-note">{mcpEntry ? unavailableReason(mcpEntry) : 'Checking…'}</p>}
      {tried && problem ? <p className="hub-error" role="alert">{problem}</p> : null}
    </SettingsBlock>
    <LocalMcpBlock hub={hub} />
  </div>;
}
