import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { links } from '../settings/links';
import { useTheme } from '../theme';

export function SignupLegalChoices({ terms, adult, disabled, onTerms, onAdult }: {
  terms: boolean; adult: boolean; disabled: boolean;
  onTerms(value: boolean): void; onAdult(value: boolean): void;
}) {
  const { colors } = useTheme();
  const choice = (label: string, checked: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label}
      accessibilityState={{ checked, disabled }} aria-checked={checked} aria-disabled={disabled}
      disabled={disabled} onPress={onPress}
      style={s.choice}>
      <View style={[s.box, { borderColor: checked ? colors.accent : colors.border,
        backgroundColor: checked ? colors.accent : 'transparent' }]}>
        {checked && <Text style={s.tick}>✓</Text>}
      </View>
      <Text style={[s.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
  return <View style={s.group}>
    <Text style={[s.note, { color: colors.muted }]}>New accounts are currently available to adults in the UK.</Text>
    {choice('I agree to Vibyra’s Terms of Service', terms, () => onTerms(!terms))}
    {choice('I am 18 or older and currently in the United Kingdom', adult, () => onAdult(!adult))}
    <View style={s.links}>
      <LegalLink label="Terms of Service" url={links.terms} />
      <LegalLink label="Privacy Policy" url={links.privacy} />
    </View>
  </View>;
}

function LegalLink({ label, url }: { label: string; url: string }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="link" accessibilityLabel={`Read ${label}`}
    onPress={() => void Linking.openURL(url).catch(() => {})} style={s.link}>
    <Text style={[s.linkText, { color: colors.accent }]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  group: { gap: 2, alignSelf: 'stretch' },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 4 },
  choice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 21, height: 21, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', lineHeight: 19 },
  label: { flex: 1, fontSize: 13, lineHeight: 18 },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 16 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 12, lineHeight: 18, textDecorationLine: 'underline' },
});
