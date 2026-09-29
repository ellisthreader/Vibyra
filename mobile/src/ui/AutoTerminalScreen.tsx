import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { VibesComposer } from '../vibes/VibesComposer';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from './primitives';
import { Sheet } from './Sheet';
import { AutoConstellation } from './AutoConstellation';
import { useAction } from './useAction';
import { useDraft } from './useDraft';
import { useKeyboardOffset } from './keyboardOffset';
import type { Session, WorkspaceModel } from './types';

export function AutoTerminalScreen({ session, workspace, options, onCloseOptions }: {
  session: Session; workspace: WorkspaceModel; options: boolean; onCloseOptions(): void;
}) {
  const { colors } = useTheme();
  const offset = useKeyboardOffset();
  const [text, setText, draftError, clearSent] = useDraft(`auto:${workspace.account?.email}:${workspace.host?.id}:${session.id}`, true);
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  const send = () => void run(async () => {
    if (!workspace.actions.submitAutoTerminal) throw new Error('Open this terminal again.');
    await workspace.actions.submitAutoTerminal(session.id, text); clearSent(text);
  });
  return <KeyboardAvoidingView testID="auto-terminal" style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    <AutoConstellation progress={session.autoProgress} failed={!!error} visible={!options} />
    {(error || draftError) && <View style={s.notice}><Hint error>{error || draftError}</Hint>
      {session.resolvedAutoSession && <Button secondary title="Open terminal" onPress={() => workspace.actions.openResolvedAutoTerminal?.(session.id)} />}</View>}
    <VibesComposer input={{ text, onChange: value => { if (!busy) setText(value); }, placeholder: 'Message your AI…' }}
      model={{ label: 'Vibyra Auto', id: 'auto', onOpen: () => {}, control: <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="sparkles" size={13} color={colors.accent} /><Text style={{ color: colors.muted, fontSize: 13 }}>{busy ? (session.autoProgress?.phase === 'sending' ? 'Sending…' : session.autoProgress?.phase === 'starting' ? 'Starting…' : 'Choosing…') : 'Auto'}</Text></View> }}
      attachments={{ items: [], onAdd: () => {}, onRemove: () => {}, control: <></> }}
      submission={{ busy: false, voiceDisabled: busy, disabled: busy || !connected || !text.trim(), blocked: !connected ? 'Reconnect to send.' : undefined,
        onSend: send, onStop: () => {} }} />
    <Sheet title="Terminal details" visible={options} onClose={onCloseOptions}>
      <Button secondary title="Close terminal" disabled={busy} onPress={() => void run(async () => { await workspace.actions.stopSession(session.id); onCloseOptions(); })} />
    </Sheet>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 }, notice: { paddingHorizontal: 20, gap: 8 } });
