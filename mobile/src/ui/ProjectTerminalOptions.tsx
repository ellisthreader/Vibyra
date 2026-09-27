import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { Icon } from './primitives';
import type { TerminalPermission } from './types';

export function ProjectTerminalOptions({ title, setTitle, safeMode, setSafeMode, permission, setPermission, permissionsAvailable, shell, disabled }: {
  title: string; setTitle(value: string): void; safeMode: boolean; setSafeMode(value: boolean): void;
  permission: TerminalPermission; setPermission(value: TerminalPermission): void;
  permissionsAvailable: boolean; shell: boolean; disabled: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const summary = shell ? 'Plain terminal' : !permissionsAvailable ? 'Computer permissions' : permission === 'full' ? 'Full permissions' : 'Standard permissions';
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="More options" aria-expanded={open}
      accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(!open)} style={s.disclosure}>
      <Icon name="options-outline" size={20} color={colors.muted} />
      <View style={s.copy}>
        <Text style={[font.headline, { color: colors.text }]}>More options</Text>
        <Text style={[font.footnote, { color: colors.muted }]}>{summary} · Safe mode {safeMode ? 'on' : 'off'}</Text>
      </View>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
    </Pressable>
    {open && <View style={s.content}>
      {!shell && <View style={s.section}>
        <Text accessibilityRole="header" style={[font.headline, { color: colors.text }]}>Permissions</Text>
        {permissionsAvailable ? <View style={[s.choices, { borderColor: colors.border }]}>
          {(['standard', 'full'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
            accessibilityLabel={value === 'full' ? 'Full permissions' : 'Standard permissions'}
            aria-checked={permission === value} accessibilityState={{ checked: permission === value, disabled }} disabled={disabled}
            onPress={() => setPermission(value)} style={({ pressed }) => [s.choice, {
              backgroundColor: permission === value ? colors.accentSoft : pressed ? colors.elevated : colors.surface,
            }]}>
            <View style={s.copy}>
              <Text style={[font.row, { color: colors.text }]}>{value === 'full' ? 'Full permissions' : 'Standard'}</Text>
              <Text style={[font.subhead, { color: colors.muted }]}>{value === 'full'
                ? 'Run commands and change files without approval prompts.'
                : 'Ask before actions that need extra access.'}</Text>
            </View>
            <Icon name={permission === value ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={permission === value ? colors.accent : colors.muted} />
          </Pressable>)}
        </View> : <Text style={[font.subhead, { color: colors.muted }]}>Uses your computer’s settings. Update Vibyra on your computer to choose permissions here.</Text>}
      </View>}
      <View style={s.section}>
        <View style={s.toggle}>
          <Text style={[s.label, { color: colors.text }]}>Safe mode</Text>
          <Text style={[font.subhead, { color: colors.muted }]}>{safeMode ? 'On' : 'Off'}</Text>
          <Switch accessibilityLabel="Safe mode" value={safeMode} onValueChange={setSafeMode} disabled={disabled}
            trackColor={{ true: colors.action, false: colors.border }} ios_backgroundColor={colors.border} />
        </View>
        <Text style={[font.subhead, { color: colors.muted }]}>Work in a separate copy of your Git project. When off, edits go directly into the project.</Text>
        {safeMode && <Text style={[font.footnote, { color: colors.muted }]}>You may need to approve a save on your computer. Safe mode does not restrict the AI’s permissions.</Text>}
      </View>
      <View style={s.section}>
        <Text style={[font.row, { color: colors.text }]}>Terminal name <Text style={{ color: colors.muted }}>(optional)</Text></Text>
        <TextInput accessibilityLabel="Session name" placeholder="e.g. Build the home page" placeholderTextColor={colors.muted}
          value={title} onChangeText={setTitle} editable={!disabled} maxLength={120} returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
          style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]} />
      </View>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  disclosure: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  copy: { flex: 1, gap: 5 }, content: { gap: 24, paddingTop: 12, paddingBottom: 22 }, section: { gap: 10 },
  choices: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 86 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }, label: { ...font.headline, flex: 1 },
  input: { ...font.body, minHeight: 52, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, outlineWidth: 0 },
});
