import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { dictation, type Listening } from './dictation';
import { appendWords } from './appendWords';

/**
 * Talk instead of typing. Tapping starts Apple's recogniser, and what it hears is
 * written into the message as it goes, after anything already typed; tapping again
 * stops it. A ring breathes around the button only while it is listening.
 */
export function DictationButton({
  text,
  onChange,
  onNote,
  disabled,
}: {
  text: string;
  onChange(value: string): void;
  onNote(message: string | null): void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const session = useRef<Listening | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const cancel = useCallback(() => {
    attempt.current?.abort();
    attempt.current = null;
    session.current?.cancel();
    session.current = null;
    setStarting(false);
    setListening(false);
  }, []);
  useEffect(
    () => () => {
      attempt.current?.abort();
      session.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background') cancel();
    });
    return () => listener.remove();
  }, [cancel]);
  useEffect(() => {
    if (!listening || reduced) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, reduced, pulse]);

  const start = async () => {
    if (attempt.current || disabled) return;
    const controller = new AbortController();
    attempt.current = controller;
    setStarting(true);
    onNote(null);
    const base = text;
    let ended = false;
    try {
      const opened = await dictation.start((update) => {
        if (controller.signal.aborted) return;
        if (update.type === 'transcript') onChange(appendWords(base, update.text));
        else if (update.type === 'error') onNote(update.message);
        else {
          ended = true;
          session.current = null;
          setListening(false);
        }
      }, controller.signal);
      if (controller.signal.aborted || ended) {
        opened.cancel();
        return;
      }
      session.current = opened;
      setListening(true);
    } catch (error) {
      if (!controller.signal.aborted)
        onNote(error instanceof Error ? error.message : 'Voice input could not start.');
    } finally {
      if (attempt.current === controller) {
        attempt.current = null;
        setStarting(false);
      }
    }
  };
  // Where voice input cannot run, starting says why in the runtime's own words.
  const press = () => {
    if (starting) cancel();
    else if (listening) session.current?.stop();
    else void start();
  };
  // Bare like every icon on the chat page. Only while listening does it fill, the
  // way send is filled, because a microphone that is on should never be missed.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        starting ? 'Cancel voice input' : listening ? 'Stop voice input' : 'Speak your message'
      }
      accessibilityState={{ disabled: disabled && !listening, selected: listening }}
      disabled={disabled && !listening}
      hitSlop={{ left: 6, right: 6, top: 6, bottom: 6 }}
      onPress={press}
      style={({ pressed }) => [
        s.tool,
        { opacity: pressed ? 0.6 : disabled && !listening ? 0.35 : 1 },
      ]}
    >
      {listening && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.ring,
            {
              borderColor: colors.accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) },
              ],
            },
          ]}
        />
      )}
      <View style={[s.face, listening && { backgroundColor: colors.action }]}>
        <Icon
          name={listening || starting ? 'stop' : 'mic-outline'}
          size={listening || starting ? 14 : 21}
          color={listening ? colors.onAction : colors.text}
        />
      </View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  tool: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  face: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
});
