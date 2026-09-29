import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { Icon } from './primitives';

export function FundedTerminalOptions({ title, setTitle, budget, setBudget, disabled }: {
  title: string; setTitle(value: string): void; budget: string; setBudget(value: string): void; disabled: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return <View style={s.section}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={s.row}>
      <Text style={[font.row, { color: colors.text, flex: 1 }]}>More options</Text><Icon name={open ? 'chevron-up' : 'chevron-down'} color={colors.muted} size={18} />
    </Pressable>
    {open && <View style={s.fields}>
      <Text style={[font.footnote, { color: colors.muted }]}>Terminal name</Text>
      <TextInput accessibilityLabel="Terminal name" value={title} onChangeText={setTitle} editable={!disabled} maxLength={100}
        placeholder="Optional" placeholderTextColor={colors.muted} style={[s.input, { color: colors.text, borderColor: colors.border }]} />
      <Text style={[font.footnote, { color: colors.muted }]}>Session limit (Vibyra tokens)</Text>
      <TextInput accessibilityLabel="Session token limit" value={budget} onChangeText={setBudget} keyboardType="number-pad" editable={!disabled} maxLength={4}
        style={[s.input, { color: colors.text, borderColor: colors.border }]} />
      <Text style={[font.footnote, { color: colors.muted }]}>Stops at this limit. You only pay for usage.</Text>
    </View>}
  </View>;
}
const s = StyleSheet.create({ section: { gap: 10 }, row: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
  fields: { gap: 10, paddingBottom: 16 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 } });
