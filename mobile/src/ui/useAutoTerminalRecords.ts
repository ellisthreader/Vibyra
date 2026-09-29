import { useEffect, useRef, useState } from 'react';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import type { Effort } from '../vibes/types';
import type { Session, TerminalRunner } from './types';

export type AutoChoice = { text: string; model: string; name: string; effort: Effort | null; kind: TerminalRunner | 'vibyra'; tools?: boolean };
export type AutoRecord = Session & { autoChoice?: AutoChoice; deliveryAttempted?: boolean; launchAttempted?: boolean; completed?: boolean };
const writes = new Map<string, Promise<unknown>>();
function decode(value: string | null): AutoRecord[] {
  try {
    const rows: unknown = JSON.parse(value || '[]');
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.id === 'string' && row.id.startsWith('auto:') && row.automatic) : [];
  } catch { return []; }
}

/** Serialize read/modify/write, including completion after changing computers. */
export function useAutoTerminalRecords(scope: string) {
  const [saved, setSaved] = useState({ scope: '', rows: [] as AutoRecord[] });
  const current = useRef(scope); current.current = scope;
  const mounted = useRef(false);
  const records = useRef(saved);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void (async () => {
      await writes.get(scope)?.catch(() => {});
      const value = { scope, rows: decode(await readFlag(scope)) };
      if (active) { records.current = value; setSaved(value); }
    })().catch(() => { /* Stay unavailable if secure storage cannot be read. */ });
    return () => { active = false; mounted.current = false; };
  }, [scope]);
  const change = (update: (rows: AutoRecord[]) => AutoRecord[]) => {
    const next = (writes.get(scope) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const rows = update(decode(await readFlag(scope)));
      await writeFlag(scope, JSON.stringify(rows));
      if (mounted.current && current.current === scope) {
        const value = { scope, rows }; records.current = value; setSaved(value);
      }
    });
    writes.set(scope, next);
    void next.finally(() => { if (writes.get(scope) === next) writes.delete(scope); }).catch(() => {});
    return next;
  };
  return { ready: saved.scope === scope, rows: saved.scope === scope ? saved.rows : [], change,
    read: () => records.current.scope === scope ? records.current.rows : [] };
}
