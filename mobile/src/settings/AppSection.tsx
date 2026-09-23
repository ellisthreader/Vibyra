import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, DEFAULT_FONT_SIZE } from '../terminal/fontFit';
import { useTheme } from '../theme';
import { describeConnection } from '../ui/hostStatus';
import { computerMode, computerRemembered } from '../ui/mode';
import { Icon, type IconName } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import type { SettingsNav, SettingsRoutes } from './pages';
import { Group, Label, Row } from './SettingsRows';

/**
 * The phone's own settings. A computer is named with its state as a dot and opens
 * the Remote page; without one the row is the way to add one. Terminal text only
 * exists for a phone that has had a computer, because there is no terminal otherwise.
 */
export function AppSection({
  workspace,
  nav,
  routes,
}: {
  workspace: WorkspaceModel;
  nav: SettingsNav;
  routes: SettingsRoutes;
}) {
  const { colors } = useTheme();
  const host = computerMode(workspace) || computerRemembered(workspace) ? workspace.host : null;
  const words = describeConnection(workspace);
  const setSize = workspace.actions.setTerminalFontSize;
  return (
    <>
      <Label>App</Label>
      <Group>
        {host ? (
          <Row
            title="Computer"
            value={host.name}
            dot={colors[words.tone]}
            label={`Computer, ${host.name}, ${words.label}`}
            onPress={() => nav.close(routes.remote)}
          />
        ) : (
          <Row title="Connect a computer" onPress={() => nav.close(routes.connect)} />
        )}
        {host && setSize && (
          <Row
            title="Terminal text"
            right={
              <TextSize size={workspace.terminalFontSize ?? DEFAULT_FONT_SIZE} onChange={setSize} />
            }
          />
        )}
        <Row title="Advanced" onPress={() => nav.push('advanced')} />
      </Group>
    </>
  );
}

/**
 * The size the terminal is drawn at — the same size a pinch sets, in whole points.
 * To VoiceOver it is one adjustable control (swipe up or down); in a browser, where
 * that role would hide the two buttons inside it, it is the buttons themselves.
 */
function TextSize({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  const { colors } = useTheme();
  const shown = Math.round(size);
  const set = (next: number) => onChange(Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, next)));
  const native = Platform.OS !== 'web';
  return (
    <View
      accessible={native}
      accessibilityRole={native ? 'adjustable' : undefined}
      accessibilityLabel="Terminal text size"
      accessibilityValue={{
        min: MIN_FONT_SIZE,
        max: MAX_FONT_SIZE,
        now: shown,
        text: `${shown} point`,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        set(shown + (event.nativeEvent.actionName === 'increment' ? 1 : -1))
      }
      style={[s.stepper, { backgroundColor: colors.elevated }]}
    >
      <Step
        icon="remove"
        label="Smaller terminal text"
        disabled={shown <= MIN_FONT_SIZE}
        onPress={() => set(shown - 1)}
      />
      <Text testID="terminal-text-size" style={[s.size, { color: colors.text }]}>
        {shown}
      </Text>
      <Step
        icon="add"
        label="Larger terminal text"
        disabled={shown >= MAX_FONT_SIZE}
        onPress={() => set(shown + 1)}
      />
    </View>
  );
}
function Step({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [s.step, { opacity: disabled ? 0.3 : pressed ? 0.55 : 1 }]}
    >
      <Icon name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}
const s = StyleSheet.create({
  stepper: { height: 32, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  step: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center' },
  size: { minWidth: 26, textAlign: 'center', fontSize: 15, fontVariant: ['tabular-nums'] },
});
