import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { FilterTabs, SessionRow, SessionsEmpty, type SessionFilter } from './DrawerSessionList';
import { BrandMark, Icon, IconButton, type IconName } from './primitives';
import type { Destination, WorkspaceModel } from './types';
import { useReducedMotion } from './useReducedMotion';

const places: { id: Destination; label: string; icon: IconName }[] = [
  { id: 'projects', label: 'Projects', icon: 'folder-outline' },
  { id: 'computers', label: 'Computers', icon: 'desktop-outline' },
];
export function NavigationDrawer({ visible, destination, workspace, onClose, onNavigate, onNew, extraChats, balance }: {
  extraChats?: ReactNode; balance?: ReactNode; visible: boolean; destination: Destination; workspace: WorkspaceModel;
  onClose: () => void; onNavigate: (destination: Destination) => void; onNew: () => void;
}) {
  const { colors, dark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SessionFilter>('All');
  const panelWidth = Math.min(width - 52, 344);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (visible) setMounted(true);
    const motion = Animated.timing(progress, { toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? 260 : 180, useNativeDriver: Platform.OS !== 'web',
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic) });
    motion.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => motion.stop();
  }, [visible, reducedMotion, progress]);
  useEffect(() => { if (visible) { setQuery(''); setFilter('All'); } }, [visible]);
  const projectName = (id: string) => workspace.projects.find(project => project.id === id)?.name ?? '';
  const term = query.trim().toLowerCase();
  const sessions = workspace.sessions.filter(session =>
    (filter === 'All' || (filter === 'Terminals' ? session.kind === 'shell' : session.kind !== 'shell')) &&
    `${session.title} ${projectName(session.projectId)}`.toLowerCase().includes(term));
  const navigate = (to: Destination) => { onNavigate(to); onClose(); };
  const connected = workspace.status === 'connected';
  const hidden = !visible;
  return <Modal visible={mounted} transparent presentationStyle="overFullScreen" animationType="none"
    statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    {mounted && <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />}
    <View style={s.overlay}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]} />
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} />
      <Animated.View testID="navigation-drawer" accessibilityViewIsModal aria-hidden={hidden} accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} pointerEvents={hidden ? 'none' : 'auto'}
        style={[s.panel, { width: panelWidth, backgroundColor: colors.rail, borderRightColor: colors.border,
          paddingLeft: insets.left, paddingTop: insets.top,
          shadowOpacity: dark ? 0.4 : 0.12,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth - 30, 0] }) }] }]}>
        <View style={s.header}>
          <BrandMark size={28} />
          <Text accessibilityRole="header" style={[s.brand, { color: colors.text }]}>Vibyra</Text>
          <IconButton icon="close" label="Close navigation menu" onPress={onClose} />
        </View>
        <View style={[s.search, { backgroundColor: colors.elevated }]}>
          <Icon name="search-outline" size={17} color={colors.muted} />
          <TextInput accessibilityLabel="Search chats" placeholder="Search chats" placeholderTextColor={colors.muted}
            value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
            style={[s.searchInput, { color: colors.text }]} />
          {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12}
            onPress={() => setQuery('')} style={({ pressed }) => [s.clear, { opacity: pressed ? 0.5 : 1 }]}>
            <Icon name="close-circle" size={17} color={colors.muted} /></Pressable>}
        </View>
        <ScrollView style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
          indicatorStyle={dark ? 'white' : 'black'}>
          <View style={s.nav}>
            <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={() => { onNew(); onClose(); }}
              style={({ pressed }) => [s.primary, { backgroundColor: colors.action, opacity: pressed ? 0.8 : 1 }]}>
              <Icon name="create-outline" size={21} color={colors.onAction} />
              <Text style={[s.primaryText, { color: colors.onAction }]}>New chat</Text>
            </Pressable>
            {places.map(place => {
              const active = destination === place.id;
              return <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={place.label}
                accessibilityState={{ selected: active }} onPress={() => navigate(place.id)}
                style={({ pressed }) => [s.navRow, { backgroundColor: active ? colors.elevated : pressed ? colors.elevated : 'transparent' }]}>
                <View style={s.icon}>
                  <Icon name={place.icon} size={21} color={active ? colors.accent : colors.muted} />
                </View>
                <Text style={[s.navText, { color: colors.text }]}>{place.label}</Text>
                {place.id === 'computers' && <View style={[s.status, { backgroundColor: colors.elevated }]}>
                  <View style={[s.dot, { backgroundColor: workspace.demo ? colors.muted : connected ? colors.success : colors.border }]} />
                  <Text numberOfLines={1} style={[s.statusText, { color: colors.muted }]}>
                    {workspace.demo ? 'Sample' : connected ? 'Online' : workspace.status === 'connecting' ? 'Connecting' : 'Offline'}</Text>
                </View>}
              </Pressable>;
            })}
          </View>
          {extraChats && <View style={s.extraChats}>{extraChats}</View>}
          <View style={s.listHeader}>
            <View style={s.sectionRow}>
              <Text accessibilityRole="header" style={[s.section, { color: colors.muted }]}>Recent</Text>
              {sessions.length > 0 && <Text style={[s.count, { color: colors.muted }]}>{sessions.length}</Text>}
            </View>
            <FilterTabs filter={filter} onChange={setFilter} />
          </View>
          <View style={s.sessions}>
            {sessions.map(session => <SessionRow key={session.id} session={session} project={projectName(session.projectId)}
              selected={destination === 'work' && session.id === workspace.selectedSessionId}
              onPress={() => { workspace.actions.selectSession(session.id); navigate('work'); }} />)}
            {!sessions.length && <SessionsEmpty query={term} filter={filter} />}
          </View>
        </ScrollView>
        <View style={[s.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          {balance}
          <Pressable accessibilityRole="button" accessibilityLabel="Settings"
            accessibilityState={{ selected: destination === 'settings' }} onPress={() => navigate('settings')}
            style={({ pressed }) => [s.navRow, { backgroundColor: destination === 'settings' || pressed ? colors.elevated : 'transparent' }]}>
            <View style={s.icon}>
              <Icon name="settings-outline" size={21} color={destination === 'settings' ? colors.accent : colors.muted} /></View>
            <View style={s.footerBody}>
              <Text style={[s.footerTitle, { color: colors.text }]}>Settings</Text>
              <Text numberOfLines={1} style={[s.statusText, { color: colors.muted }]}>{workspace.demo ? 'Sample workspace'
                : workspace.account?.name || workspace.account?.email || 'Account & appearance'}</Text>
            </View>
            <Icon name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1 },
  // The rail paints to both screen edges; only its content receives safe-area padding.
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowRadius: 22, shadowOffset: { width: 8, height: 0 }, elevation: 20 },
  header: { minHeight: 64, paddingLeft: 22, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { flex: 1, fontSize: 23, fontWeight: '700', letterSpacing: -0.8 },
  search: { marginHorizontal: 20, marginTop: 6, marginBottom: 16, borderRadius: 12,
    paddingLeft: 13, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15, outlineWidth: 0 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nav: { paddingHorizontal: 12, gap: 2 },
  primary: { minHeight: 48, borderRadius: 13, marginHorizontal: 8, marginBottom: 12,
    paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryText: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  navRow: { minHeight: 50, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12 },
  navText: { flex: 1, fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 100,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  listHeader: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 8, gap: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  list: { flex: 1 }, listContent: { paddingBottom: 20 }, sessions: { paddingHorizontal: 12, gap: 3 },
  extraChats: { paddingHorizontal: 12, paddingTop: 16 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8 },
  footerBody: { flex: 1, gap: 3 },
  footerTitle: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.2 },
});
