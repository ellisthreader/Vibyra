import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Sheet } from '../ui/Sheet';
import { Button, Hint, Icon } from '../ui/primitives';
import type { Project, WorkspaceModel } from '../ui/types';
import { useVibes } from './VibesProvider';

export function ProjectSheet({ visible, onClose, workspace, requestedProject }: { visible: boolean; onClose(): void; workspace: WorkspaceModel; requestedProject?: Project }) {
  const { colors } = useTheme(); const { store, wallet, pending } = useVibes();
  const [projectId, setProjectId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => { ++generation.current; }, [visible]);
  const close = () => { ++generation.current; onClose(); };
  useEffect(() => { if (visible) { setProjectId(requestedProject?.id ?? ''); setError(null); } }, [visible, requestedProject?.id]);
  const live = useRef({ workspace, store, wallet, visible }); live.current = { workspace, store, wallet, visible };
  const attach = async () => {
    if (!wallet?.consented || !workspace.vibesToolsAvailable || workspace.status !== 'connected' || workspace.viewOnly
      || !workspace.actions.vibesProjectRequest || !store.api.attach || !workspace.host || busy || pending
      || !workspace.projects.some(p => p.id === projectId)) return;
    const selection = store.state.selectionVersion; const hostId = workspace.host.id; const attempt = generation.current;
    const assertCurrent = () => {
      const now = live.current;
      if (attempt !== generation.current || !now.visible || now.store !== store || now.wallet?.accountToken !== wallet.accountToken
        || store.state.selectionVersion !== selection || now.workspace.status !== 'connected'
        || now.workspace.host?.id !== hostId || !now.workspace.vibesToolsAvailable || now.workspace.viewOnly
        || !now.workspace.projects.some(p => p.id === projectId)) throw new Error('The chat or computer changed. Please try again.');
    };
    setBusy(true); setError(null);
    try {
      const chatId = await store.chat('Project chat');
      assertCurrent();
      const result = await workspace.actions.vibesProjectRequest('vibes.bind', {
        hostId: workspace.host.id, projectId, chatId, accountToken: wallet.accountToken,
      });
      if (typeof result.binding !== 'string') throw new Error('The computer did not authorize this project.');
      assertCurrent();
      await store.api.attach(chatId, workspace.host.id, projectId, result.binding);
      assertCurrent(); await store.refresh(); assertCurrent(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Project could not be attached.'); }
    finally { setBusy(false); }
  };
  return <Sheet title="Use a project" visible={visible} onClose={close}>
    <Text style={[s.description, { color: colors.muted }]}>{requestedProject?.kind === 'railway'
      ? 'Allow this chat to read Railway projects, deployments and logs through your Mac. Each read needs approval before its results go to Vibyra, OpenRouter and your chosen AI provider. Logs may contain sensitive data. Nothing is deployed or changed.'
      : 'Allow this chat to read files in one project and share their contents with Vibyra, OpenRouter and your chosen AI provider. Every read needs approval. You review each file edit before it runs.'}</Text>
    {!workspace.vibesToolsAvailable || workspace.status !== 'connected' ? <Hint>Connect an updated Vibyra Host to use project tools.</Hint> :
      workspace.projects.filter(p => !requestedProject || p.id === requestedProject.id).map(p => <Pressable key={p.id} accessibilityRole="radio" accessibilityLabel={p.name} aria-checked={p.id === projectId}
        accessibilityState={{ checked: p.id === projectId, disabled: busy }} disabled={busy} onPress={() => setProjectId(p.id)}
        style={[s.row, { borderColor: p.id === projectId ? colors.accent : colors.border }]}>
        <Icon name="folder-outline" size={19} color={colors.muted} /><View style={s.text}>
          <Text style={[s.name, { color: colors.text }]}>{p.name}</Text><Text style={[s.detail, { color: colors.muted }]}>{workspace.host?.name}</Text></View>
        <Icon name={p.id === projectId ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.accent} />
      </Pressable>)}
    {error && <Hint error>{error}</Hint>}
    <Button title="Use this project" busy={busy} disabled={!projectId || Boolean(pending) || !wallet?.consented} onPress={() => void attach()} />
    <Button title="Not now" secondary onPress={close} />
  </Sheet>;
}
const s = StyleSheet.create({ description: { fontSize: 14, lineHeight: 22 }, row: { borderWidth: 1, borderRadius: 17, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 6 }, name: { fontSize: 15, fontWeight: '500' }, detail: { fontSize: 12 } });
