import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark } from '../ui/primitives';

export function OnboardingBrand() {
  const { colors } = useTheme();
  return <View style={s.brand}><BrandMark size={25} /><Text style={[s.wordmark, { color: colors.text }]}>vibyra</Text></View>;
}
const s = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wordmark: { fontSize: 20, fontWeight: '600', letterSpacing: -0.6 },
});
