import { useCallback, useEffect, useState } from 'react';
import { deleteFlag, readFlag } from '../../transport/deviceFlags';
import type { AgentsApi } from '../types';
import { parseTemplateMark, templateMarkKey, type Template } from '../v2/templatesModel';

/**
 * The starter a teammate was made from, while its suggestions are still open on this device. The
 * suggestions are only words and buttons: dismissing them, or never touching them, changes nothing.
 */
export function useTemplateSuggestion(api: AgentsApi, identity: string, agentId: string | undefined, active: boolean) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!agentId || !api.overview || !active) return;
    let live = true;
    (async () => {
      const key = parseTemplateMark(await readFlag(templateMarkKey(identity, agentId)).catch(() => null));
      if (!key) { if (live) setTemplate(null); return; }
      const all = await api.overview!.templates();
      if (live) setTemplate(all.find(t => t.key === key) ?? null);
    })().catch(() => { if (live) setTemplate(null); });
    return () => { live = false; };
  }, [api, identity, agentId, active, nonce]);
  const dismiss = useCallback(async () => {
    setTemplate(null);
    if (agentId) await deleteFlag(templateMarkKey(identity, agentId)).catch(() => {});
  }, [identity, agentId]);
  return { template, dismiss, refresh: () => setNonce(n => n + 1) };
}
