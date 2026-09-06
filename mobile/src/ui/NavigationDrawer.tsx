import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { BrandMark, Icon, IconButton, type IconName } from './primitives';
import type { Destination, WorkspaceModel } from './types';
import { useReducedMotion } from './useReducedMotion';

const destinations: { id: Destination; label: string; icon: IconName }[] = [
  { id: 'work', label: 'Work', icon: 'chatbubble-ellipses-outline' },
  { id: 'projects', label: 'Projects', icon: 'folder-outline' },
  { id: 'computers', label: 'Computers', icon: 'desktop-outline' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline' },
];
export function NavigationDrawer({ visible, destination, workspace, onClose, onNavigate }: {
  visible: boolean; destination: Destination; workspace: WorkspaceModel;
  onClose: () => void; onNavigate: (destination: Destination) => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  return <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
    <View style={[s.overlay, { backgroundColor: colors.scrim }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} />
      <SafeAreaView accessibilityViewIsModal style={[s.panel, { width: Math.min(width * 0.87, 360), backgroundColor: colors.rail }]}>
        <View style={s.header}><BrandMark size={28} /><Text style={[s.brand, { color: colors.text }]}>Vibyra</Text>
          <IconButton icon="close" label="Close menu" onPress={onClose} /></View>
        <ScrollView contentContainerStyle={s.content}>
          {destinations.map(item => <Pressable key={item.id} accessibilityRole="button"
            accessibilityState={{ selected: destination === item.id }}
            onPress={() => { if (item.id === 'work') workspace.actions.selectSession(null); onNavigate(item.id); onClose(); }}
            style={[s.row, { backgroundColor: destination === item.id ? colors.elevated : 'transparent' }]}>
            <Icon name={item.icon} size={23} /><Text style={[s.label, { color: colors.text }]}>{item.label}</Text>
            {item.id === 'work' && workspace.approvals.length > 0 &&
              <Text style={[s.count, { color: colors.warning }]}>{workspace.approvals.length}</Text>}
          </Pressable>)}
          {workspace.sessions.length > 0 && <Text style={[s.section, { color: colors.muted }]}>Recent work</Text>}
          {workspace.sessions.slice(0, 8).map(session => <Pressable key={session.id} accessibilityRole="button"
            onPress={() => { workspace.actions.selectSession(session.id); onNavigate('work'); onClose(); }} style={s.recent}>
            <Icon name={session.kind === 'shell' ? 'terminal-outline' : 'sparkles-outline'} size={18} color={colors.muted} />
            <Text numberOfLines={1} style={[s.recentTitle, { color: colors.text }]}>{session.title}</Text>
          </Pressable>)}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="View connected computer"
          onPress={() => { onNavigate('computers'); onClose(); }} style={[s.footer, { borderTopColor: colors.border }]}>
          <View style={[s.dot, { backgroundColor: workspace.status === 'connected' ? colors.success : colors.muted }]} />
          <View style={s.footerText}>
            <Text numberOfLines={1} style={[s.computer, { color: colors.text }]}>{workspace.host?.name ?? 'No computer connected'}</Text>
            <Text style={[s.connection, { color: colors.muted }]}>{workspace.status === 'connected' ? 'Encrypted connection' : 'Connect your computer'}</Text>
          </View><Icon name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>
      </SafeAreaView>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1 }, panel: { flex: 1 }, header: { paddingLeft: 24, paddingRight: 12, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontSize: 24, fontWeight: '600', letterSpacing: -0.8, flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 12, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 55, padding: 15, borderRadius: 15, gap: 16 },
  label: { fontSize: 17, fontWeight: '500', flex: 1 }, count: { fontSize: 15, fontWeight: '600' },
  section: { fontSize: 13, fontWeight: '500', marginTop: 29, marginBottom: 8, marginLeft: 16 },
  recent: { minHeight: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  recentTitle: { flex: 1, fontSize: 15 }, footer: { borderTopWidth: StyleSheet.hairlineWidth,
    padding: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 }, footerText: { flex: 1, gap: 4 },
  computer: { fontSize: 15, fontWeight: '500' }, connection: { fontSize: 12 },
});
