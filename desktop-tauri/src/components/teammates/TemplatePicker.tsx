import { useEffect, useMemo, useState } from 'react';
import { type Template } from '../../../../mobile/src/agents/v2/templatesModel.ts';
import { avatarUrl, teammateApi } from './api';
import { overviewClient } from './overviewClient';
import { words } from './routinesClient';
import { createFromTemplate } from './templateCreate';
import { loadTemplates } from './useTemplateMark';
import type { Teammate } from './types';

/**
 * "Start from a template" (v2, new teammate): Inbox triage, PR shepherd, Morning brief, Meeting prep.
 * Choosing one creates the profile only; its suggested access, routine and trigger wait in the Access tab.
 */
export function TemplatePicker({ identity, disabled, onCreated }: { identity: string; disabled: boolean; onCreated(agent: Teammate): void }) {
  const client = useMemo(() => overviewClient(teammateApi), []);
  const [templates, setTemplates] = useState<Template[]>([]), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void loadTemplates(client, identity).then(list => { if (live) setTemplates(list); }).catch(() => {});
    return () => { live = false; };
  }, [client, identity]);
  if (!templates.length) return null;
  const choose = async (t: Template) => {
    if (busy) return;
    setBusy(t.key); setError('');
    try { onCreated(await createFromTemplate(client, localStorage, identity, t.key)); }
    catch (e) { setError(words(e)); } finally { setBusy(null); }
  };
  return <section className="teammate-templates" aria-labelledby="teammate-templates-title">
    <div><h3 id="teammate-templates-title">Start from a template</h3>
      <p className="profile-help">Creates the teammate only. Its suggested access, routine and trigger stay suggestions until you choose them.</p></div>
    <ul>{templates.map(t => <li key={t.key}><button type="button" disabled={disabled || busy !== null} aria-label={`Create ${t.name}`} onClick={() => void choose(t)}>
      <img src={avatarUrl(t.avatar)} alt="" /><span><strong>{busy === t.key ? 'Creating…' : t.name}</strong><small>{t.providers.map(p => p.name).join(' · ') || 'No services'}</small></span></button></li>)}</ul>
    {error && <p role="alert" className="teammate-plan-note">{error}</p>}
  </section>;
}
