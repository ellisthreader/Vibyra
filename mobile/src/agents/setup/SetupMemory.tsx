import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/primitives';
import { form, SetupField, SetupHeading, SetupSection } from './SetupForm';

export function SetupMemory({
  name,
  timezone,
  text,
  disabled,
  onChange,
}: {
  name: string;
  timezone: string;
  text: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const { colors } = useTheme();
  const facts = [name && `Name: ${name}`, timezone && `Timezone: ${timezone}`]
    .filter(Boolean)
    .join('\n');
  const suggestions = [
    ...(facts ? [{ label: 'Use my name & timezone', value: facts }] : []),
    { label: 'Keep it concise', value: 'Keep answers concise.' },
    { label: 'Include sources', value: 'Include source links when making factual claims.' },
    { label: 'Explain step by step', value: 'Explain unfamiliar tasks step by step.' },
  ];
  return (
    <View style={form.body}>
      <SetupHeading
        title="Memory"
        description="Save the context and preferences this teammate should remember."
      />
      <SetupField
        label="What it should know"
        accessibilityLabel="Teammate memory"
        value={text}
        onChangeText={onChange}
        editable={!disabled}
        multiline
        maxLength={4000}
        placeholder="Your role, preferences, timezone, or how you like answers…"
        hint="Only the text you save here becomes its memory."
      />
      <SetupSection label="Quick add">
        <View style={s.choices}>
          {suggestions.map((item) => {
            const added = text.includes(item.value);
            return (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                disabled={disabled || added}
                onPress={() =>
                  onChange([text.trim(), item.value].filter(Boolean).join('\n').slice(0, 4000))
                }
                style={({ pressed }) => [
                  s.choice,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.elevated : colors.surface,
                    opacity: disabled ? 0.5 : 1,
                  },
                ]}
              >
                <Icon
                  name={added ? 'checkmark' : 'add'}
                  size={15}
                  color={added ? colors.accent : colors.muted}
                />
                <Text style={[s.choiceText, { color: added ? colors.muted : colors.text }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SetupSection>
    </View>
  );
}
const s = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  choiceText: { fontSize: 14, fontWeight: '500', letterSpacing: -0.15 },
});
