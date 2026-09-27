import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Hint, Icon } from '../../ui/primitives';
import { font } from '../../ui/font';
import { TeammateAvatar } from '../TeammateAvatar';
import type { Avatar, TeammateFields } from '../types';
import { form, SetupField, SetupHeading, SetupSection } from './SetupForm';

export function SetupReview({
  fields,
  locked,
  budgetOnly,
  onChange,
}: {
  fields: TeammateFields;
  locked: boolean;
  budgetOnly: boolean;
  onChange(patch: Partial<TeammateFields>): void;
}) {
  const { colors } = useTheme();
  if (budgetOnly)
    return (
      <View style={form.body}>
        <SetupHeading
          title="Task budget"
          description="Choose how many Vibes this teammate can use for a single task."
        />
        <View style={s.options}>
          {[5, 10, 20].map((budget, i) => (
            <Pressable
              key={budget}
              accessibilityRole="radio"
              accessibilityLabel={`${budget} Vibes per task`}
              aria-checked={fields.budget === budget}
              accessibilityState={{ checked: fields.budget === budget }}
              disabled={locked}
              onPress={() => onChange({ budget })}
              style={[
                s.option,
                {
                  backgroundColor: fields.budget === budget ? colors.accentSoft : colors.surface,
                  borderColor: fields.budget === budget ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={[s.amount, { color: colors.text }]}>{budget}</Text>
              <Text style={[s.tier, { color: colors.muted }]}>
                {['Light', 'Everyday', 'More room'][i]}
              </Text>
              <Icon
                name={fields.budget === budget ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={fields.budget === budget ? colors.accent : colors.muted}
              />
            </Pressable>
          ))}
        </View>
        <SetupField
          label="Vibes per task"
          accessibilityLabel="Vibes per task"
          value={fields.budget ? String(fields.budget) : ''}
          editable={!locked}
          onChangeText={(v) => onChange({ budget: /^\d+$/.test(v) ? Number(v) : 0 })}
          keyboardType="number-pad"
          maxLength={2}
          hint="Choose a whole number from 1 to 50."
        />
        <Text style={[form.description, { color: colors.muted }]}>
          This is a spending limit, not an extra charge. Tasks use your existing balance, and unused
          Vibes are returned.
        </Text>
        {(!Number.isInteger(fields.budget) || fields.budget < 1 || fields.budget > 50) && (
          <Hint error>Choose a whole number from 1 to 50.</Hint>
        )}
      </View>
    );
  return (
    <View style={form.body}>
      <View style={s.identity}>
        <View style={[s.portrait, { backgroundColor: colors.elevated }]}>
          <TeammateAvatar avatar={fields.avatar} size={40} />
        </View>
        <View style={{ flex: 1 }}>
          <SetupField
            label="Name"
            accessibilityLabel="Teammate name"
            value={fields.name}
            editable={!locked}
            onChangeText={(name) => onChange({ name })}
            maxLength={80}
            placeholder="e.g. Research helper"
          />
        </View>
      </View>
      <SetupSection label="Appearance">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.strip}
          contentContainerStyle={s.avatars}
        >
          {(
            [
              'assistant',
              'review',
              'site',
              'oncall',
              'lead',
              'bugs',
              'db',
              'qa',
              'sprout',
            ] as Avatar[]
          ).map((avatar) => (
            <Pressable
              key={avatar}
              accessibilityRole="radio"
              accessibilityLabel={`${avatar} avatar`}
              aria-checked={fields.avatar === avatar}
              accessibilityState={{ checked: fields.avatar === avatar }}
              disabled={locked}
              onPress={() => onChange({ avatar })}
              style={[
                s.avatar,
                fields.avatar === avatar
                  ? {
                      borderColor: colors.accent,
                      backgroundColor: colors.accentSoft,
                      borderWidth: 2,
                    }
                  : { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <TeammateAvatar avatar={avatar} size={30} />
            </Pressable>
          ))}
        </ScrollView>
      </SetupSection>
    </View>
  );
}
const s = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  portrait: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { flexDirection: 'row', gap: 10 },
  option: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 14,
  },
  amount: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  tier: { ...font.caption, fontWeight: '500', marginBottom: 4 },
  strip: { marginHorizontal: -20 },
  avatars: { gap: 8, paddingVertical: 2, paddingHorizontal: 20 },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
});
