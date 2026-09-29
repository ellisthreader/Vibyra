import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { Icon } from './primitives';

export type TerminalFundingSource = 'accounts' | 'vibyra';
export function TerminalFunding({ value, onChange, disabled, balance }: {
  value: TerminalFundingSource; onChange(value: TerminalFundingSource): void; disabled: boolean; balance?: number;
}) {
  const { colors } = useTheme();
  const balanceLabel = balance === undefined ? 'Uses your balance' : `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens`;
  return <View style={s.section} testID="terminal-funding">
    <View style={s.tabs}>
      {(['accounts', 'vibyra'] as const).map(source => <Pressable key={source} accessibilityRole="tab"
        accessibilityLabel={source === 'accounts' ? 'Your AI accounts' : 'Vibyra tokens'}
        accessibilityHint={source === 'accounts' ? 'Uses your connected provider account.' : `${balanceLabel}. Usage is paid from your Vibyra token balance.`}
        accessibilityState={{ selected: value === source, disabled }} disabled={disabled} onPress={() => onChange(source)}
        style={[s.tab, { borderColor: value === source ? colors.accent : colors.border,
          backgroundColor: value === source ? colors.accentSoft : colors.surface }]}>
        <View style={s.top}><Icon name={source === 'accounts' ? 'person-circle-outline' : 'wallet-outline'} size={20} color={value === source ? colors.accent : colors.muted} />
          {value === source && <Icon name="checkmark-circle" size={18} color={colors.accent} />}</View>
        <Text style={[font.footnote, s.title, { color: colors.text }]}>
          {source === 'accounts' ? 'Your AI accounts' : 'Vibyra tokens'}
        </Text>
        {source === 'vibyra' && <Text style={[s.cost, { color: value === source ? colors.accent : colors.muted }]}>
          {balanceLabel}</Text>}
      </Pressable>)}
    </View>
  </View>;
}
const s = StyleSheet.create({ section: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  tabs: { flexDirection: 'row', gap: 10 }, top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  tab: { flex: 1, minHeight: 84, borderWidth: 1.5, borderRadius: 16, padding: 10, gap: 3 },
  title: { fontWeight: '600' }, cost: { fontSize: 12, lineHeight: 17, fontWeight: '600' } });
