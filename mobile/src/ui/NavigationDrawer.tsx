import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { BrandMark, Icon, IconButton } from './primitives';
import type { Destination, WorkspaceModel } from './types';
import { useReducedMotion } from './useReducedMotion';

export function NavigationDrawer({ visible, destination, workspace, onClose, onNavigate, onNew }: {
  visible: boolean; destination: Destination; workspace: WorkspaceModel;
  onClose: () => void; onNavigate: (destination: Destination) => void; onNew: () => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All' | 'Chats' | 'Terminals'>('All');
  const navigate = (to: Destination) => { onNavigate(to); onClose(); };
  const sessions = workspace.sessions.filter(session =>
    (filter === 'All' || (filter === 'Terminals' ? session.kind === 'shell' : session.kind !== 'shell')) &&
    `${session.title} ${workspace.projects.find(project => project.id === session.projectId)?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
    <View style={[s.overlay, { backgroundColor: colors.scrim }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} />
      <SafeAreaView accessibilityViewIsModal style={[s.panel, { width: Math.min(width - 35, 360), backgroundColor: colors.rail }]}>
        <View style={s.header}><BrandMark size={28} /><Text style={[s.brand, { color: colors.text }]}>Vibyra</Text>
          <IconButton icon="close" label="Close navigation menu" onPress={onClose} /></View>
        <View style={[s.search, { backgroundColor: colors.elevated }]}><Icon name="search-outline" size={19} color={colors.muted} />
          <TextInput accessibilityLabel="Search chats" placeholder="Search chats" placeholderTextColor={colors.muted}
            value={query} onChangeText={setQuery} style={[s.searchInput, { color: colors.text }]} />
        </View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={() => { onNew(); onClose(); }} style={s.navRow}>
            <Icon name="create-outline" size={21} /><Text style={[s.navText, { color: colors.text }]}>New chat</Text>
            <Icon name="add" size={18} color={colors.muted} /></Pressable>
          {(['projects', 'computers'] as const).map(item => <Pressable key={item} accessibilityRole="button"
            accessibilityLabel={item === 'projects' ? 'Projects' : 'Computers'}
            accessibilityState={{ selected: destination === item }} onPress={() => navigate(item)}
            style={[s.navRow, { backgroundColor: destination === item ? colors.elevated : 'transparent' }]}>
            <Icon name={item === 'projects' ? 'folder-outline' : 'desktop-outline'} size={21} />
            <Text style={[s.navText, { color: colors.text }]}>{item === 'projects' ? 'Projects' : 'Computers'}</Text>
            {item === 'computers' && workspace.status === 'connected' && <View style={[s.dot, { backgroundColor: colors.success }]} />}
          </Pressable>)}
          <View style={s.filters}>{(['All', 'Chats', 'Terminals'] as const).map(item =>
            <Pressable key={item} accessibilityRole="tab" aria-selected={filter === item} accessibilityState={{ selected: filter === item }}
              onPress={() => setFilter(item)} style={[s.filter, { backgroundColor: filter === item ? colors.elevated : 'transparent' }]}>
              <Text style={[s.filterText, { color: filter === item ? colors.text : colors.muted }]}>{item}</Text>
            </Pressable>)}</View>
          {sessions.map(session => <Pressable key={session.id} accessibilityRole="button"
            accessibilityLabel={`${session.title}, ${session.kind === 'shell' ? 'Terminal' : session.kind === 'claude' ? 'Claude' : 'Codex'}`}
            accessibilityState={{ selected: session.id === workspace.selectedSessionId }}
            onPress={() => { workspace.actions.selectSession(session.id); navigate('work'); }}
            style={[s.recent, { backgroundColor: session.id === workspace.selectedSessionId ? colors.elevated : 'transparent' }]}>
            <Icon name={session.kind === 'shell' ? 'terminal-outline' : 'chatbubble-outline'} size={18} color={colors.muted} />
            <View style={s.recentBody}><Text numberOfLines={1} style={[s.recentTitle, { color: colors.text }]}>{session.title}</Text>
              <Text numberOfLines={1} style={[s.project, { color: colors.muted }]}>{workspace.projects.find(project => project.id === session.projectId)?.name}</Text></View>
            {session.status === 'running' && <View style={[s.dot, { backgroundColor: colors.success }]} />}
          </Pressable>)}
          {!sessions.length && <Text style={[s.empty, { color: colors.muted }]}>{query ? 'No matching chats' : filter === 'Terminals' ? 'No terminals yet' : 'Your chats will appear here'}</Text>}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => navigate('settings')}
          style={[s.footer, { borderTopColor: colors.border }]}>
          <View style={[s.avatar, { backgroundColor: colors.elevated }]}><Icon name="settings-outline" size={21} /></View>
          <View style={s.footerText}><Text style={[s.footerTitle, { color: colors.text }]}>Settings</Text>
            <Text numberOfLines={1} style={[s.project, { color: colors.muted }]}>{workspace.demo ? 'Sample workspace' : workspace.host?.name ?? 'Connection & appearance'}</Text></View>
          <Icon name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      </SafeAreaView>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1 }, panel: { flex: 1, borderTopRightRadius: 24, borderBottomRightRadius: 24 },
  header: { paddingLeft: 22, paddingRight: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontSize: 22, fontWeight: '600', letterSpacing: -0.7, flex: 1 },
  search: { marginHorizontal: 16, marginTop: 6, marginBottom: 12, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', gap: 9, alignItems: 'center' },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15, outlineWidth: 0 }, content: { paddingHorizontal: 12, paddingBottom: 20 },
  navRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, borderRadius: 13 },
  navText: { fontSize: 15, fontWeight: '500', flex: 1 }, filters: { flexDirection: 'row', gap: 5, paddingTop: 24, paddingBottom: 12, paddingHorizontal: 6 },
  filter: { minHeight: 44, paddingHorizontal: 13, borderRadius: 22, justifyContent: 'center' }, filterText: { fontSize: 12, fontWeight: '500' },
  recent: { minHeight: 65, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14 },
  recentBody: { flex: 1, gap: 6 }, recentTitle: { fontSize: 14, fontWeight: '500' }, project: { fontSize: 11 },
  dot: { width: 6, height: 6, borderRadius: 3 }, empty: { fontSize: 13, lineHeight: 20, padding: 18 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  footerText: { flex: 1, gap: 5 }, footerTitle: { fontSize: 14, fontWeight: '500' },
});
