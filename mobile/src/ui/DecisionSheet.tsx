import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from './primitives';
import { Sheet } from './Sheet';
import { useAction } from './useAction';
import type { Approval, WorkspaceModel } from './types';

export function DecisionSheet({
  approval,
  workspace,
  onClose,
}: {
  approval?: Approval;
  workspace: WorkspaceModel;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const decide = async (allow: boolean) => {
    if (!approval || !workspace.actions.resolveApproval) return;
    if (await run(() => workspace.actions.resolveApproval!(approval.id, allow))) onClose();
  };
  return (
    <Sheet title="Your decision" visible={!!approval} onClose={onClose}>
      <View style={[s.icon, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
        <Icon name="hand-left-outline" size={24} color={colors.warning} />
      </View>
      <Text style={[s.title, { color: colors.text }]}>{approval?.title}</Text>
      {workspace.demo && <Hint>Sample decision · No command will run on a computer.</Hint>}
      <Text
        selectable
        style={[
          s.detail,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {approval?.detail}
      </Text>
      {approval?.expiresAt && <Hint>Expires {new Date(approval.expiresAt).toLocaleString()}</Hint>}
      {error && <Hint error>{error}</Hint>}
      <Button
        title="Allow once"
        busy={busy}
        disabled={!workspace.actions.resolveApproval}
        onPress={() => void decide(true)}
      />
      <Button
        title="Decline"
        secondary
        disabled={busy || !workspace.actions.resolveApproval}
        onPress={() => void decide(false)}
      />
    </Sheet>
  );
}
const s = StyleSheet.create({
  icon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.6, marginTop: -4 },
  detail: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginVertical: 2,
  },
});
