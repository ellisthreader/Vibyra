import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { inspectorStyles as s } from './inspectorStyles';

export function InspectorRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.row, { borderColor: colors.border }]}
    >
      <View style={s.rowBody}>
        <Text style={[s.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[s.caption, { color: colors.muted }]}>{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={15} color={colors.muted} />
    </Pressable>
  );
}
