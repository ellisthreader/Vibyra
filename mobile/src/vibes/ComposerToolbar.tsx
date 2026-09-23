import { useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandLogo } from '../ui/BrandLogo';
import { vendorOf } from '../ui/brands';
import { effortChoice, efforts as canonical } from '../ui/effort';
import { refused } from '../ui/haptics';
import { Icon } from '../ui/primitives';
import type {
  ComposerAttachments,
  ComposerInput,
  ComposerModel,
  ComposerSubmission,
} from './composerContracts';
import { composerStyles as s } from './composerStyles';
import { DictationButton } from './DictationButton';
import { EffortChip } from './EffortChip';
import { useGlass } from './glass';

type Props = {
  input: ComposerInput;
  model: ComposerModel;
  attachments: ComposerAttachments;
  submission: ComposerSubmission;
  tuning: boolean;
  capturePanelFocus(): void;
  openModel(): void;
  openEffort(): void;
  onNote(message: string | null): void;
};

export function ComposerToolbar({
  input,
  model,
  attachments,
  submission,
  tuning,
  capturePanelFocus,
  openModel,
  openEffort,
  onNote,
}: Props) {
  const { colors } = useTheme();
  const glass = useGlass();
  const plus = useRef<View>(null);
  const effort = model.effort;
  const rungs = effort?.automatic ? canonical : (effort?.ladder ?? []);
  const held = effort?.value ? rungs.indexOf(effort.value) : -1;
  const steerable = Boolean(effort && (effort.automatic || effort.ladder.length > 1));
  const idle = !submission.busy && submission.disabled;
  const add = () =>
    plus.current?.measureInWindow((x, y, width, height) =>
      attachments.onAdd({ x, y, width, height }),
    );
  const refuse = () => {
    refused();
    onNote(submission.blocked ?? 'This message cannot be sent yet.');
  };

  return (
    <View style={s.toolbar}>
      {attachments.control ?? (
        <Pressable
          ref={plus}
          accessibilityRole="button"
          accessibilityLabel="Add to chat"
          onPress={add}
          hitSlop={6}
          style={({ pressed }) => [s.round, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="add" size={21} />
        </Pressable>
      )}
      {model.control ?? (
        <View style={s.pill}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              model.hint
                ? `Choose AI model, currently ${model.label}${model.chosenByAuto ? ', chosen by Auto' : ''}. ${model.hint}`
                : 'Choose AI model'
            }
            onPointerDown={Platform.OS === 'web' ? capturePanelFocus : undefined}
            onPressIn={Platform.OS !== 'web' ? capturePanelFocus : undefined}
            onPress={openModel}
            style={({ pressed }) => [s.model, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View>
              {model.id ? (
                <BrandLogo vendor={vendorOf(model.id)} size={20} bare />
              ) : (
                <View style={[s.autoMark, { backgroundColor: colors.accentSoft }]}>
                  <Icon name="sparkles" size={12} color={colors.accent} />
                </View>
              )}
              {model.chosenByAuto && model.id && (
                <View
                  style={[s.badge, { backgroundColor: colors.accent, borderColor: glass.surface }]}
                >
                  <Icon name="sparkles" size={7} color={colors.onAction} />
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={[s.modelName, { color: colors.text }]}>
              {model.label}
            </Text>
            <Icon name="chevron-down" size={11} color={colors.muted} />
          </Pressable>
          {steerable && (
            <>
              <View style={[s.divider, { backgroundColor: glass.rim }]} />
              <EffortChip
                label={held >= 0 ? effortChoice(rungs[held]!).label : 'Auto'}
                open={tuning}
                onPressIn={capturePanelFocus}
                level={held >= 0 ? (held + 0.5) / rungs.length : 0}
                automatic={effort!.automatic}
                onPress={openEffort}
              />
            </>
          )}
        </View>
      )}
      <View style={s.space} />
      <DictationButton
        text={input.text}
        onChange={input.onChange}
        onNote={onNote}
        disabled={submission.voiceDisabled}
      />
      {/* The outer touch explains why a disabled send cannot proceed. */}
      <Pressable
        accessible={false}
        focusable={false}
        tabIndex={-1}
        onPress={idle ? refuse : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submission.busy ? 'Stop AI reply' : 'Send message'}
          disabled={idle}
          accessibilityState={{ disabled: idle }}
          onPress={submission.busy ? submission.onStop : submission.onSend}
          style={({ pressed }) => [
            s.send,
            submission.quietGeneration && s.computerSend,
            { backgroundColor: idle ? 'transparent' : colors.action, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Icon
            name={submission.busy ? 'stop' : 'arrow-up'}
            size={submission.busy ? 18 : 21}
            color={idle ? colors.muted : colors.onAction}
          />
        </Pressable>
      </Pressable>
    </View>
  );
}
