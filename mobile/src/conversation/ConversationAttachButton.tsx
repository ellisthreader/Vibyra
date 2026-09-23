import { useState } from 'react';
import { File } from 'expo-file-system';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { choosePhotos } from '../vibes/pickAttachments';
import { uploadAttachment, type ConversationAttachment } from './attachmentUpload';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
export function ConversationAttachButton({
  workspace,
  attachments,
  onChange,
  disabled,
  compact = false,
}: {
  workspace: WorkspaceModel;
  compact?: boolean;
  attachments: ConversationAttachment[];
  onChange: (items: ConversationAttachment[]) => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <View style={s.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach image"
        disabled={disabled || busy || attachments.length >= 4}
        style={compact ? s.compact : s.button}
        onPress={() => {
          setBusy(true);
          setError('');
          void (async () => {
            const picked = await choosePhotos(1);
            if (!picked) return;
            if ('error' in picked) throw new Error(picked.error);
            for (const source of picked.sources) {
              const content =
                Platform.OS === 'web'
                  ? await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result).split(',')[1]);
                      reader.onerror = reject;
                      reader.readAsDataURL(source.file!);
                    })
                  : await new File(source.uri).base64();
              const id = (await import('expo-crypto')).randomUUID();
              const next = await uploadAttachment(
                (p) => workspace.actions.uploadConversationAttachment!(p),
                id,
                source.name,
                source.mimeType,
                content,
              );
              onChange([...attachments, next]);
            }
          })()
            .catch((e) => setError(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        <Icon
          name={busy ? 'ellipsis-horizontal' : 'add'}
          size={21}
          color={disabled ? colors.muted : colors.text}
        />
        {busy && <Text style={{ color: colors.muted, fontSize: 12 }}>Preparing…</Text>}
      </Pressable>
      {!compact &&
        attachments.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            style={s.button}
            onPress={() => onChange(attachments.filter((a) => a.id !== item.id))}
          >
            <Text numberOfLines={1} style={[s.name, { color: colors.muted }]}>
              {item.name}
            </Text>
            <Icon name="close" size={14} color={colors.muted} />
          </Pressable>
        ))}
      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>
          {error}
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  compact: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  button: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontSize: 12, maxWidth: 170 },
});
