import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { DrawerActions } from './DrawerActions';
import { DrawerHeader } from './DrawerHeader';
import { SessionRow, SessionsEmpty } from './DrawerSessionList';
import { computerMode, computerPlaces } from './mode';
import { Icon, type IconName } from './primitives';
import type { Destination, WorkspaceModel } from './types';
import { useReducedMotion } from './useReducedMotion';

const places: Record<string, { label: string; icon: IconName }> = {
  computers: { label: 'Remote', icon: 'desktop-outline' },
  projects: { label: 'Projects', icon: 'folder-outline' },
};
// Every rail row is an icon and then its text, in one column. These two sit below
// the computer's own rows because neither depends on a computer being connected.
const always: { id: Destination; label: string; icon: IconName }[] = [
  { id: 'integrations', label: 'Integrations', icon: 'link-outline' },
  { id: 'vibes', label: 'Vibyra tokens', icon: 'sparkles-outline' },
];
export function NavigationDrawer({ visible, destination, workspace, onClose, onNavigate, onNew, extraChats }: {
  extraChats?: (query: string) => ReactNode; visible: boolean; destination: Destination; workspace: WorkspaceModel;
  onClose: () => void; onNavigate: (destination: Destination) => void; onNew: () => void;
}) {
  const { colors, dark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
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
  useEffect(() => { if (visible) { setQuery(''); setSearching(false); } }, [visible]);
  const projectName = (id: string) => workspace.projects.find(project => project.id === id)?.name ?? '';
  const term = query.trim().toLowerCase();
  const sessions = workspace.sessions.filter(session =>
    `${session.title} ${projectName(session.projectId)}`.toLowerCase().includes(term));
  const navigate = (to: Destination) => { onNavigate(to); onClose(); };
  const connected = computerMode(workspace);
  const rows = computerPlaces(workspace);
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
        <DrawerHeader searching={searching} query={query} onQuery={setQuery} onClose={onClose}
          onOpenSearch={() => setSearching(true)} onCloseSearch={() => { setQuery(''); setSearching(false); }} />
        <View style={s.body}>
          <ScrollView style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
            indicatorStyle={dark ? 'white' : 'black'}>
            <View style={s.nav}>
              {rows.map(id => {
                const place = places[id]!;
                const active = destination === id;
                return <Pressable key={id} accessibilityRole="button" accessibilityLabel={place.label}
                  accessibilityState={{ selected: active }} onPress={() => navigate(id)}
                  style={({ pressed }) => [s.navRow, { backgroundColor: active || pressed ? colors.elevated : 'transparent' }]}>
                  <View style={s.icon}>
                    <Icon name={place.icon} size={21} color={active ? colors.accent : colors.muted} />
                  </View>
                  <Text style={[s.navText, { color: colors.text }]}>{place.label}</Text>
                </Pressable>;
              })}
              {always.map(place => {
                const active = destination === place.id;
                return <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={place.label}
                  accessibilityState={{ selected: active }} onPress={() => navigate(place.id)}
                  style={({ pressed }) => [s.navRow, { backgroundColor: active || pressed ? colors.elevated : 'transparent' }]}>
                  <View style={s.icon}>
                    <Icon name={place.icon} size={21} color={active ? colors.accent : colors.muted} />
                  </View>
                  <Text style={[s.navText, { color: colors.text }]}>{place.label}</Text>
                </Pressable>;
              })}
            </View>
            {/* One Recents list. The AI chats and the computer's own sessions are
                both conversations, so they are not two separate stacks. */}
            <View style={s.listHeader}>
              <Text accessibilityRole="header" style={[s.section, { color: colors.muted }]}>Recents</Text>
            </View>
            <View style={s.sessions}>
              {extraChats?.(term)}
              {connected && sessions.map(session => <SessionRow key={session.id} session={session} project={projectName(session.projectId)}
                selected={destination === 'work' && session.id === workspace.selectedSessionId}
                onPress={() => { workspace.actions.selectSession(session.id); navigate('work'); }} />)}
              {connected && !sessions.length && !extraChats && <SessionsEmpty query={term} />}
            </View>
          </ScrollView>
          <DrawerActions bottom={Math.max(insets.bottom, 14)} settingsSelected={destination === 'settings'}
            onChat={() => { onNew(); onClose(); }} onSettings={() => navigate('settings')} />
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
  body: { flex: 1, minHeight: 0 },
  nav: { paddingHorizontal: 12, gap: 2 },
  navRow: { minHeight: 50, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12 },
  navText: { flex: 1, fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  listHeader: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 8, gap: 12 },
  section: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  list: { flex: 1 },
  // The actions float over this list, so the last conversation still scrolls clear of them.
  listContent: { paddingBottom: 92 },
  sessions: { paddingHorizontal: 12, gap: 3 },
});
