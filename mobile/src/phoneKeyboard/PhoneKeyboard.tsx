import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useTheme } from '../theme';
import { Sheet } from '../ui/Sheet';
import { Hint, IconButton } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { PhoneTextEditor } from './PhoneTextEditor';

export function PhoneKeyboard({ workspace }: { workspace: WorkspaceModel }) {
  return workspace.actions.focusedText && workspace.host ? <ConnectedKeyboard key={workspace.host.id} workspace={workspace} /> : null;
}
function ConnectedKeyboard({ workspace }: { workspace: WorkspaceModel }) {
  const available = workspace.status === 'connected' && workspace.canType && workspace.focusedTextAvailable;
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const input = useRef<TextInput>(null);
  const editor = useMemo(() => new PhoneTextEditor(workspace.actions.focusedText!, () => Crypto.randomUUID()), [workspace.actions.focusedText]);
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot, editor.snapshot);
  const close = () => { Keyboard.dismiss(); editor.close(false); setOpen(false); setShown(false); };
  useEffect(() => {
    if (open && shown && !state.paused) input.current?.focus();
  }, [open, shown, state.paused, state.target?.id]);
  useEffect(() => () => editor.close(), [editor]);
  useEffect(() => {
    if (workspace.status !== 'connected') editor.close(false);
    else if (!workspace.canType || !workspace.focusedTextAvailable) editor.close();
    else return;
    Keyboard.dismiss(); setOpen(false); setShown(false);
  }, [workspace.status, workspace.canType, workspace.focusedTextAvailable, editor]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', status => { if (status === 'background') { editor.close(false); setOpen(false); setShown(false); } });
    return () => sub.remove();
  }, [editor]);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => { void editor.poll(); }, 500);
    return () => clearInterval(timer);
  }, [open, editor]);
  return !available ? null : <>
    <IconButton icon="keypad-outline" label="Type on your Mac" onPress={() => { setOpen(true); if (!editor.state.target) void editor.open(); }} />
    {open && <Sheet title="Type on your Mac" visible onClose={close} onShow={() => setShown(true)} scroll={false}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{state.target?.label ?? workspace.host?.name}</Text>
        {!!state.target?.context && <Text style={{ color: colors.muted }}>{state.target.context}</Text>}
        <TextInput ref={input} key={state.target?.id ?? 'empty'} accessibilityLabel="Mac text field" value={state.text} selection={state.selection}
          editable={!state.paused} multiline={state.target?.multiline ?? true}
          maxLength={state.target?.maxLength ?? 8000} submitBehavior={state.target?.multiline ? 'newline' : 'blurAndSubmit'}
          onChangeText={text => editor.edit(text)} onSelectionChange={event => editor.select(event.nativeEvent.selection)}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>
          {state.paused ? 'Paused' : state.pending ? 'Updating Mac…' : 'Up to date on Mac'}</Text>
        {state.error ? <Hint error>{state.error}</Hint> : <Hint>Edits appear on your Mac. Use its Send or Save button when ready.</Hint>}
        {state.paused && !!state.text && <Text selectable accessibilityLabel="Kept phone text" style={{ color: colors.text }}>{state.text}</Text>}
        {state.paused && !state.pending && <Pressable accessibilityRole="button" accessibilityLabel="Load current Mac field"
          onPress={() => void editor.open()} style={styles.retry}><Text style={{ color: colors.accent }}>{state.text ? 'Replace phone copy with current Mac field' : 'Load current Mac field'}</Text></Pressable>}
      </View>
    </Sheet>}
  </>;
}
const styles = StyleSheet.create({ body: { padding: 20, gap: 12 }, title: { fontSize: 17, fontWeight: '600' },
  input: { minHeight: 100, maxHeight: 250, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 17, textAlignVertical: 'top' },
  retry: { minHeight: 44, justifyContent: 'center' } });
