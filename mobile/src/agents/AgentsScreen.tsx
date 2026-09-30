import { NavigationDrawer } from '../ui/NavigationDrawer';
import { RailRow } from '../ui/RailRow';
import { DrawerFooterActions } from '../ui/DrawerFooterActions';
import { SkillsSheet } from './SkillsSheet';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { AccountSheet } from '../ui/AccountSheet';
import { BrandMark, Button, Hint, IconButton } from '../ui/primitives';
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

/** Account-keyed by the shell. Keep at most three chat views mounted. */
export function AgentsScreen({ api, chatApi, workspace, active, onMode, onMenu, onReport, onWallet, requestedAgent }: {
  requestedAgent?: { id: string; nonce: number };
  api: AgentsApi; chatApi: VibesApi; workspace: WorkspaceModel; active: boolean;
  onMode(mode: ProductMode): void; onMenu(): void; onReport(): void; onWallet(): void;
}) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  const { roster, loading, error, refresh, adopt } = useRoster(api, Boolean(workspace.account), active);
  const [menu, setMenu] = useState(false);
  const [skills, setSkills] = useState(false);
  const { selected, visited, setup, creating, creationVisited, setupVisible, setSetupVisible,
    open, configure, saved, back } = useAgentNavigation(roster, requestedAgent, adopt, refresh);
  const [account, setAccount] = useState(false);
  const agent = roster?.teammates.find(a => a.id === selected);
  const enabled = roster?.enabled === true && !error;
  const paused = roster !== null && !roster.enabled;
  // A "+" tapped before teammates were ready; the notice it raises leaves once they are.
  const [nudged, setNudged] = useState(false);
  useEffect(() => { if (!active) { setSetupVisible(false); setAccount(false); } else void refresh(); }, [active, refresh, setSetupVisible]);
  const covered = account || skills || menu;
  const identity = `${workspace.demo ? 'sample:' : ''}${workspace.account?.email ?? 'guest'}`;
  return <View style={s.body}>
    <SafeAreaView style={s.body} accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'} aria-hidden={covered}>
      <View style={s.frame}>
      <View style={s.header}>
        <IconButton icon="menu-outline" label="Open navigation menu" onPress={() => setMenu(true)} />
        <View style={s.grow}><ProductModeSwitch mode="agent" onChange={onMode} /></View>
        {!paused ? <IconButton icon="add" label="New teammate" disabled={!workspace.account} onPress={() => enabled ? configure() : setNudged(true)} /> : <View style={{ width: 44 }} />}
      </View>
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
        {paused && !agent && <View style={s.notice}><Hint>Teammate tasks are paused. Your history is still available.</Hint></View>}
        {nudged && !enabled && !paused && !agent && <View style={s.notice}><Hint>{error ? 'Refresh teammates before adding one.' : 'Teammates are still loading. Try again in a moment.'}</Hint></View>}
        <View style={[s.body, (agent || creating) && s.hidden]} accessibilityElementsHidden={Boolean(agent || creating)} importantForAccessibility={agent || creating ? 'no-hide-descendants' : 'auto'}>

          <TeammateRoster teammates={roster?.teammates ?? []} enabled={enabled} loading={loading} onRefresh={() => void refresh()} onOpen={open} onCreate={() => configure()} />
        </View>
        {visited.map(id => {
          const teammate = roster?.teammates.find(a => a.id === id); if (!teammate) return null;
          const visible = id === selected && !creating && !setupVisible;
          return <View key={id} style={[s.body, !visible && s.hidden]} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
            <AgentConversation agent={teammate} agents={api} api={chatApi} workspace={workspace} active={active && visible && !covered} enabled={enabled} onWallet={onWallet} />
          </View>;
        })}
        {creationVisited && <View style={[s.body, !creating && s.hidden]} accessibilityElementsHidden={!creating} importantForAccessibility={creating ? 'auto' : 'no-hide-descendants'}>
          <TeammateSetupChat api={api} identity={identity} name={workspace.demo ? '' : workspace.account.name} enabled={enabled} active={active && creating && !covered} onSaved={saved} />
        </View>}
          {setup && <TeammateSetup key={setup.key} visible={setupVisible} agent={setup.agent} api={api} enabled={enabled} identity={identity}
      onClose={() => setSetupVisible(false)} onSaved={saved} />}
      </>}
      </View>
    </SafeAreaView>
    <NavigationDrawer visible={menu} destination="work" workspace={workspace} onClose={() => setMenu(false)} onNavigate={() => {}} onNew={() => {}}
      content={closeThen => <View style={s.body}>
        <View style={s.railHeader}><BrandMark size={22} /><Text accessibilityRole="header" style={[s.railBrand, { color: colors.text }]}>Vibyra</Text>
          <IconButton icon="add" label="New teammate" disabled={!enabled} onPress={() => closeThen(() => configure())} /><IconButton icon="close" label="Close navigation menu" onPress={() => setMenu(false)} /></View>
        <Text style={[s.railSection, { color: colors.muted }]}>Teammates</Text>
        <TeammateRoster teammates={roster?.teammates ?? []} enabled={enabled} loading={loading} onRefresh={() => void refresh()} onOpen={a => { open(a); setMenu(false); }} onCreate={() => closeThen(() => configure())} compact />
        <View style={[s.railFooter, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
          {api.skills && <RailRow icon="sparkles-outline" label="Skills" onPress={() => closeThen(() => setSkills(true))} />}
          <DrawerFooterActions onSettings={() => closeThen(onMenu)} onReport={() => closeThen(onReport)} />
        </View>
      </View>} />
    {api.skills && <SkillsSheet visible={skills} api={api} identity={identity} teammates={roster?.teammates ?? []} onClose={() => { setSkills(false); void refresh(); }} />}
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
  railSection: { ...font.section, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 2 },
  railFooter: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 24, borderTopWidth: StyleSheet.hairlineWidth }, notice: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 }, empty: { flex: 1, justifyContent: 'center', padding: 28, gap: 20 } });
