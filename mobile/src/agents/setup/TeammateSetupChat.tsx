import { useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { useKeyboardOffset } from '../../ui/keyboardOffset';
import { Button, Hint, Icon } from '../../ui/primitives';
import type { AgentsApi, Teammate } from '../types';
import { SetupWelcome } from './SetupWelcome';
import { SetupSummary } from './SetupSummary';
import { SetupMemory } from './SetupMemory';
import { SetupTools } from './SetupTools';
import { SetupReview } from './SetupReview';
import { SetupRoutines } from './SetupRoutines';
import { SetupField, SetupHeading, form } from './SetupForm';
import { useSetupChat } from './useSetupChat';
import type { SetupStep } from './types';

export function TeammateSetupChat({ api, identity, name, active, enabled, onSaved }: {
  api: AgentsApi; identity: string; name: string; active: boolean; enabled: boolean; onSaved(agent: Teammate): void;
}) {
  const { colors } = useTheme(); const offset = useKeyboardOffset(); const scroll = useRef<ScrollView>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const chat = useSetupChat({ api, identity, enabled: enabled && active, onSaved });
  const { draft } = chat; const { step, fields } = draft; const locked = chat.locked || !active;
  useEffect(() => { if (active) scroll.current?.scrollTo({ y: 0, animated: false }); }, [step, active]);
  const edit = (next: SetupStep) => {
    if (locked) return;
    Keyboard.dismiss(); chat.update({ step: next, text: next === 'memory' ? fields.memory : next === 'tools' ? draft.requestedTools ?? '' : next === 'job' ? fields.brief : '' });
  };
  const done = () => {
    if (locked) return;
    Keyboard.dismiss();
    if (step === 'job' && draft.text.trim()) chat.job(draft.text);
    else if (step === 'memory') chat.memory(draft.text, false);
    else if (step === 'tools') chat.update({ requestedTools: draft.text.trim() || undefined, step: 'review', text: '' });
    else if (step === 'routine') chat.routines(draft.routines);
    else edit('review');
  };
  const valid = Boolean(fields.name.trim() && fields.brief.trim() && Number.isInteger(fields.budget) && fields.budget >= 1 && fields.budget <= 50);
  const editorValid = step !== 'budget' || Number.isInteger(fields.budget) && fields.budget >= 1 && fields.budget <= 50;
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    {step !== 'review' && <View style={s.navigation}><Pressable accessibilityRole="button" accessibilityLabel="Back to overview" onPress={done} disabled={locked || !editorValid} style={s.back}>
      <Icon name="chevron-back" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 13 }}>Overview</Text></Pressable></View>}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {step === 'job' && <View style={form.body}><SetupHeading title="Task" description="Give your teammate one clear job to focus on." />
        <SetupField label="What should it do?" accessibilityLabel="Teammate task" value={draft.text} onChangeText={text => chat.update({ text })} editable={!locked} multiline maxLength={3900}
          placeholder="e.g. Review my pull requests and flag risks…" hint="Include the sources it should use and what a useful result looks like." />
        <SetupWelcome disabled={locked} onChoose={job => chat.job(job, true)} /></View>}
      {step === 'review' && <SetupSummary draft={draft} locked={locked} onEdit={edit} />}
      {step === 'memory' && <SetupMemory name={name} timezone={timezone} text={draft.text} disabled={locked} onChange={text => chat.update({ text })} />}
      {step === 'tools' && <SetupTools selected={fields.integrations} disabled={locked} onChange={integrations => chat.fields({ integrations })}
        plans={draft.text} onPlans={text => chat.update({ text })} />}
      {step === 'routine' && <SetupRoutines routines={draft.routines} suggestion={draft.routineSuggestion} disabled={locked} onChange={routines => chat.update({ routines })} />}
      {(step === 'identity' || step === 'budget') && <SetupReview fields={fields} locked={locked} budgetOnly={step === 'budget'} onChange={chat.fields} />}
    </ScrollView>
    {chat.error && <View style={s.notice}><Hint error>{chat.error}</Hint>{!chat.ready && <Button secondary title="Restore pending save" onPress={chat.restore} />}</View>}
    <View style={[s.footer, { borderColor: colors.border }]}>
      {step === 'review' ? <>
        {draft.pending ? <Hint>Your save is unconfirmed. Retry keeps the same teammate and details.</Hint>
          : <Text style={[s.caption, { color: colors.muted }]}>{valid ? 'Ready when you are. You can edit these details later.' : fields.brief ? 'Give your teammate a name to finish setup.' : 'Add a task to get started. Everything else can follow.'}</Text>}
        <Button title={draft.pending ? 'Retry save' : 'Create teammate'} disabled={!chat.ready || !valid || !enabled || !active} busy={chat.busy}
          onPress={() => { Keyboard.dismiss(); void chat.create(); }} />
      </> : <Button title="Done" disabled={locked || !editorValid || step === 'job' && !draft.text.trim()} onPress={done} />}
    </View>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 }, content: { padding: 24, paddingTop: 12, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  navigation: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20 }, back: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  notice: { paddingHorizontal: 24, paddingVertical: 8, gap: 8 }, footer: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: 560, alignSelf: 'center' },
  caption: { fontSize: 12, lineHeight: 18, textAlign: 'center' } });
