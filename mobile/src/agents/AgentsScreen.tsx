import { NavigationDrawer } from '../ui/NavigationDrawer';
import { DrawerFooterActions } from '../ui/DrawerFooterActions';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { AccountSheet } from '../ui/AccountSheet';
import { BrandMark, Button, Hint, Icon, IconButton } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import type { VibesApi } from '../vibes/types';
import { AgentConversation } from './AgentConversation';
import { ProductModeSwitch, type ProductMode } from './ProductMode';
import { TeammateAvatar } from './TeammateAvatar';
import { TeammateRoster, teammateStatus } from './TeammateRoster';
import { TeammateSetup } from './TeammateSetup';
import { TeammateSetupChat } from './setup/TeammateSetupChat';
import { useRoster } from './useRoster';
import { useAgentNavigation } from './useAgentNavigation';
import { font } from '../ui/font';
import type { AgentsApi } from './types';
import { useRunMode } from './v2/useRunMode';
import { ActivityScreen } from './ActivityScreen';

/** Account-keyed by the shell. Keep at most three chat views mounted. */
export function AgentsScreen({ api, chatApi, workspace, active, onMode, onMenu, onWallet, requestedAgent }: {
  requestedAgent?: { id: string; nonce: number };
  api: AgentsApi; chatApi: VibesApi; workspace: WorkspaceModel; active: boolean;
  onMode(mode: ProductMode): void; onMenu(): void; onReport(): void; onWallet(): void;
}) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  const mode = useRunMode(workspace.demo ? undefined : api.runs, Boolean(workspace.account));
  const v2 = mode === 'v2' && Boolean(api.overview);
  const { roster, loading, error, refresh, adopt, read } = useRoster(api, Boolean(workspace.account), active, v2);
  const [menu, setMenu] = useState(false);
  const [activity, setActivity] = useState(false);
  const { selected, visited, setup, creating, creationVisited, setupVisible, setSetupVisible,
    open, configure, saved, back, clear, templated } = useAgentNavigation(roster, requestedAgent, adopt, refresh);
  const [account, setAccount] = useState(false);
  const listedAgent = roster?.teammates.find(a => a.id === selected);
  const agent = listedAgent ?? visited.find(a => a.id === selected);
  const agentMissing = Boolean(agent && !listedAgent);
  // The server decides whether Agents are included; history stays readable either way.
  const needsPro = roster?.enabled === true && roster.entitled === false;
  const enabled = roster?.enabled === true && !error && !needsPro;
  const paused = roster !== null && !roster.enabled;
  // A "+" tapped before teammates were ready; the notice it raises leaves once they are.
  const [nudged, setNudged] = useState(false);
  useEffect(() => { if (!active) { setSetupVisible(false); setAccount(false); } else void refresh(); }, [active, refresh, setSetupVisible]);
  useEffect(() => { if (!v2) setActivity(false); }, [v2]);
  const openFromActivity = (id: string) => { const target = roster?.teammates.find(a => a.id === id); if (target) open(target); };
  const covered = account || menu;
  const identity = `${workspace.demo ? 'sample:' : ''}${workspace.account?.email ?? 'guest'}`;
  return <View style={s.body}>
    <SafeAreaView style={s.body} accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'} aria-hidden={covered}>
      <View style={s.frame}>
      <View style={s.header}>
        <IconButton icon="menu-outline" label="Open navigation menu" onPress={() => setMenu(true)} />
        <View style={s.grow}><ProductModeSwitch mode="agent" onChange={onMode} /></View>
        {!paused ? <IconButton icon="add" label="New teammate" disabled={!workspace.account} onPress={() => enabled ? configure() : needsPro && onWallet ? onWallet() : setNudged(true)} /> : <View style={{ width: 44 }} />}
      </View>
      {activity && !agent && !creating && <View style={[s.threadHeader, { borderBottomColor: colors.border }]}>
        <IconButton icon="chevron-back" label="Back to teammates" onPress={() => setActivity(false)} />
        <Text accessibilityRole="header" style={[s.name, s.grow, { color: colors.text }]}>Activity</Text>
      </View>}
      {(agent || creating) && <View style={[s.threadHeader, { borderBottomColor: colors.border }]}>
        <IconButton icon="chevron-back" label="Back to teammates" onPress={back} />
        {agent && !creating && !setupVisible ? <Pressable accessibilityRole="button" accessibilityLabel={`Details for ${agent.name}`} onPress={() => configure(agent)} style={s.title}>
          <TeammateAvatar avatar={agent.avatar} size={29} /><View style={s.grow}><Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{agent.name}</Text><Text style={[s.status, { color: colors.muted }]}>{teammateStatus(agent)}</Text></View>
        </Pressable> : <Text style={[s.name, s.grow, { color: colors.text }]}>{setupVisible ? 'Edit teammate' : 'New teammate'}</Text>}
        {agent && !creating && !setupVisible && <IconButton icon="ellipsis-horizontal" label="Teammate details" onPress={() => configure(agent)} />}
      </View>}
      {workspace.demo && !agent && !creating && <View style={s.sample}><View style={[s.sampleDot, { backgroundColor: colors.muted }]} /><Text style={[s.sampleText, { color: colors.muted }]}>Sample workspace</Text></View>}
      {!workspace.account ? <View style={s.empty}><Hint>Sign in to keep your teammates and their conversations together.</Hint><Button title="Sign in" onPress={() => setAccount(true)} /></View> : <>
        {error && <View style={s.notice}><Hint error>{error}</Hint><Button secondary title="Refresh teammates" busy={loading} onPress={() => void refresh()} /></View>}
        {agentMissing && !error && <View style={s.notice}><Hint>This teammate is missing from the latest list. Refresh to check again.</Hint><Button secondary title="Refresh teammate" busy={loading} onPress={() => void refresh()} /></View>}
        {paused && !agent && <View style={s.notice}><Hint>Teammate tasks are paused. Your history is still available.</Hint></View>}
        {needsPro && !agent && !creating && <View style={s.notice} testID="agents-need-pro">
          <Hint>Agents are part of Vibyra Pro. Give teammates a job and they keep working while you’re away. Your teammates and their history stay here.</Hint>
          {onWallet && <Button title="See Vibyra Pro" onPress={onWallet} />}
        </View>}
        {nudged && !enabled && !paused && !agent && <View style={s.notice}><Hint>{error ? 'Refresh teammates before adding one.' : 'Teammates are still loading. Try again in a moment.'}</Hint></View>}
        <View style={[s.body, (agent || creating || activity) && s.hidden]} accessibilityElementsHidden={Boolean(agent || creating || activity)} importantForAccessibility={agent || creating || activity ? 'no-hide-descendants' : 'auto'}>

          <TeammateRoster teammates={roster?.teammates ?? []} enabled={enabled} loading={loading} onRefresh={() => void refresh()} onOpen={open} onCreate={() => configure()} onActivity={v2 ? () => setActivity(true) : undefined} />
        </View>
        {activity && v2 && !agent && !creating && <ActivityScreen api={api} teammates={roster?.teammates ?? []} active={active && !covered} onOpen={openFromActivity} />}
        {visited.map(snapshot => {
          const teammate = roster?.teammates.find(a => a.id === snapshot.id) ?? snapshot;
          const listed = Boolean(roster?.teammates.some(a => a.id === snapshot.id));
          const visible = snapshot.id === selected && !creating && !setupVisible;
          return <View key={snapshot.id} style={[s.body, !visible && s.hidden]} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
            <AgentConversation key={mode} runs={mode === 'v2' ? api.runs : undefined} onOpenAccess={v2 ? () => configure(teammate, 'tools') : undefined} onRead={read} onStale={() => void refresh()} agent={teammate} agents={api} api={chatApi} workspace={workspace} active={active && visible && !covered && listed} enabled={enabled && listed} onWallet={onWallet} />
          </View>;
        })}
        {creationVisited && <View style={[s.body, !creating && s.hidden]} accessibilityElementsHidden={!creating} importantForAccessibility={creating ? 'auto' : 'no-hide-descendants'}>
          <TeammateSetupChat api={api} identity={identity} name={workspace.demo ? '' : workspace.account.name} enabled={enabled} active={active && creating && !covered} onSaved={saved} v2={v2} onTemplateCreated={templated} />
        </View>}
          {setup && <TeammateSetup key={setup.key} visible={setupVisible} agent={setup.agent} api={api} enabled={enabled} identity={identity} openStep={setup.step} openNonce={setup.nonce} v2={v2}
      onClose={() => setSetupVisible(false)} onSaved={saved} />}
      </>}
      </View>
    </SafeAreaView>
    <NavigationDrawer visible={menu} destination="work" workspace={workspace} onClose={() => setMenu(false)} onNavigate={() => {}} onNew={() => {}}
      content={closeThen => <View style={s.body}>
        <View style={s.railHeader}><BrandMark size={22} /><Text accessibilityRole="header" style={[s.railBrand, { color: colors.text }]}>Vibyra</Text>
          <IconButton icon="add" label="New teammate" disabled={!enabled} onPress={() => closeThen(() => configure())} /><IconButton icon="close" label="Close navigation menu" onPress={() => setMenu(false)} /></View>
        {v2 && <Pressable accessibilityRole="button" accessibilityLabel="Activity across your teammates" onPress={() => { setMenu(false); setActivity(true); clear(); }} style={({ pressed }) => [s.railRow, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="pulse-outline" size={18} color={colors.text} /><Text style={[s.railRowText, { color: colors.text }]}>Activity</Text></Pressable>}
        <Text style={[s.railSection, { color: colors.muted }]}>Teammates</Text>
        <TeammateRoster teammates={roster?.teammates ?? []} enabled={enabled} loading={loading} onRefresh={() => void refresh()} onOpen={a => { setActivity(false); open(a); setMenu(false); }} onCreate={() => closeThen(() => configure())} compact />
        <View style={[s.railFooter, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <DrawerFooterActions onSettings={() => closeThen(onMenu)} />
        </View>
      </View>} />
    <AccountSheet visible={account} workspace={workspace} onClose={() => setAccount(false)} />
  </View>;
}
const s = StyleSheet.create({ body: { flex: 1 }, frame: { flex: 1, width: '100%', maxWidth: 820, alignSelf: 'center' }, hidden: { display: 'none' }, header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 8 },
  threadHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44 }, grow: { flex: 1 }, name: { ...font.row, fontWeight: '600' },
  status: { ...font.caption, fontWeight: '400', marginTop: 1 },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 6 }, sampleDot: { width: 6, height: 6, borderRadius: 3 },
  sampleText: { ...font.caption },
  railHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 22, paddingRight: 6 }, railBrand: { ...font.headline, flex: 1 },
  railRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 24 }, railRowText: { ...font.row },
  railSection: { ...font.section, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 2 },
  railFooter: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 24, borderTopWidth: StyleSheet.hairlineWidth }, notice: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 }, empty: { flex: 1, justifyContent: 'center', padding: 28, gap: 20 } });
