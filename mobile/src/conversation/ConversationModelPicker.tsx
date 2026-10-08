import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { InlineModelPicker } from '../vibes/InlineModelPicker';
import type { ModelChoice } from './inspection';
import { conversationProvider } from './provider';

/** Computer-account models keep their exact IDs and Host-owned settings contract. */
export function ConversationModelPicker({
  models,
  selected,
  error,
  unavailable,
  provider,
  saving,
  onSelect,
  onRetry,
  onClose,
  footer,
}: {
  models: ModelChoice[];
  selected?: string;
  error: string;
  saving: boolean;
  unavailable?: string;
  provider?: string;
  footer?: ReactNode;
  onSelect(model: ModelChoice): Promise<boolean>;
  onRetry(): void;
  onClose(): void;
}) {
  const { colors } = useTheme();
  const agent = conversationProvider(provider);
  const companies = [
    {
      vendor: agent.vendor,
      name: agent.company,
      models: models.map((model) => ({ id: model.model, name: model.displayName })),
    },
  ];
  return (
    <InlineModelPicker
      companies={companies}
      selection={selected ?? ''}
      automatic={false}
      disabled={saving || Boolean(unavailable)}
      emptyLabel={unavailable ? 'No running computer agent.' : 'Loading account models…'}
      onClose={onClose}
      onSelect={(id) => {
        const model = models.find((model) => model.model === id);
        return model ? onSelect(model) : Promise.resolve(false);
      }}
      notice={
        <View>
          {unavailable ? (
            <Text style={{ color: colors.muted }}>{unavailable}</Text>
          ) : error ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry account models"
              onPress={onRetry}
              style={s.retry}
            >
              <Text style={{ color: colors.error }}>{error} · Retry</Text>
            </Pressable>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {saving ? 'Applying…' : 'Your computer account · applies to your next turn'}
            </Text>
          )}
          {footer}
        </View>
      }
    />
  );
}
const s = StyleSheet.create({ retry: { minHeight: 44, justifyContent: 'center' } });
