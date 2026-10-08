import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { webhookSteps } from '../v2/triggersModel';
import { CopyValue, bits } from './RoutineBits';

/** The webhook URL, the one-time GitHub secret (only right after creating) and the exact provider steps. */
export function WebhookSetup({ kind, url, secret, types }: { kind: string; url: string; secret: string | null; types: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <CopyValue label="Webhook URL" value={url} />
      {secret ? <CopyValue label="Webhook secret" value={secret} secret /> : kind.startsWith('github.') ? (
        <Text style={[bits.body, { color: colors.muted }]}>The secret was shown once, when this trigger was added. For a new one, delete the trigger and add it again.</Text>
      ) : null}
      <View accessibilityRole="list" style={{ gap: 4 }}>
        {webhookSteps(kind, types).map((step, i) => (
          <Text key={i} accessibilityRole="text" style={[bits.body, { color: colors.muted }]}>{i + 1}. {step}</Text>
        ))}
      </View>
    </View>
  );
}
