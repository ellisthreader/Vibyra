import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { useKeyboardOffset } from '../../ui/keyboardOffset';
import { Button, Hint } from '../../ui/primitives';
import { font } from '../../ui/font';
import type { AgentsApi, Teammate } from '../types';
import { EnginePicker } from './EnginePicker';
import { SetupCapabilities } from './SetupCapabilities';
import { SetupMemory } from './SetupMemory';
import { SetupTools } from './SetupTools';
import { SetupReview } from './SetupReview';
import { SetupRoutines } from './SetupRoutines';
import { SetupField, form } from './SetupForm';
import { useSetupChat } from './useSetupChat';
import type { SetupStep } from './types';
const tabs: { title: string; step: SetupStep }[] = [{ title: 'Profile', step: 'review' }, { title: 'Skills', step: 'skills' }, { title: 'Memory', step: 'memory' }, { title: 'Access', step: 'tools' }];

export function TeammateSetupChat({ api, identity, name, active, enabled, onSaved, agent, onLockChange }: {
  onLockChange?(locked: boolean): void; agent?: Teammate; api: AgentsApi; identity: string; name: string; active: boolean; enabled: boolean; onSaved(agent: Teammate): void;
}) {
  const [skillEditing, setSkillEditing] = useState(false);
  const { colors } = useTheme(); const offset = useKeyboardOffset(); const scroll = useRef<ScrollView>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const chat = useSetupChat({ api, identity, enabled: enabled && active, onSaved, agent });
  const { draft } = chat; const { step, fields } = draft; const locked = chat.locked || !active;
  useEffect(() => { onLockChange?.(chat.locked || skillEditing); }, [chat.locked, skillEditing, onLockChange]);
  useEffect(() => { if (active) scroll.current?.scrollTo({ y: 0, animated: false }); }, [step, active]);
  const tab = step === 'skills' || step === 'memory' ? step : ['tools', 'budget', 'routine'].includes(step) ? 'tools' : 'review';
  const valid = Boolean(fields.name.trim() && fields.brief.trim() && Number.isInteger(fields.budget) && fields.budget >= 1 && fields.budget <= 50);
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
    <View style={[s.navigation, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
      {tabs.map(item => <Pressable key={item.step} accessibilityRole="tab" accessibilityState={{ selected: tab === item.step }}
        onPress={() => { Keyboard.dismiss(); if (!locked) chat.update({ step: item.step }); }} style={s.tab}>
        <Text style={[s.tabLabel, { color: tab === item.step ? colors.text : colors.muted }, tab === item.step && s.tabOn]}>{item.title}</Text>
        {/* Navigation stays neutral: the chosen tab is marked in the text colour, not cobalt. */}
        <View style={[s.indicator, { backgroundColor: tab === item.step ? colors.text : 'transparent' }]} />
      </Pressable>)}
    </View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={tab !== 'review' && s.hidden}>
        <View style={form.body}>
          <SetupReview fields={fields} locked={locked} budgetOnly={false} onChange={chat.fields} />
          <SetupField label="Brief" accessibilityLabel="Teammate task" value={fields.brief} onChangeText={brief => chat.fields({ brief })} editable={!locked} multiline maxLength={3900}
            placeholder="What should this teammate do?" hint="Describe its job, sources and what a useful result looks like." />
          <EnginePicker model={fields.model} disabled={locked} onChange={model => chat.fields({ model })} />
        </View>
      </View>
      <View style={tab !== 'skills' && s.hidden}><SetupCapabilities storage={`${identity}.${agent?.id ?? 'new'}`} onEditing={setSkillEditing} kind="skills" api={api} fields={fields} disabled={locked} onChange={chat.fields} /></View>
      <View style={tab !== 'memory' && s.hidden}><SetupMemory name={name} timezone={timezone} text={fields.memory} disabled={locked} onChange={memory => chat.fields({ memory })} /></View>
      <View style={[form.body, tab !== 'tools' && s.hidden]}>
        <SetupTools selected={fields.integrations} disabled={locked} onChange={integrations => chat.fields({ integrations })}
          plans={draft.requestedTools ?? ''} onPlans={requestedTools => chat.update({ requestedTools })} />
        <SetupReview fields={fields} locked={locked} budgetOnly onChange={chat.fields} />
        <SetupRoutines routines={draft.routines} suggestion={draft.routineSuggestion} disabled={locked} onChange={routines => chat.update({ routines })} />
      </View>
    </ScrollView>
    {chat.error && <View style={s.notice}><Hint error>{chat.error}</Hint>{agent && /changed|Reload/i.test(chat.error) && <Button secondary title="Discard draft & reload" disabled={chat.busy} onPress={() => void chat.reloadProfile()} />}{!chat.ready && <Button secondary title="Restore pending save" onPress={chat.restore} />}</View>}
    <View style={[s.footer, { borderColor: colors.border }]}>
      <>
        {draft.pending ? <Hint>Your save is unconfirmed. Retry keeps the same teammate and details.</Hint>
          : <Text style={[s.caption, { color: colors.muted }]}>{skillEditing ? 'Finish or cancel the skill to save your teammate.' : valid ? 'Ready when you are. You can edit these details later.' : fields.brief ? 'Give your teammate a name to finish setup.' : 'Add a task to get started. Everything else can follow.'}</Text>}
        <Button title={draft.pending ? 'Retry save' : agent ? 'Save changes' : 'Create teammate'} disabled={skillEditing || !chat.ready || !valid || !enabled || !active} busy={chat.busy}
          onPress={() => { Keyboard.dismiss(); void chat.create(); }} />
      </>
    </View>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ body: { flex: 1 }, content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hidden: { display: 'none' }, navigation: { flexDirection: 'row', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'flex-end' },
  tabLabel: { fontSize: 14.5, lineHeight: 20, fontWeight: '500', letterSpacing: -0.15, paddingBottom: 11 }, tabOn: { fontWeight: '600' },
  indicator: { position: 'absolute', bottom: 0, left: 14, right: 14, height: 2, borderRadius: 1 },
  notice: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: 560, alignSelf: 'center' },
  caption: { ...font.footnote, fontSize: 12.5, textAlign: 'center' } });
