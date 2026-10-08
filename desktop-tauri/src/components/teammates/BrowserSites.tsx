import { useCallback, useEffect, useMemo, useState } from 'react';
import { teammateApi } from './api';
import { browserClient, refusalStatus } from './browserClient';
import { words } from './routinesClient';
import {
  BROWSER_SOCKET_NOTE, BROWSER_WORDS, browserHidden, siteLabel, withSite, type BrowserGrant,
} from '../../../../mobile/src/agents/v2/browserModel.ts';
import '../../styles/teammate-browser.css';

/**
 * Agent V2 browser access in the Access tab (Phase 7): the sites this teammate may open in the
 * separate browser on this Mac. Each change saves the whole list; removing the last site removes
 * browser access. Renders nothing while browser tools are off for the account.
 */
export function BrowserSites({ agentId, disabled }: { agentId: string; disabled: boolean }) {
  const api = useMemo(() => browserClient(teammateApi), []);
  const [shown, setShown] = useState(false), [grant, setGrant] = useState<BrowserGrant | null>(null);
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const load = useCallback(async (live: () => boolean = () => true) => {
    try {
      const access = await api.get(agentId);
      if (live()) { setShown(access.enabled); setGrant(access.browser); setError(''); }
    } catch (e) {
      if (!live()) return;
      // v2 or browser tools off, or a bridge that predates the route: stay hidden.
      if (browserHidden(refusalStatus(e)) || /Unsupported teammate operation/.test(words(e))) { setShown(false); return; }
      setShown(true); setError(words(e));
    }
  }, [api, agentId]);
  useEffect(() => { let live = true; void load(() => live); return () => { live = false; }; }, [load]);
  if (!shown) return null;

  const origins = grant?.origins ?? [];
  const save = async (next: string[], key: string) => {
    if (busy) return;
    setBusy(key); setError('');
    try {
      if (next.length) setGrant(await api.put(agentId, next));
      else { await api.remove(agentId); setGrant(null); }
      if (key === 'add') setDraft('');
    } catch (e) {
      if (refusalStatus(e) === 409) await load(); // browser tools switched off: the reload hides this
      setError(words(e));
    } finally { setBusy(null); }
  };
  const add = () => {
    const next = withSite(origins, draft);
    if (typeof next === 'string') setError(next); else void save(next, 'add');
  };
  const locked = disabled || busy !== null;

  return <section className="teammate-computer-grant teammate-browser-sites" aria-labelledby="teammate-browser-title">
    <h3 id="teammate-browser-title">Browser</h3>
    <p>{BROWSER_WORDS}</p>
    {origins.length ? <ul className="teammate-browser-sites__list">{origins.map(origin =>
      <li key={origin} className="teammate-connection"><span><strong>{siteLabel(origin)}</strong></span>
        <button type="button" disabled={locked} aria-label={`Remove ${siteLabel(origin)}`}
          onClick={() => void save(origins.filter(o => o !== origin), `remove:${origin}`)}>Remove</button></li>)}</ul>
      : <p>No sites yet. Add one to let this teammate use the browser.</p>}
    <div className="teammate-browser-sites__add" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}>
      <input aria-label="Site to allow" placeholder="example.com" value={draft} disabled={locked} spellCheck={false} autoCapitalize="off"
        onChange={e => { setDraft(e.target.value); if (error) setError(''); }} />
      <button type="button" disabled={locked || !draft.trim()} onClick={add}>{busy === 'add' ? 'Adding…' : 'Add site'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <p className="teammate-browser-sites__note">{BROWSER_SOCKET_NOTE}</p>
    {grant && <button type="button" className="danger" disabled={locked} onClick={() => void save([], 'all')}>Remove browser access</button>}
  </section>;
}
