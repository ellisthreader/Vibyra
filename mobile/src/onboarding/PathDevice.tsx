import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

/** Small native device drawings: crisp at every scale, in either theme. */
export function PathDevice({ phone = false, selected }: { phone?: boolean; selected: boolean }) {
  const { colors } = useTheme();
  const ink = selected ? colors.accent : colors.muted;
  return <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.stage}>
    <View style={[s.screen, phone ? s.phone : s.computer, {
      backgroundColor: colors.background, borderColor: selected ? colors.accent : colors.border,
      shadowColor: colors.text,
    }]}>
      <View style={[phone ? s.camera : s.toolbar, { backgroundColor: colors.border }]} />
      <View style={[s.code, phone && s.phoneCode]}>
        {[0.7, 1, 0.55].map((width, index) => <View key={index} style={[s.line, {
          width: `${width * 100}%`, backgroundColor: ink, opacity: index === 1 ? 0.35 : 0.75,
        }]} />)}
      </View>
      {phone && <View style={[s.home, { backgroundColor: colors.border }]} />}
    </View>
    {!phone && <View style={[s.base, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <View style={[s.notch, { backgroundColor: colors.border }]} />
    </View>}
  </View>;
}

const s = StyleSheet.create({
  stage: { width: 94, height: 62, alignItems: 'center', justifyContent: 'center' },
  screen: { borderWidth: 1.5, shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
  computer: { width: 78, height: 49, borderRadius: 7, padding: 5 },
  phone: { width: 34, height: 60, borderRadius: 9, padding: 5, transform: [{ rotate: '8deg' }] },
  toolbar: { height: 2, width: 13, borderRadius: 2 },
  camera: { height: 3, width: 11, borderRadius: 2, alignSelf: 'center' },
  code: { gap: 4, paddingTop: 8, paddingHorizontal: 6 },
  phoneCode: { paddingHorizontal: 0, gap: 4, paddingTop: 10 },
  line: { height: 3, borderRadius: 2 },
  base: { height: 5, width: 94, borderWidth: 1, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, alignItems: 'center' },
  notch: { width: 18, height: 2, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  home: { position: 'absolute', bottom: 4, width: 11, height: 2, borderRadius: 2, alignSelf: 'center' },
});
