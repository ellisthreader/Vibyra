import { useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from './font';
import { useKeyboardOffset } from './keyboardOffset';
import { canStartWork } from './mode';
import { Hint, Icon } from './primitives';
import { defaultChoices, modelChoice, ProjectTerminalModels, type TerminalChoice } from './ProjectTerminalModels';
import { ProjectTerminalOptions } from './ProjectTerminalOptions';
import type { Project, TerminalPermission, WorkspaceModel } from './types';
import { useAction } from './useAction';
import { useTerminalModels } from './useTerminalModels';

/** Empty computer folder: choosing an AI never creates a chat or starts work. */
export function ProjectTerminalLauncher({ workspace, project, onConnect, onOpenSession }: {
  workspace: WorkspaceModel; project: Project; onConnect(): void; onOpenSession(id: string): void;
}) {
  const { colors } = useTheme();
  const keyboardOffset = useKeyboardOffset();
  const catalogue = useTerminalModels(true, workspace);
  const [choice, setChoice] = useState<TerminalChoice | null>(null);
  const [title, setTitle] = useState('');
  const [safeMode, setSafeMode] = useState(false);
  const [permission, setPermission] = useState<TerminalPermission>('standard');
  const [picking, setPicking] = useState(false);
  const { busy, error, run, clearError } = useAction();
  const connected = workspace.status === 'connected';
  const permitted = canStartWork(workspace);
  const selected = choice?.model
    ? catalogue.models.some(model => model.id === choice.id) ? choice : undefined
    : choice ?? (catalogue.supported ? catalogue.models[0] && modelChoice(catalogue.models[0]) : defaultChoices[0]);
  const disabled = busy || picking || !connected || !permitted || !selected ||
    (selected.kind !== 'shell' && permission === 'full' && !catalogue.permissions);
  const launch = () => {
    if (disabled || !selected) return;
    Keyboard.dismiss();
    void run(async () => {
      const session = await workspace.actions.createSession(project.id, selected.kind, title.trim() || selected.name, {
        safeMode, ...(selected.model ? { model: selected.id } : {}),
        ...(selected.kind !== 'shell' && catalogue.permissions ? { permissionMode: permission } : {}),
      });
      if (session) onOpenSession(session.id);
    });
  };
  return <KeyboardAvoidingView style={s.page} testID="project-terminal-launcher"
    behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}>
      <View style={s.hero}>
        <View style={[s.folder, { backgroundColor: colors.accentSoft }]}><Icon name="terminal-outline" size={26} color={colors.accent} /></View>
        <Text accessibilityRole="header" style={[font.display, { color: colors.text }]}>New terminal</Text>
        <Text style={[font.body, { color: colors.muted }]}>Choose an AI to work in {project.name}.</Text>
        <Text numberOfLines={1} ellipsizeMode="middle" style={[font.footnote, { color: colors.muted }]}>{project.path}</Text>
      </View>
      {catalogue.loading && <ActivityIndicator accessibilityLabel="Loading computer models" color={colors.accent} />}
      {catalogue.error && <View><Hint error>{catalogue.error}</Hint>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading models" onPress={catalogue.refresh} style={s.retry}>
          <Text style={[font.row, { color: colors.accent }]}>Try again</Text>
        </Pressable></View>}
      <ProjectTerminalModels models={catalogue.models} supported={catalogue.supported} selected={selected} disabled={busy}
        loading={catalogue.loading} error={catalogue.error} onPickingChange={setPicking}
        refresh={catalogue.refresh} choose={next => { setChoice(next); clearError(); }} />
      <View style={[s.options, { borderColor: colors.border }]}>
        <ProjectTerminalOptions title={title} setTitle={setTitle} safeMode={safeMode} setSafeMode={setSafeMode} disabled={busy}
          permission={permission} setPermission={setPermission} permissionsAvailable={catalogue.permissions} shell={selected?.kind === 'shell'} />
      </View>
      {error && <Hint error>{error}</Hint>}
      {!connected && <Hint>Connect to {workspace.host?.name ?? 'your computer'} to start a terminal in this folder.</Hint>}
      {connected && !permitted && <Hint>Turn on Typing from your phone in Vibyra on your computer to start a terminal.</Hint>}
    </ScrollView>
    <View style={[s.footer, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={connected ? 'Launch terminal' : 'Connect computer'}
        accessibilityState={{ disabled: connected ? disabled : busy, busy }} disabled={connected ? disabled : busy}
        onPress={connected ? launch : onConnect}
        style={({ pressed }) => [s.launch, { backgroundColor: colors.action, opacity: (connected && disabled) || pressed ? 0.5 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Icon name={connected ? 'arrow-up-outline' : 'laptop-outline'} size={20} color="#fff" />}
        <Text style={[font.headline, { color: '#fff' }]}>{busy ? 'Starting terminal…' : connected ? 'Launch terminal' : 'Connect computer'}</Text>
      </Pressable>
      <Text style={[s.caption, { color: colors.muted }]}>{workspace.demo ? 'Sample workspace · No commands are sent' : 'Runs on your computer · Your AI accounts'}</Text>
    </View>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  page: { flex: 1, minHeight: 0 }, content: { padding: 20, paddingTop: 22, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { gap: 8, paddingBottom: 8 }, folder: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  options: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  retry: { minHeight: 44, justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  launch: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', maxWidth: 520, alignSelf: 'center' },
  caption: { ...font.caption, textAlign: 'center' },
});
