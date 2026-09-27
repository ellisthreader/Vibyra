import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { useSheetBottomInset } from '../OverlaySheet';
import { WizardButton } from './WizardButton';

export interface FooterAction {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}

/**
 * The strip every step ends with, outside the scroll so a long grid never
 * pushes Continue below the fold. The primary action is a full button; the
 * quiet ones are text, because skipping a question must not look as weighted
 * as answering it.
 */
export function WizardFooter({
  primary,
  secondary,
  quiet = [],
}: {
  primary?: FooterAction;
  secondary?: FooterAction;
  quiet?: FooterAction[];
}) {
  const { colors } = useTheme();
  const bottom = useSheetBottomInset();
  if (!primary && !secondary && quiet.length === 0) return null;
  return (
    <View
      style={[s.strip, { borderTopColor: colors.border, paddingBottom: Math.max(bottom, 12) + 4 }]}
    >
      {(primary || secondary) && (
        <View style={s.buttons}>
          {secondary && (
            <View style={s.grow}>
              <WizardButton
                title={secondary.title}
                label={secondary.label}
                secondary
                disabled={secondary.disabled}
                busy={secondary.busy}
                onPress={secondary.onPress}
              />
            </View>
          )}
          {primary && (
            <View style={s.grow}>
              <WizardButton
                title={primary.title}
                label={primary.label}
                disabled={primary.disabled}
                busy={primary.busy}
                onPress={primary.onPress}
              />
            </View>
          )}
        </View>
      )}
      {quiet.length > 0 && (
        <View style={s.quietRow}>
          {quiet.map((action) => (
            <Pressable
              key={action.title}
              accessibilityRole="button"
              accessibilityLabel={action.label ?? action.title}
              disabled={action.disabled}
              onPress={action.onPress}
              hitSlop={8}
              style={({ pressed }) => [
                s.quiet,
                { opacity: action.disabled ? 0.4 : pressed ? 0.55 : 1 },
              ]}
            >
              <Text style={[s.quietText, { color: colors.muted }]}>{action.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  strip: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buttons: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  quietRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 22,
    flexWrap: 'wrap',
  },
  quiet: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  quietText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
});
