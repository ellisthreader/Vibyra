import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { teammateProviders, engineProvider, providerPreference } from '../engineProviders';
import { BrandLogo } from '../../ui/BrandLogo';
import { Icon } from '../../ui/primitives';
import { useTheme } from '../../theme';
import { font } from '../../ui/font';
import { SetupHeading } from './SetupForm';
export function EnginePicker({
  model,
  disabled,
  onChange,
}: {
  model?: string;
  disabled: boolean;
  onChange(model: string): void;
}) {
  const { colors } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const selected = engineProvider(model);
  return (
    <View style={s.body}>
      <SetupHeading
        title="Engine"
        description="Choose a provider. Vibyra picks the model for each task."
      />
      <View style={s.grid}>
        {teammateProviders.map((provider) => (
          <Pressable
            key={provider.id}
            accessibilityRole="radio"
            accessibilityLabel={provider.name}
            aria-checked={selected === provider.id}
            accessibilityState={{ checked: selected === provider.id, disabled }}
            disabled={disabled}
            onPress={() => onChange(providerPreference(provider.id))}
            style={[
              s.choice,
              {
                flexBasis: narrow ? '100%' : '47%',
                backgroundColor: selected === provider.id ? colors.accentSoft : colors.surface,
                borderColor: selected === provider.id ? colors.accent : colors.border,
                opacity: disabled ? 0.5 : 1,
              },
            ]}
          >
            {provider.id === 'auto' ? (
              <View style={s.auto}>
                <Icon name="sparkles-outline" size={20} color={colors.text} />
              </View>
            ) : (
              <BrandLogo vendor={provider.id} size={28} bare />
            )}
            <Text style={[s.name, { color: colors.text }]}>{provider.name}</Text>
            <Icon
              name={selected === provider.id ? 'checkmark-circle' : 'ellipse-outline'}
              size={17}
              color={selected === provider.id ? colors.accent : colors.muted}
            />
          </Pressable>
        ))}
      </View>
      {!teammateProviders.some((p) => p.id === selected) && (
        <Text style={[s.note, { color: colors.muted }]}>
          Choose a provider to replace the previously saved engine.
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 12,
  },
  name: { ...font.row, flex: 1 },
  auto: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  note: { ...font.footnote },
});
