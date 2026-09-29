import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';

export type TileTone = 'accent' | 'success' | 'error' | 'muted';

/** The rounded square that leads a Preview row: what it is, or how it is going. */
export function PreviewTile({ icon, tone = 'accent', size = 40 }: { icon: IconName; tone?: TileTone; size?: number }) {
  const { colors } = useTheme();
  const paint = {
    accent: [colors.accentSoft, colors.accent],
    success: [colors.successSoft, colors.success],
    error: [colors.errorSoft, colors.error],
    muted: [colors.elevated, colors.muted],
  }[tone];
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={[s.tile, { width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: paint[0] }]}>
    <Icon name={icon} size={Math.round(size * 0.5)} color={paint[1]} />
  </View>;
}

const s = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
