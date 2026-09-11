import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Icon, IconButton } from './primitives';

// The top of the rail is one row: the mark, the name, and search beside it.
// Opening search replaces that row instead of adding a second one, so nothing
// below it moves and the top stays a single line at every state.
export function DrawerHeader({ searching, query, onQuery, onOpenSearch, onCloseSearch, onClose }: {
  searching: boolean; query: string; onQuery: (value: string) => void;
  onOpenSearch: () => void; onCloseSearch: () => void; onClose: () => void;
}) {
  const { colors, dark } = useTheme();
  if (searching) {
    return <View style={s.row}>
      <View style={[s.field, { backgroundColor: colors.elevated }]}>
        <Icon name="search-outline" size={17} color={colors.muted} />
        <TextInput autoFocus accessibilityLabel="Search chats" placeholder="Search chats"
          placeholderTextColor={colors.muted} value={query} onChangeText={onQuery}
          keyboardAppearance={dark ? 'dark' : 'light'} autoCorrect={false} autoCapitalize="none"
          returnKeyType="search" style={[s.input, { color: colors.text }]} />
      </View>
      <IconButton icon="close" label="Close search" onPress={onCloseSearch} />
    </View>;
  }
  return <View style={s.row}>
    <BrandMark size={24} />
    <Text accessibilityRole="header" style={[s.brand, { color: colors.text }]}>Vibyra</Text>
    <IconButton icon="search-outline" label="Search chats" onPress={onOpenSearch} />
    <IconButton icon="close" label="Close navigation menu" onPress={onClose} />
  </View>;
}
const s = StyleSheet.create({
  row: { minHeight: 60, paddingLeft: 20, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { flex: 1, fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
  field: { flex: 1, minHeight: 40, borderRadius: 12, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { flex: 1, minHeight: 40, fontSize: 15, outlineWidth: 0 },
});
