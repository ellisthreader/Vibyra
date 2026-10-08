import { useEffect, useState } from 'react';
import { agentV2Available } from '../../ipc/agentV2';
import { message } from './api';
import {
  browserTakeovers, onBrowserTakeover, resumeBrowser, showBrowser, siteOrigin, type BrowserTakeover as Takeover,
} from './browserClient';
import { TAKEOVER_TITLE, teammateSays } from './takeoverText';
import '../../styles/teammate-browser.css';

/** Open takeovers by run, from the catch-up list and then the Rust events. */
function useTakeovers(): [Takeover[], (runId: string) => void] {
  const [items, setItems] = useState<Takeover[]>([]);
  const apply = (next: Takeover) => setItems(list => {
    const rest = list.filter(item => item.runId !== next.runId);
    return next.active ? [...rest, next] : rest;
  });
  useEffect(() => {
    if (!agentV2Available()) return;
    let live = true;
    const unlisten = onBrowserTakeover(next => { if (live) apply(next); });
    void browserTakeovers().then(list => { if (live) list.forEach(apply); });
    return () => { live = false; void unlisten.then(fn => fn()).catch(() => {}); };
  }, []);
  return [items, runId => setItems(list => list.filter(item => item.runId !== runId))];
}

/**
 * App-wide card while a teammate waits for the person to sign in inside the separate browser
 * (Agent V2 Phase 7). "Show browser" brings that window forward; "Resume" hands control back.
 */
export function BrowserTakeover() {
  const [items, dismiss] = useTakeovers();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const current = items[items.length - 1];
  if (!current) return null;
  const says = teammateSays(current.reason);
  const act = async (kind: 'show' | 'resume') => {
    setBusy(kind); setError('');
    try {
      if (kind === 'show') await showBrowser(current.runId);
      else { await resumeBrowser(current.runId); dismiss(current.runId); }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  };
  return <aside className="browser-takeover" role="alertdialog" aria-live="assertive" aria-labelledby="browser-takeover-title">
    <div className="browser-takeover__text">
      <h3 id="browser-takeover-title">{TAKEOVER_TITLE}</h3>
      {says && <p className="browser-takeover__says">Your teammate says: “{says}”</p>}
      {current.url && <p className="browser-takeover__site">{siteOrigin(current.url)}</p>}
      {error && <p role="alert" className="browser-takeover__error">{error}</p>}
    </div>
    <div className="browser-takeover__actions">
      <button type="button" className="btn" disabled={busy !== null} onClick={() => void act('show')}>Show browser</button>
      <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => void act('resume')}>{busy === 'resume' ? 'Resuming…' : 'Resume'}</button>
    </div>
  </aside>;
}
