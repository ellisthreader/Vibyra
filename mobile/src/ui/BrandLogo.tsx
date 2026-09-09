import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';
import { brandFor } from './brands';

export function BrandLogo({ vendor, size = 38 }: { vendor: string; size?: number }) {
  const { colors } = useTheme();
  const brand = brandFor(vendor);
  return <View style={[s.tile, { width: size, height: size, borderRadius: size / 3, backgroundColor: colors.elevated }]}>
    {brand.path ? <Svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24"><Path d={brand.path} fill={colors.text} /></Svg>
      : <Text style={[s.initial, { fontSize: size * 0.44, color: colors.text }]}>{brand.name.charAt(0)}</Text>}
  </View>;
}
const s = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '600' },
});
