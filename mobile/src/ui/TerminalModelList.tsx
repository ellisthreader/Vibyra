import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { Hint, Icon } from './primitives';
import type { TerminalModel } from './types';

export function TerminalModelList({
  models,
  loading,
  error,
  busy,
  starting,
  refresh,
  choose,
}: {
  models: TerminalModel[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  starting: string | null;
  refresh(): void;
  choose(model: TerminalModel): void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const shown = models.filter((model) =>
    `${model.name} ${model.id}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <View style={s.list}>
      <View style={[s.search, { backgroundColor: colors.surface }]}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          accessibilityLabel="Search computer models"
          placeholder="Search models"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          editable={!busy}
          autoCorrect={false}
          returnKeyType="done"
          style={[s.input, { color: colors.text }]}
        />
      </View>
      {loading ? (
        <ActivityIndicator
          accessibilityLabel="Loading computer models"
          color={colors.accent}
          style={s.loading}
        />
      ) : error ? (
        <Hint error>{error}</Hint>
      ) : shown.length === 0 ? (
        <Hint>
          {search
            ? 'No matching models.'
            : 'Enable this AI in Settings → Integrations on your computer.'}
        </Hint>
      ) : (
        shown.map((model) => (
          <Pressable
            key={model.id}
            accessibilityRole="button"
            accessibilityLabel={model.name}
            accessibilityState={{ disabled: busy, busy: starting === model.id }}
            disabled={busy}
            onPress={() => choose(model)}
            style={({ pressed }) => [
              s.model,
              {
                borderColor: colors.border,
                opacity: busy && starting !== model.id ? 0.4 : 1,
                backgroundColor: pressed ? colors.elevated : 'transparent',
              },
            ]}
          >
            <Text style={[s.name, { color: colors.text }]}>{model.name}</Text>
            {model.isNew && (
              <Text style={[s.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}>
                New
              </Text>
            )}
            {starting === model.id ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Icon name="arrow-up-outline" size={18} color={colors.muted} />
            )}
          </Pressable>
        ))
      )}
      {!loading && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh computer models"
          disabled={busy}
          onPress={refresh}
          style={s.refresh}
        >
          <Icon name="refresh-outline" size={15} color={colors.muted} />
          <Text style={[font.footnote, { color: colors.muted }]}>Synced from your computer</Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  list: { gap: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  input: {
    ...font.body,
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    paddingVertical: 12,
    outlineWidth: 0,
  },
  model: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { ...font.headline, flex: 1 },
  badge: { ...font.caption, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  loading: { padding: 30 },
  refresh: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
});
