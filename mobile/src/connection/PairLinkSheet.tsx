import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { ThemeContext, type AccentId } from '../theme';
import type { HeldPairLink } from '../state/pairLink';
import { Button, Hint, Icon } from '../ui/primitives';
import { Sheet } from '../ui/Sheet';
import { workspacePalette } from '../ui/workspacePalette';

/**
 * A `vibyra://pair` link from outside the app names a computer this phone is not paired with
 * (F-29). It waits here: the computer's name in plain text, and nothing changes -- the current
 * connection and session stay -- until Pair is tapped. Cancel, the close button or a swipe down
 * drop the link.
 *
 * It is drawn above the whole app, outside `WorkspaceApp`'s own theme, so it carries the person's
 * theme and accent itself.
 */
export function PairLinkSheet({ held, replaces, themePreference, accent, onPair, onCancel }: {
  held: HeldPairLink | null;
  /** The computer this phone is paired with now, when Pair would switch away from it. */
  replaces: string | null;
  themePreference: 'light' | 'dark' | 'system';
  accent?: AccentId;
  onPair: () => void;
  onCancel: () => void;
}) {
  const scheme = useColorScheme();
  const dark = themePreference === 'dark' || (themePreference === 'system' && scheme !== 'light');
  const colors = workspacePalette(dark, accent);
  return (
    <ThemeContext.Provider value={{ colors, dark }}>
      <Sheet title="Pair a computer?" visible={held !== null} onClose={onCancel}>
        <View style={[s.icon, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <Icon name="desktop-outline" size={26} color={colors.accent} />
        </View>
        <Text selectable numberOfLines={2} testID="pair-link-name" style={[s.name, { color: colors.text }]}>
          {held?.name}
        </Text>
        <Text style={[s.body, { color: colors.text }]}>
          A link asked this phone to pair with this computer.
          {replaces ? ` Pairing switches this phone from ${replaces} to it.` : ''}
        </Text>
        <Hint>Only pair if you started this from Vibyra on your own computer.</Hint>
        <Button title="Pair" onPress={onPair} />
        <Button title="Cancel" secondary onPress={onCancel} />
      </Sheet>
    </ThemeContext.Provider>
  );
}
const s = StyleSheet.create({
  icon: { width: 52, height: 52, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  name: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.6, marginTop: -4 },
  body: { fontSize: 16, lineHeight: 23, letterSpacing: -0.2 },
});
