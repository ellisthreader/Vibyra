import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { Icon } from './primitives';

export function TerminalOptions({
  title,
  setTitle,
  safeMode,
  setSafeMode,
  disabled,
}: {
  title: string;
  setTitle(value: string): void;
  safeMode: boolean;
  setSafeMode(value: boolean): void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.section, { borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Terminal options"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={s.row}
      >
        <Icon name="options-outline" size={19} color={colors.muted} />
        <Text style={[s.label, { color: colors.text }]}>Options</Text>
        <Text style={[font.footnote, { color: colors.muted }]}>
          {safeMode ? 'Safe mode on' : title ? 'Named' : 'Optional'}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={s.content}>
          <TextInput
            accessibilityLabel="Session name"
            placeholder="Name (optional)"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
            editable={!disabled}
            maxLength={120}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            style={[
              s.input,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
            ]}
          />
          <View style={s.row}>
            <View style={s.copy}>
              <Text style={[font.row, { color: colors.text }]}>Safe mode</Text>
              <Text style={[font.footnote, { color: colors.muted }]}>
                {safeMode
                  ? 'Use a separate worktree. Approve any checkpoint on your computer.'
                  : 'Off · Work directly in this project.'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Safe mode"
              value={safeMode}
              onValueChange={setSafeMode}
              disabled={disabled}
              trackColor={{ true: colors.action, false: colors.border }}
              ios_backgroundColor={colors.border}
            />
          </View>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  section: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 10 },
  label: { ...font.row, flex: 1 },
  content: { gap: 4, paddingBottom: 12 },
  copy: { flex: 1, gap: 4 },
  input: {
    ...font.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    outlineWidth: 0,
  },
});
