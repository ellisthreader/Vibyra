import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';

// A desktop connection is a window onto the Mac until the Mac allows typing.
// The screen used to express that by deleting the composer, which reads as a
// broken app rather than a deliberate limit — so this stands in its place and
// says what is happening, and how to read a terminal wider than the phone.
// `typingOff` means the Mac said so outright: typing is its own switch there,
// and naming it is the difference between a dead end and one tap on the Mac.
// A Mac that predates the switch says nothing, and gets no instruction it
// could not follow.
export function ViewOnlyBar({ typingOff = false }: { typingOff?: boolean }) {
  const { colors } = useTheme();
  return <View style={[s.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
    <Icon name="eye-outline" size={15} color={colors.muted} />
    <View style={s.words}>
      <Text style={[s.title, { color: colors.text }]}>Watching your Mac</Text>
      <Text style={[s.detail, { color: colors.muted }]}>
        {typingOff
          ? 'To type here, turn on Typing from your phone in Vibyra on your Mac: Settings > iPhone connection.'
          : 'Type on the computer to run something here. Pinch to resize this terminal.'}
      </Text>
    </View>
  </View>;
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20,
    paddingTop: 12, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
  words: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '600' },
  detail: { fontSize: 12, lineHeight: 17 },
});
