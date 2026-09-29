import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { ModelLogo } from './BrandLogo';
import type { Session } from './types';

export function AutoSelectionNotice({ selection }: { selection: Session['autoSelection'] }) {
  const { colors } = useTheme();
  if (!selection) return null;
  const effort = selection.effort === null ? 'No adjustable effort' : selection.effort === 'none' ? 'Reasoning off'
    : `${({ xhigh: 'Extra high', max: 'Maximum' } as Record<string, string>)[selection.effort] ?? selection.effort[0].toUpperCase() + selection.effort.slice(1)} effort`;
  return <View testID="auto-selection" accessibilityLiveRegion="polite" accessibilityLabel={`Auto selected ${selection.name} · ${effort}`}
    style={{ marginHorizontal: 16, marginVertical: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <ModelLogo id={selection.model} size={30} />
    <View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{selection.name}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Auto selected · {effort}</Text></View>
  </View>;
}
