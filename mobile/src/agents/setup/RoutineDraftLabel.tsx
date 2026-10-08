import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { font } from '../../ui/font';
import { Icon } from '../../ui/primitives';

/** Routines are saved on this phone only; nothing schedules them until the backend ships one. */
export const ROUTINE_DRAFT_LABEL = 'Draft · not running yet';
export const ROUTINE_DRAFT_NOTE =
  'Routines will run on their own once scheduling ships. Until then they stay saved here as drafts.';

export function RoutineDraftLabel() {
  const { colors } = useTheme();
  return (
    <View style={[s.pill, { backgroundColor: colors.elevated }]}>
      <Icon name="pause-circle-outline" size={13} color={colors.muted} />
      <Text style={[s.text, { color: colors.muted }]}>{ROUTINE_DRAFT_LABEL}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  text: { ...font.caption },
});
