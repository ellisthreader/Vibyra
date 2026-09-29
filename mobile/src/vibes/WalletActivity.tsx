import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import { useVibesStore } from './VibesProvider';

export interface TokenActivity { id: string; kind: string; deltaUnits: string; unitScale: number; createdAt: string }
export interface TokenActivityPage { items: TokenActivity[]; next: string | null }
const labels: Record<string, string> = { grant: 'Tokens added', hold: 'Reserved for a task', settlement: 'Unused tokens returned', expiry: 'Free tokens expired', refund: 'Purchase refunded' };
export function WalletActivity({ scope }: { scope: string }) {
  const store = useVibesStore();
  const { colors } = useTheme();
  const [items, setItems] = useState<TokenActivity[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current++; setItems(null); setNext(null); setError(''); setBusy(false);
    return () => { generation.current++; };
  }, [scope, store]);
  if (!store?.api.activity) return null;
  const load = async (before?: string) => {
    if (busy) return;
    const attempt = generation.current; setBusy(true); setError('');
    try {
      const page = await store.api.activity!(before);
      if (attempt !== generation.current) return;
      setItems(old => before ? [...(old ?? []), ...page.items] : page.items); setNext(page.next);
    } catch (e) { if (attempt === generation.current) setError(e instanceof Error ? e.message : 'Activity unavailable.'); }
    finally { if (attempt === generation.current) setBusy(false); }
  };
  return <View style={{ gap: 10 }}>
    {!items && <Button title="Show token activity" secondary busy={busy} onPress={() => void load()} />}
    {items?.map(item => <Text key={item.id} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
      {new Date(item.createdAt).toLocaleDateString()} · {labels[item.kind] ?? item.kind} · {(Number(item.deltaUnits) / item.unitScale).toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens
    </Text>)}
    {items?.length === 0 && <Hint>No token activity yet.</Hint>}
    {next && <Button title="More activity" secondary busy={busy} onPress={() => void load(next)} />}
    {error && <Hint error>{error}</Hint>}
  </View>;
}
