import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { Attached } from './useAttachments';

const word = { image: 'Photo', pdf: 'PDF', text: 'File' } as const;
const state = { uploading: 'uploading', ready: 'ready', failed: 'failed to upload' } as const;

/** What goes with the message, above the words: photos as themselves, files by name. */
export function AttachmentTray({
  items,
  onRemove,
}: {
  items: Attached[];
  onRemove(key: string): void;
}) {
  const { colors } = useTheme();
  if (!items.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.row}
    >
      {items.map((item) => (
        <View
          key={item.key}
          accessible
          accessibilityLabel={`${word[item.kind]} ${item.name}, ${state[item.status]}`}
          style={[
            s.item,
            item.kind !== 'image' && s.fileItem,
            {
              backgroundColor: colors.elevated,
              borderColor: item.status === 'failed' ? colors.error : colors.border,
            },
          ]}
        >
          {item.kind === 'image' ? (
            <Image source={{ uri: item.uri }} style={s.photo} accessibilityIgnoresInvertColors />
          ) : (
            <>
              <Icon
                name={item.kind === 'pdf' ? 'document-text-outline' : 'code-slash-outline'}
                size={18}
                color={colors.muted}
              />
              <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>
                {item.name}
              </Text>
            </>
          )}
          {item.status !== 'ready' && (
            <View pointerEvents="none" style={[s.veil, item.kind !== 'image' && s.fileVeil]}>
              {item.status === 'uploading' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="alert-circle" size={20} color={colors.error} />
              )}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            hitSlop={10}
            onPress={() => onRemove(item.key)}
            style={[s.remove, { backgroundColor: colors.text, borderColor: colors.surface }]}
          >
            <Icon name="close" size={11} color={colors.surface} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  row: { gap: 10, paddingTop: 6, paddingBottom: 8, paddingHorizontal: 4 },
  item: {
    width: 58,
    height: 58,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
  },
  fileItem: {
    width: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  photo: { width: '100%', height: '100%', borderRadius: 14 },
  name: { flex: 1, fontSize: 12.5, fontWeight: '500' },
  veil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  fileVeil: { backgroundColor: 'rgba(0,0,0,0.25)' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
