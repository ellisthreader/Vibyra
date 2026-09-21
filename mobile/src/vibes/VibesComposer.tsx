import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { MentionInput } from '../integrations/MentionInput';
import { MentionBar } from '../integrations/MentionBar';
import { activeMention, applyMention } from '../integrations/mentions';
import type { Integration } from '../integrations/types';
import { BrandLogo } from '../ui/BrandLogo';
import { refused } from '../ui/haptics';
import { vendorOf } from '../ui/brands';
import { effortChoice, efforts as canonical } from '../ui/effort';
import { useBreath } from '../ui/motion';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { Anchor } from './AttachMenu';
import { AttachmentTray } from './AttachmentTray';
import { vibeWord, vibes } from './count';
import { DictationButton } from './DictationButton';
import { EffortChip } from './EffortChip';
import { EffortSlider } from './EffortSlider';
import { useGlass } from './glass';
import { ComposerSurface } from './ComposerSurface';
import { useComposerPanelFocus } from './useComposerPanelFocus';
import type { Effort } from './types';
import type { Attached } from './useAttachments';

export interface ComposerEffort {
  open?: boolean; onClose?(): void; onCommit?(): void;
  /** The model's own ladder. Show effort only when it can be adjusted or is Auto. */
  ladder: Effort[]; value: Effort | null; onChange(effort: Effort): void;
  /** Auto picks the level for each message; `value` is then its pick, once quoted. */
  automatic: boolean; onChooseModel(): void;
}

/**
 * The message box: a sheet of glass floating above the page. The words on top;
 * under them the + that adds to the message, one pill naming the model and how hard
 * it thinks, the microphone, and send — the only thing here that is filled, because
 * it is the one thing that does the work. While a reply is on its way the rim
 * breathes the accent, so the page shows it is thinking without saying so twice.
 */
export function VibesComposer({ text, onChange, model, modelId, chosenByAuto = false, modelHint, onModel, onAdd, attachments, onRemoveAttachment, notice, effort, mentions,
  trialRemaining, maximum, busy, disabled, blocked, onSend, onStop, accessory, addControl, placeholder, inputLabel, modelPicker, modelControl, teammate = false, quietGeneration = false, maxLength = 4000, knownMentions }: {
  teammate?: boolean; knownMentions?: string[];
  /** The transcript owns generation feedback for computer conversations. */
  quietGeneration?: boolean;
  modelControl?: ReactNode;
  modelPicker?: ReactNode;
  accessory?: ReactNode; addControl?: ReactNode; placeholder?: string; inputLabel?: string; maxLength?: number;
  text: string; onChange(value: string): void; model: string; onModel(): void;
  /** Whose mark stands beside the name: the model in use, or none while Auto has yet to pick. */
  modelId?: string | null;
  /** Auto chose `model` for this draft; its mark wears Auto's sparkle so the choice reads as not the person's. */
  chosenByAuto?: boolean;
  /** Opens the attach menu above the + it measured. */
  onAdd(anchor: Anchor): void; attachments: Attached[]; onRemoveAttachment(key: string): void;
  /** Something the screen needs said under the box, such as why an attachment failed. */
  notice?: string | null;
  // The integrations this account has connected. Typing `@` offers them.
  mentions?: Integration[];
  // Why Auto chose what it chose, spoken rather than drawn: the toolbar has no room.
  modelHint?: string;
  effort?: ComposerEffort;
  trialRemaining?: number; maximum?: number;
  busy: boolean; disabled: boolean; onSend(): void; onStop(): void;
  /** Why the arrow is grey. A tap on it says so under the box rather than doing nothing. */
  blocked?: string | null;
}) {
  const { colors, dark } = useTheme();
  const glass = useGlass();
  const reduced = useReducedMotion();
  const breath = useBreath(busy && !reduced && !quietGeneration, 2200);
  // The caret is only known once the field reports it; the end of the text is the
  // fallback, which is right for typing at the end, where a mention is written.
  const [caret, setCaret] = useState<number | null>(null);
  // Where the caret is put back to after an insertion, and only then.
  const [placed, setPlaced] = useState<number | null>(null);
  // The effort panel takes the whole box while it is being set, at no less than the
  // box's own height, so opening it does not make the chat above it jump.
  const [tuning, setTuning] = useState(false);
  useEffect(() => { if (effort?.open) setTuning(true); }, [effort?.open]);
  const [height, setHeight] = useState(0);
  // Something voice input needs to say: why it cannot start, or why it stopped.
  const [note, setNote] = useState<string | null>(null);
  const plus = useRef<View>(null);
  const input = useRef<TextInput>(null);
  const panelOpen = Boolean(modelPicker) || tuning;
  const { capture: capturePanelFocus, prepare: preparePanel } = useComposerPanelFocus(input, panelOpen);
  const openModel = () => { preparePanel(); animate(); setTuning(false); onModel(); };
  const at = caret !== null && caret <= text.length ? caret : text.length;
  const partial = mentions?.length ? activeMention(text, at) : null;
  const suggestions = partial ? mentions!.filter(integration => integration.id.startsWith(partial.query)) : [];
  const choose = (id: string) => {
    if (!partial) return;
    const next = applyMention(text, partial.start, at, id);
    onChange(next.text); setCaret(next.caret); setPlaced(next.caret); input.current?.focus();
  };
  const animate = () => { if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity')); };
  const steerable = Boolean(effort && (effort.automatic || effort.ladder.length > 1));
  const rungs = effort?.automatic ? canonical : effort?.ladder ?? [];
  const held = effort?.value ? rungs.indexOf(effort.value) : -1;
  const add = () => plus.current?.measureInWindow((x, y, width, height) => onAdd({ x, y, width, height }));
  const idle = !busy && disabled;
  const refuse = () => { refused(); setNote(blocked ?? 'This message cannot be sent yet.'); };
  return <View style={[s.wrap, { backgroundColor: colors.background }]}>
    {accessory}
    {!panelOpen && <MentionBar integrations={suggestions} onChoose={choose} />}
    <ComposerSurface matte={teammate} onLayout={event => { if (!panelOpen) setHeight(event.nativeEvent.layout.height); }}
      style={[s.box, teammate && { borderRadius:14, borderWidth:StyleSheet.hairlineWidth, borderColor:colors.border, backgroundColor:colors.rail, paddingVertical:6 }, tuning && !modelPicker && { minHeight: Math.max(height, 156) }]}>
      {/* The rim, lit from above; and the accent it takes on while a reply is being written. */}
      {!teammate && <View pointerEvents="none" style={[s.shine, { backgroundColor: glass.shine }]} />}
      {busy && !quietGeneration && !teammate && <Animated.View pointerEvents="none" style={[s.glow, { borderColor: colors.accent, shadowColor: colors.accent,
        opacity: reduced ? 0.45 : breath.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }) }]} />}
      {modelPicker ?? (tuning && effort ? <EffortSlider ladder={effort.ladder} value={effort.value} onChange={effort.onChange} automatic={effort.automatic}
        onClose={() => { effort.onCommit?.(); effort.onClose?.(); animate(); setTuning(false); }}
        onChooseModel={openModel} /> : null)}
      <View style={panelOpen && { display: 'none' }} accessibilityElementsHidden={panelOpen} importantForAccessibility={panelOpen ? 'no-hide-descendants' : 'auto'}>
      <AttachmentTray items={attachments} onRemove={onRemoveAttachment} />
      <MentionInput ref={input} known={knownMentions ?? mentions?.map(x => x.id) ?? []} accessibilityLabel={inputLabel ?? 'Message Vibyra AI'} multiline value={text} maxLength={maxLength}
        onChangeText={next => { onChange(next); setCaret(null); setPlaced(null); setNote(null); }}
        placeholder={placeholder ?? 'What would you like to build?'} placeholderTextColor={colors.muted} keyboardAppearance={dark ? 'dark' : 'light'}
        onSelectionChange={event => { setCaret(event.nativeEvent.selection.end); setPlaced(null); }}
        selection={placed === null ? undefined : { start: placed, end: placed }}
        style={[s.input, teammate && {minHeight:34,fontSize:14,lineHeight:20,fontFamily:'DM Sans'}, { color: colors.text }]} textAlignVertical="top" />
      <View style={s.toolbar}>
        {addControl ?? <Pressable ref={plus} accessibilityRole="button" accessibilityLabel="Add to chat" onPress={add} hitSlop={6}
          style={({ pressed }) => [s.round, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="add" size={21} />
        </Pressable>}
        {/* Model and effort share one quiet toolbar, without nested filled controls. */}
        {modelControl ?? <View style={s.pill}>
          <Pressable accessibilityRole="button" accessibilityLabel={modelHint ? `Choose AI model, currently ${model}${chosenByAuto ? ', chosen by Auto' : ''}. ${modelHint}` : 'Choose AI model'}
            onPointerDown={Platform.OS === 'web' ? capturePanelFocus : undefined} onPressIn={Platform.OS !== 'web' ? capturePanelFocus : undefined}
            onPress={openModel} style={({ pressed }) => [s.model, { opacity: pressed ? 0.6 : 1 }]}>
            <View>
              {modelId ? <BrandLogo vendor={vendorOf(modelId)} size={20} bare />
                : <View style={[s.autoMark, { backgroundColor: colors.accentSoft }]}><Icon name="sparkles" size={12} color={colors.accent} /></View>}
              {chosenByAuto && modelId && <View style={[s.badge, { backgroundColor: colors.accent, borderColor: glass.surface }]}>
                <Icon name="sparkles" size={7} color={colors.onAction} /></View>}
            </View>
            <Text numberOfLines={1} style={[s.modelName, { color: colors.text }]}>{model}</Text>
            <Icon name="chevron-down" size={11} color={colors.muted} />
          </Pressable>
          {steerable && <><View style={[s.divider, { backgroundColor: glass.rim }]} />
            <EffortChip label={held >= 0 ? effortChoice(rungs[held]!).label : 'Auto'} open={tuning}
            onPressIn={capturePanelFocus}
            level={held >= 0 ? (held + 0.5) / rungs.length : 0} automatic={effort!.automatic} onPress={() => { preparePanel(); animate(); setTuning(true); }} />
            </>}
        </View>}
        <View style={s.space} />
        <DictationButton text={text} onChange={onChange} onNote={setNote} />
        {/* A grey arrow declines the touch, so the ring around it takes the tap and says why. */}
        <Pressable accessible={false} focusable={false} tabIndex={-1} onPress={idle ? refuse : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Stop AI reply' : 'Send message'} disabled={idle}
          accessibilityState={{ disabled: idle }} onPress={busy ? onStop : onSend}
          style={({ pressed }) => [s.send, quietGeneration && s.computerSend, { backgroundColor: idle ? 'transparent' : colors.action, opacity: pressed ? 0.75 : 1 }]}>
          <Icon name={busy ? 'stop' : 'arrow-up'} size={busy ? 18 : 21} color={idle ? colors.muted : colors.onAction} />
        </Pressable></Pressable>
      </View></View>
    </ComposerSurface>
    <View style={s.estimate}>
      <Text accessibilityLiveRegion={note || notice ? 'polite' : 'none'} style={[s.caption, { color: colors.muted }]}>{note ?? notice ?? (busy && !quietGeneration
        ? 'Your next draft can wait here.' : maximum !== undefined ? 'This reply uses up to ' + vibes(maximum) : trialRemaining !== undefined
          ? `${trialRemaining} trial ${vibeWord(trialRemaining)} left in this chat` : '')}</Text></View>
  </View>;
}
const RADIUS = 28;
const s = StyleSheet.create({ wrap: { paddingHorizontal: 12, paddingTop: 6 },
  box: { width: '100%', maxWidth: 600, alignSelf: 'center', borderRadius: RADIUS, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 10 },
  shine: { position: 'absolute', top: 0, left: RADIUS, right: RADIUS, height: StyleSheet.hairlineWidth * 2 },
  glow: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: RADIUS + 1, borderWidth: 1,
    shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  input: { fontSize: 17, lineHeight: 24, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4, minHeight: 62, maxHeight: 150, outlineWidth: 0 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  round: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', height: 34, borderRadius: 17, flexShrink: 1, minWidth: 0 },
  model: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingLeft: 6, paddingRight: 6, flexShrink: 1, minWidth: 0 },
  divider: { width: StyleSheet.hairlineWidth, height: 16 },
  modelName: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, flexShrink: 1 },
  autoMark: { width: 20, height: 20, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -4, bottom: -4, width: 13, height: 13, borderRadius: 6.5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center' },
  space: { flex: 1 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  computerSend: { width: 44, height: 44, borderRadius: 22 },
  estimate: { minHeight: 26, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  caption: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
