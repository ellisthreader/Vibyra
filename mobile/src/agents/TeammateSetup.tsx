import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Hint } from '../ui/primitives';
import { TeammateSetupChat } from './setup/TeammateSetupChat';
import type { AgentsApi, Teammate } from './types';

export function TeammateSetup({
  visible,
  agent,
  api,
  enabled,
  identity,
  onSaved,
}: {
  visible: boolean;
  agent?: Teammate;
  api: AgentsApi;
  enabled: boolean;
  identity: string;
  onClose(): void;
  onSaved(agent: Teammate): void;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState('');
  const archive = async () => {
    if (!agent || busy || locked) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await api.archive(agent, !agent.archived));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this teammate.');
    } finally {
      setBusy(false);
    }
  };
  const title = agent?.archived ? 'Restore teammate' : 'Archive teammate';
  return (
    <View style={{ flex: 1, display: visible ? 'flex' : 'none' }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <TeammateSetupChat
          agent={agent}
          api={api}
          identity={identity}
          name=""
          active={visible && !busy}
          enabled={enabled && !agent?.archived}
          onLockChange={setLocked}
          onSaved={onSaved}
        />
        {error && (
          <View style={s.error}>
            <Hint error>{error}</Hint>
          </View>
        )}
        {/* A quiet second action under Save: archiving is reversible, so it is not a second filled button. */}
        {agent && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            aria-disabled={locked || busy}
            aria-busy={busy}
            accessibilityState={{ disabled: locked || busy, busy }}
            disabled={locked || busy}
            onPress={() => void archive()}
            style={({ pressed }) => [s.archive, { opacity: locked ? 0.4 : pressed ? 0.55 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <Text
                style={[s.archiveText, { color: agent.archived ? colors.accent : colors.muted }]}
              >
                {title}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  error: { paddingHorizontal: 20, paddingBottom: 4 },
  archive: {
    minHeight: 44,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  archiveText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
});
