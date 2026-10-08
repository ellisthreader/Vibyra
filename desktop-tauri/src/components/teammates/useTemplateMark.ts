import { useEffect, useMemo, useState } from 'react';
import { parseTemplateMark, templateMarkKey, type Template } from '../../../../mobile/src/agents/v2/templatesModel.ts';
import { teammateApi } from './api';
import { overviewClient, type OverviewClient } from './overviewClient';

const cached = new Map<string, Promise<Template[]>>();
/** The starter list, asked once per session. */
export function loadTemplates(client: OverviewClient, identity: string): Promise<Template[]> {
  let asked = cached.get(identity);
  if (!asked) { asked = client.templates(); cached.set(identity, asked); asked.catch(() => cached.delete(identity)); }
  return asked;
}

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };

/**
 * Which starter this teammate came from, remembered on this Mac until the person dismisses its
 * suggestions. Suggestions are only ever shown; nothing in them is granted or scheduled.
 */
export function useTemplateMark(identity: string, agentId?: string) {
  const client = useMemo(() => overviewClient(teammateApi), []);
  const [template, setTemplate] = useState<Template | null>(null);
  useEffect(() => {
    const key = agentId ? parseTemplateMark(read(templateMarkKey(identity, agentId))) : null;
    if (!key) { setTemplate(null); return; }
    let live = true;
    void loadTemplates(client, identity).then(list => { if (live) setTemplate(list.find(t => t.key === key) ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [client, identity, agentId]);
  const dismiss = () => { if (agentId) { try { localStorage.removeItem(templateMarkKey(identity, agentId)); } catch { /* the card still closes */ } } setTemplate(null); };
  return { template, dismiss };
}
