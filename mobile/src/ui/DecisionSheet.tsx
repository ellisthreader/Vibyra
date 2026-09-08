import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from './primitives';
import { Sheet } from './Sheet';
import { useAction } from './useAction';
import type { Approval, WorkspaceModel } from './types';

export function DecisionSheet({ approval, workspace, onClose }: { approval?: Approval; workspace: WorkspaceModel; onClose: () => void }) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const decide = async (allow: boolean) => {
    if (!approval || !workspace.actions.resolveApproval) return;
    if (await run(() => workspace.actions.resolveApproval!(approval.id, allow))) onClose();
  };
  return <Sheet title="Your decision" visible={!!approval} onClose={onClose}>
    <View style={[s.icon, { backgroundColor: colors.elevated }]}><Icon name="hand-left-outline" size={27} color={colors.warning} /></View>
    <Text style={[s.title, { color: colors.text }]}>{approval?.title}</Text>
    {workspace.demo && <Hint>Sample decision · No command will run on a computer.</Hint>}
    <Text selectable style={[s.detail, { color: colors.text, backgroundColor: colors.surface }]}>{approval?.detail}</Text>
    {approval?.expiresAt && <Hint>Expires {new Date(approval.expiresAt).toLocaleString()}</Hint>}
    {error && <Hint error>{error}</Hint>}
    <Button title="Allow once" busy={busy} disabled={!workspace.actions.resolveApproval} onPress={() => void decide(true)} />
    <Button title="Decline" secondary disabled={busy || !workspace.actions.resolveApproval} onPress={() => void decide(false)} />
  </Sheet>;
}
const s = StyleSheet.create({
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: '600', letterSpacing: -0.8 },
  detail: { fontSize: 16, lineHeight: 25, padding: 20, borderRadius: 20, marginVertical: 4 },
});
