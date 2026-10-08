import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Mark } from '../../ui/BrandLogo';
import { Hint } from '../../ui/primitives';
import { font } from '../../ui/font';
import { CANCELLED } from '../../integrations/authorizeInBrowser';
import { integrationBrand } from '../../integrations/integrationBrands';
import { hubSignIn } from '../../integrations/hub/hubSignIn';
import type { ConnectionsApi } from '../v2/connectionsModel';
import { markId } from '../v2/providerLabels';
import { operationsLine, type Template } from '../v2/templatesModel';
import { TextAction, bits } from './RoutineBits';

/**
 * What a starter suggests this teammate can use. These are suggestions only: nothing is ticked,
 * granted or connected until the person does it — Connect signs in, and the account rows below are
 * where each read or change is allowed.
 */
export function TemplateSuggestions({ template, connections, onConnected, onDismiss }: {
  template: Template; connections?: ConnectionsApi; onConnected(): void; onDismiss(): void;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!template.providers.length) return null;
  const connect = async (provider: string) => {
    if (!connections) return;
    setBusy(provider); setError('');
    try { await hubSignIn(connections, returnUrl => connections.start(provider, returnUrl)); onConnected(); }
    catch (e) { const words = e instanceof Error ? e.message : 'Sign-in did not finish.'; if (words !== CANCELLED && !/cancelled/i.test(words)) setError(words); }
    finally { setBusy(null); }
  };
  return (
    <View style={[bits.card, s.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="template-suggestions">
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{`Suggested for ${template.name}`}</Text>
      <Text style={[s.detail, { color: colors.muted }]}>Nothing is allowed yet. Tick what it may do in Accounts below.</Text>
      {template.providers.map(p => (
        <View key={p.provider} style={s.row}>
          <Mark brand={integrationBrand(markId(p.provider))} size={26} />
          <View style={s.grow}>
            <Text style={[bits.name, { color: colors.text }]}>{p.name}</Text>
            <Text style={[s.detail, { color: colors.muted }]}>{p.why}</Text>
            <Text style={[s.detail, { color: colors.muted }]}>{operationsLine(p)}</Text>
            {p.connected ? <Text style={[s.detail, { color: colors.success }]}>Connected</Text>
              : connections ? <TextAction label={busy === p.provider ? 'Connecting…' : `Connect ${p.name}`} a11y={`Connect ${p.name}`} disabled={busy !== null} onPress={() => void connect(p.provider)} /> : null}
          </View>
        </View>
      ))}
      {error ? <Hint error>{error}</Hint> : null}
      <TextAction label="Dismiss suggestions" onPress={onDismiss} />
    </View>
  );
}
const s = StyleSheet.create({
  card: { gap: 12 }, title: { ...font.headline, fontSize: 16 }, detail: { ...font.footnote },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, grow: { flex: 1, minWidth: 0, gap: 1 },
});
