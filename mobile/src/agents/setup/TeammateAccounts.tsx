import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Mark } from '../../ui/BrandLogo';
import { Button, Hint, Icon } from '../../ui/primitives';
import { font } from '../../ui/font';
import { integrationBrand } from '../../integrations/integrationBrands';
import { StatusPill } from '../../integrations/hub/StatusPill';
import type { AgentsApi } from '../types';
import { useRunMode } from '../v2/useRunMode';
import { GRANT_WORDS, accountTitle, grantState, groupAccounts, readsOn, toolLabel } from '../v2/hubModel';
import { SetupCard, SetupHeading } from './SetupForm';
import { suggestedOperations, type Template } from '../v2/templatesModel';
import { useTeammateGrants } from './useTeammateGrants';

/**
 * Agent v2 per-teammate grants in the Access tab. Connected is not allowed: every account the
 * person has connected is listed, but this teammate reaches only the operations ticked here —
 * reads as one choice, each change on its own (and every change still asks first).
 * Renders nothing unless v2 is on for the account, so the v1 Access tab is unchanged.
 */
export function TeammateAccounts({ api, agentId, active, suggested, refreshKey = 0 }: { api: AgentsApi; agentId?: string; active: boolean;
  /** The starter's suggestions: tagged on the rows, never ticked for the person. */ suggested?: Template | null; refreshKey?: number }) {
  const { colors } = useTheme();
  const v2 = useRunMode(api.connections ? api.runs : undefined, true) === 'v2';
  const state = useTeammateGrants(v2 ? api.connections : undefined, agentId, active && v2);
  const refreshAccounts = state.refresh;
  useEffect(() => { if (refreshKey) void refreshAccounts(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v2 || !api.connections) return null;
  const heading = <SetupHeading title="Accounts" description="Connected isn’t the same as allowed. Pick which accounts this teammate may use, and what it may do with each." />;
  if (!agentId) return <View style={s.body}>{heading}<Hint>Create the teammate first, then choose its accounts.</Hint></View>;
  const groups = groupAccounts(state.connections ?? [], state.catalogue);
  const check = (label: string, text: string, on: boolean, busy: boolean, onPress: () => void, detail?: string) => (
    <Pressable key={label} accessibilityRole="checkbox" accessibilityLabel={label} aria-checked={on}
      accessibilityState={{ checked: on, disabled: state.busy !== null, busy }} disabled={state.busy !== null} onPress={onPress}
      style={({ pressed }) => [s.op, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.accent : colors.muted} />
      <Text style={[s.opText, { color: colors.text }]}>{text}</Text>
      {detail ? <Text style={[s.opDetail, { color: colors.muted }]}>{detail}</Text> : null}
    </Pressable>
  );
  return (
    <View style={s.body} testID="teammate-accounts">
      {heading}
      {state.connections === null && !state.error && <Hint>Checking your accounts…</Hint>}
      {state.connections?.length === 0 && <Hint>No accounts connected yet. Connect one in Integrations, then allow it here.</Hint>}
      {groups.map(group => (
        <SetupCard key={group.provider}>
          <View style={s.groupHead}>
            <Mark brand={integrationBrand(group.mcp ? 'mcp' : group.provider)} size={26} />
            <Text style={[s.groupName, { color: colors.text }]}>{group.name}</Text>
          </View>
          {group.accounts.map(c => {
            const ops = state.ops(c);
            const grant = state.grantOf(c);
            const held = grant?.operations ?? [];
            const allowed = grantState(grant, ops);
            const title = accountTitle(c);
            const blocked = c.status === 'unconfigured' || c.status === 'needs_review';
            const hint = suggestedOperations(suggested ?? null, c.provider);
            const readHint = ops.reads.some(t => hint.includes(t));
            return (
              <View key={c.id} style={[s.account, { borderColor: colors.border }]}>
                <View style={s.accountHead}>
                  <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{title}</Text>
                  <StatusPill label={allowed === 'none' ? 'Not allowed' : 'Allowed'} tone={allowed === 'none' ? 'muted' : 'ok'} />
                </View>
                <Text style={[s.detail, { color: colors.muted }]}>
                  {blocked ? (c.status === 'needs_review' ? 'Its tools changed. Review them in Integrations first.' : 'This service isn’t set up on Vibyra yet.') : GRANT_WORDS[allowed]}
                </Text>
                {!blocked && ops.reads.length > 0 && check(`Allow reading ${title}`, 'Read', readsOn(held, ops), state.busy === `${c.id}:reads`,
                  () => void state.toggle(c, 'reads', !readsOn(held, ops)), readHint ? 'Suggested · search and read' : 'Search and read')}
                {!blocked && ops.writes.map(tool => check(`Allow ${toolLabel(tool, c.provider).toLowerCase()} for ${title}`, toolLabel(tool, c.provider), held.includes(tool), state.busy === `${c.id}:${tool}`,
                  () => void state.toggle(c, tool, !held.includes(tool)), hint.includes(tool) ? 'Suggested · asks you first' : 'Asks you first'))}
              </View>
            );
          })}
        </SetupCard>
      ))}
      {state.error ? <View style={s.body}><Hint error>{state.error}</Hint><Button secondary title="Refresh accounts" onPress={() => void state.refresh()} /></View> : null}
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  groupName: { ...font.headline, fontSize: 16 },
  account: { paddingHorizontal: 16, paddingVertical: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  accountHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { ...font.row, flex: 1, minWidth: 0 },
  detail: { ...font.footnote, marginBottom: 2 },
  op: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  opText: { ...font.subhead, fontWeight: '500' },
  opDetail: { ...font.footnote, marginLeft: 'auto' },
});
