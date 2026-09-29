import { useEffect, useRef, useState } from 'react';
import { asEffort } from '../ui/effort';
import type { ConversationSnapshot } from '../state/conversationTypes';
import type { Effort } from '../vibes/types';

/** Draft slider values become selected settings only after Host acknowledgement. */
export function useConversationEffort(
  snapshot: ConversationSnapshot | null | undefined,
  apply: (model: string, effort: string) => Promise<boolean>,
) {
  const [value, setValue] = useState<Effort | null>(asEffort(snapshot?.settings?.effort));
  const latest = useRef(snapshot);
  latest.current = snapshot;
  useEffect(() => {
    setValue(asEffort(snapshot?.settings?.effort));
  }, [
    snapshot?.sessionId,
    snapshot?.generation,
    snapshot?.settings?.revision,
    snapshot?.settings?.effort,
  ]);
  const commit = async () => {
    const settings = snapshot?.settings;
    if (!settings || !value || value === settings.effort) return;
    if (!(await apply(settings.model, value))) setValue(asEffort(latest.current?.settings?.effort));
  };
  return {
    value,
    onChange: setValue,
    onCommit: () => {
      void commit();
    },
  };
}
