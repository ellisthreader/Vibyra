import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';

/**
 * The account's face: its photo, or the first letter of its name (or email) on the
 * accent's soft fill. Decorative on purpose — whatever holds it names the person or
 * the action, so a screen reader hears that once rather than "image" beside it.
 * A photo that fails to load falls back to the letter instead of an empty circle.
 */
export function Avatar({ name, email, uri, size = 40 }: {
  name?: string | null; email?: string | null; uri?: string | null; size?: number;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  const round = { width: size, height: size, borderRadius: size / 2 };
  const source = name?.trim() || email?.trim();
  // With no account there is no letter to show, so the circle holds a person instead of a "?".
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
    style={[s.frame, round, { backgroundColor: source ? colors.accentSoft : colors.elevated }]}>
    {uri && !failed
      ? <Image source={{ uri }} onError={() => setFailed(true)} style={round} resizeMode="cover" />
      : source ? <Text style={[s.letter, { color: colors.accent, fontSize: Math.round(size * 0.4) }]}>{source.slice(0, 1).toUpperCase()}</Text>
        : <Icon name="person" size={Math.round(size * 0.48)} color={colors.muted} />}
  </View>;
}
const s = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  letter: { fontWeight: '600', includeFontPadding: false },
});
