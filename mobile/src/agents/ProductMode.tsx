import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import { useTheme } from '../theme';

export type ProductMode = 'work' | 'agent';
export function useProductMode(identity: string | null) {
  const key = `product-mode.${encodeURIComponent(identity ?? 'guest')}`;
  const [choice, setChoice] = useState<{ key: string; mode: ProductMode }>({ key, mode: 'work' });
  const epoch = useRef(0);
  useEffect(() => {
    const version = ++epoch.current;
    void readFlag(key).then(value => { if (version === epoch.current) setChoice({ key, mode: value === 'agent' ? 'agent' : 'work' }); }).catch(() => {});
    return () => { ++epoch.current; };
  }, [key]);
  const mode = choice.key === key ? choice.mode : 'work';
  const choose = (mode: ProductMode) => {
    ++epoch.current; Keyboard.dismiss(); setChoice({ key, mode }); void writeFlag(key, mode).catch(() => {});
  };
  return [mode, choose] as const;
}
export function ProductModeSwitch({ mode, onChange }: { mode: ProductMode; onChange(mode: ProductMode): void }) {
  const { colors } = useTheme();
  return <View style={s.row}>{(['work', 'agent'] as const).map(value => <Pressable key={value}
    accessibilityRole="tab" accessibilityLabel={value === 'work' ? 'Code' : 'Agents'} accessibilityState={{ selected: mode === value }} aria-selected={mode === value}
    onPress={() => onChange(value)} style={[s.tab, mode === value && { backgroundColor: colors.elevated }]}>
    <Text style={[s.label, { color: mode === value ? colors.text : colors.muted }]}>{value === 'work' ? 'Code' : 'Agents'}</Text>
  </Pressable>)}</View>;
}
const s = StyleSheet.create({ row: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center' },
  tab: { minHeight: 44, paddingHorizontal: 17, borderRadius: 7, justifyContent: 'center' }, label: { fontFamily: 'DM Sans', fontSize: 14, fontWeight: '500' } });
