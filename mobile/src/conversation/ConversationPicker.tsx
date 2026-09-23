import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { ComposerModelPicker } from '../vibes/ComposerModelPicker';
import { useVibes, useVibesStore } from '../vibes/VibesProvider';
import { ConversationModelPicker } from './ConversationModelPicker';

type Props = {
  computer: ComponentProps<typeof ConversationModelPicker>;
  onPhoneChat?(model: string): Promise<void>;
  onUpgrade?(): void;
};
/** All companies open phone chats; the original computer's settings remain a separate choice. */
export function ConversationPicker(props: Props) {
  const store = useVibesStore();
  return store && props.onPhoneChat ? (
    <PhoneAndComputerPicker {...props} onPhoneChat={props.onPhoneChat} />
  ) : (
    <ConversationModelPicker {...props.computer} />
  );
}
function PhoneAndComputerPicker({
  computer,
  onPhoneChat,
  onUpgrade,
}: Props & { onPhoneChat(model: string): Promise<void> }) {
  const { models, wallet } = useVibes();
  const { colors } = useTheme();
  const [scope, setScope] = useState<'phone' | 'computer'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const switchScope = (next: typeof scope, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => setScope(next)}
      style={s.link}
    >
      <Text style={{ color: colors.accent, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  if (scope === 'computer')
    return (
      <ConversationModelPicker
        {...computer}
        footer={switchScope('phone', 'All companies · Phone AI')}
      />
    );
  return (
    <ComposerModelPicker
      selection=""
      models={models}
      paid={Boolean(wallet?.paidAvailable)}
      disabled={busy}
      onClose={computer.onClose}
      onUpgrade={onUpgrade}
      onSelect={async (model) => {
        setBusy(true);
        setError('');
        try {
          await onPhoneChat(model);
          return true;
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'The phone chat could not be opened.');
          return false;
        } finally {
          setBusy(false);
        }
      }}
      notice={
        busy || error || !computer.unavailable ? (
          <View>
            {busy && <Text style={{ color: colors.muted, fontSize: 12 }}>Opening phone chat…</Text>}
            {!!error && <Text style={{ color: colors.error, fontSize: 12 }}>{error}</Text>}
            {!computer.unavailable && switchScope('computer', 'Models for this computer chat')}
          </View>
        ) : undefined
      }
    />
  );
}
const s = StyleSheet.create({ link: { minHeight: 44, justifyContent: 'center' } });
