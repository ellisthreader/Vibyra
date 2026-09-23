import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { MentionInput } from '../integrations/MentionInput';
import { MentionBar } from '../integrations/MentionBar';
import { activeMention, applyMention } from '../integrations/mentions';
import { useBreath } from '../ui/motion';
import { useReducedMotion } from '../ui/useReducedMotion';
import { AttachmentTray } from './AttachmentTray';
import type { ComposerProps } from './composerContracts';
import { EffortSlider } from './EffortSlider';
import { useGlass } from './glass';
import { ComposerSurface } from './ComposerSurface';
import { ComposerToolbar } from './ComposerToolbar';
import { ComposerCaption } from './ComposerCaption';
import { composerStyles as s } from './composerStyles';
import { useComposerPanelFocus } from './useComposerPanelFocus';

/** Shared message box with separate contracts for text, model, files and sending. */
export function VibesComposer({
  input: draft,
  model: choice,
  attachments: files,
  submission,
  teammate = false,
  accessory,
}: ComposerProps) {
  const {
    text,
    onChange,
    placeholder,
    label: inputLabel,
    maxLength = 4000,
    mentions,
    knownMentions,
  } = draft;
  const { onOpen: onModel, effort, picker: modelPicker } = choice;
  const { items: attachments, onRemove: onRemoveAttachment, notice } = files;
  const { busy, quietGeneration = false } = submission;
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
  useEffect(() => {
    if (effort?.open) setTuning(true);
  }, [effort?.open]);
  const [height, setHeight] = useState(0);
  // Something voice input needs to say: why it cannot start, or why it stopped.
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const panelOpen = Boolean(modelPicker) || tuning;
  const { capture: capturePanelFocus, prepare: preparePanel } = useComposerPanelFocus(
    input,
    panelOpen,
  );
  const openModel = () => {
    preparePanel();
    animate();
    setTuning(false);
    onModel();
  };
  const at = caret !== null && caret <= text.length ? caret : text.length;
  const partial = mentions?.length ? activeMention(text, at) : null;
  const suggestions = partial
    ? mentions!.filter((integration) => integration.id.startsWith(partial.query))
    : [];
  const choose = (id: string) => {
    if (!partial) return;
    const next = applyMention(text, partial.start, at, id);
    onChange(next.text);
    setCaret(next.caret);
    setPlaced(next.caret);
    input.current?.focus();
  };
  const animate = () => {
    if (!reduced)
      LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
  };
  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      {accessory}
      {!panelOpen && <MentionBar integrations={suggestions} onChoose={choose} />}
      <ComposerSurface
        matte={teammate}
        onLayout={(event) => {
          if (!panelOpen) setHeight(event.nativeEvent.layout.height);
        }}
        style={[
          s.box,
          teammate && {
            borderRadius: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            backgroundColor: colors.rail,
            paddingVertical: 6,
          },
          tuning && !modelPicker && { minHeight: Math.max(height, 156) },
        ]}
      >
        {/* The rim, lit from above; and the accent it takes on while a reply is being written. */}
        {!teammate && (
          <View pointerEvents="none" style={[s.shine, { backgroundColor: glass.shine }]} />
        )}
        {busy && !quietGeneration && !teammate && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.glow,
              {
                borderColor: colors.accent,
                shadowColor: colors.accent,
                opacity: reduced
                  ? 0.45
                  : breath.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }),
              },
            ]}
          />
        )}
        {modelPicker ??
          (tuning && effort ? (
            <EffortSlider
              ladder={effort.ladder}
              value={effort.value}
              onChange={effort.onChange}
              automatic={effort.automatic}
              onClose={() => {
                effort.onCommit?.();
                effort.onClose?.();
                animate();
                setTuning(false);
              }}
              onChooseModel={openModel}
            />
          ) : null)}
        <View
          style={panelOpen && { display: 'none' }}
          accessibilityElementsHidden={panelOpen}
          importantForAccessibility={panelOpen ? 'no-hide-descendants' : 'auto'}
        >
          <AttachmentTray items={attachments} onRemove={onRemoveAttachment} />
          <MentionInput
            ref={input}
            known={knownMentions ?? mentions?.map((x) => x.id) ?? []}
            accessibilityLabel={inputLabel ?? 'Message Vibyra AI'}
            multiline
            value={text}
            maxLength={maxLength}
            onChangeText={(next) => {
              onChange(next);
              setCaret(null);
              setPlaced(null);
              setNote(null);
            }}
            placeholder={placeholder ?? 'What would you like to build?'}
            placeholderTextColor={colors.muted}
            keyboardAppearance={dark ? 'dark' : 'light'}
            onSelectionChange={(event) => {
              setCaret(event.nativeEvent.selection.end);
              setPlaced(null);
            }}
            selection={placed === null ? undefined : { start: placed, end: placed }}
            style={[
              s.input,
              teammate && { minHeight: 34, fontSize: 15, lineHeight: 21 },
              { color: colors.text },
            ]}
            textAlignVertical="top"
          />
          <ComposerToolbar
            input={draft}
            model={choice}
            attachments={files}
            submission={submission}
            tuning={tuning}
            capturePanelFocus={capturePanelFocus}
            openModel={openModel}
            openEffort={() => {
              preparePanel();
              animate();
              setTuning(true);
            }}
            onNote={setNote}
          />
        </View>
      </ComposerSurface>
      <ComposerCaption note={note} notice={notice} submission={submission} />
    </View>
  );
}
