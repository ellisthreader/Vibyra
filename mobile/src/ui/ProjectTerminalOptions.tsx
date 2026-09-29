import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { Icon } from './primitives';
import type { TerminalPermission } from './types';

export function ProjectTerminalOptions({ title, setTitle, safeMode, setSafeMode, permission, setPermission, permissionsAvailable, fullAvailable, shell, disabled, safeIncluded = true }: {
  title: string; setTitle(value: string): void; safeMode: boolean; setSafeMode(value: boolean): void;
  /** False on Free: Safe mode worktrees come with Vibyra Pro. */
  safeIncluded?: boolean;
  permission: TerminalPermission; setPermission(value: TerminalPermission): void;
  permissionsAvailable: boolean; shell: boolean; disabled: boolean; fullAvailable: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return <View>
    {!shell && <View style={s.permissions}>
      <Text accessibilityRole="header" style={[font.headline, { color: colors.text }]}>Permissions</Text>
      {permissionsAvailable ? <>
        <View style={s.choices}>
          {(['standard', 'full'] as const).map(value => {
            const unavailable = disabled || (value === 'full' && !fullAvailable);
            return <Pressable key={value} accessibilityRole="radio"
              accessibilityLabel={value === 'full' ? 'Full permissions' : 'Standard permissions'}
              aria-checked={permission === value} accessibilityState={{ checked: permission === value, disabled: unavailable }} disabled={unavailable}
              onPress={() => setPermission(value)} style={({ pressed }) => [s.choice, { opacity: pressed || unavailable ? 0.45 : 1 }]}>
              <Icon name={permission === value ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={permission === value ? colors.accent : colors.muted} />
              <Text style={[font.row, { color: colors.text, flexShrink: 1 }]}>{value === 'full' ? 'Full permissions' : 'Standard'}</Text>
            </Pressable>;
          })}
        </View>
        <Text style={[font.footnote, { color: colors.muted }]}>{!fullAvailable ? 'Full permissions unavailable for this runner.'
          : permission === 'full' ? 'Run commands and edit files without approval prompts.' : 'Ask before actions that need extra access.'}</Text>
      </> : <Text style={[font.subhead, { color: colors.muted }]}>Uses your computer’s settings. Update Vibyra Desktop to choose permissions here.</Text>}
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel="More options" aria-expanded={open}
      accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(!open)} style={s.disclosure}>
      <Text style={[s.label, { color: colors.text }]}>More options</Text>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
    </Pressable>
    {open && <View style={s.content}>
      <View style={s.toggle}>
        <View style={s.copy}>
          <Text style={[font.headline, { color: colors.text }]}>Safe mode{!safeIncluded && <Text style={[font.footnote, { color: colors.accent }]}>  Pro</Text>}</Text>
          <Text style={[font.footnote, { color: colors.muted }]}>{safeIncluded ? 'Work in a separate Git copy.' : 'A separate Git copy for each agent comes with Vibyra Pro.'}</Text>
        </View>
        <View style={s.switchSlot}>
          <Switch accessibilityLabel="Safe mode" accessibilityHint={safeIncluded ? 'Uses a separate Git copy. AI permissions stay as selected.' : 'Needs Vibyra Pro.'}
            value={safeIncluded && safeMode} onValueChange={setSafeMode} disabled={disabled || !safeIncluded} trackColor={{ true: colors.action, false: colors.border }} />
        </View>
      </View>
      <View style={s.section}>
        <Text style={[font.row, { color: colors.text }]}>Terminal name <Text style={{ color: colors.muted }}>(optional)</Text></Text>
        <TextInput accessibilityLabel="Session name" placeholder="e.g. Build the home page" placeholderTextColor={colors.muted}
          value={title} onChangeText={setTitle} editable={!disabled} maxLength={120} returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
          style={[s.input, { color: colors.text, borderBottomColor: colors.border }]} />
      </View>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  permissions: { paddingTop: 20, paddingBottom: 10, gap: 4 }, choices: { flexDirection: 'row', gap: 16 },
  choice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 8 },
  disclosure: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  copy: { flex: 1, gap: 5 }, content: { gap: 24, paddingTop: 4, paddingBottom: 22 }, section: { gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52 },
  switchSlot: { minWidth: 52, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  label: { ...font.row, flex: 1 },
  input: { ...font.body, minHeight: 48, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, outlineWidth: 0 },
});
