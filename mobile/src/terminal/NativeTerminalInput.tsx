import { useEffect, useRef, useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { INPUT_ANCHOR, nativeInputDelta } from './nativeInput';
import { useTheme } from '../theme';

interface Props {
  disabled: boolean;
  request: number;
  onInput(data: string): void;
  onFocusChange(focused: boolean): void;
}

/** Native first-responder: no WKWebView hidden-textarea focus heuristics. */
export function NativeTerminalInput({ disabled, request, onInput, onFocusChange }: Props) {
  const { dark } = useTheme();
  const input = useRef<TextInput>(null);
  const previous = useRef(INPUT_ANCHOR);
  const [value, setValue] = useState(INPUT_ANCHOR);
  const handled = useRef(0);
  const reset = () => {
    previous.current = INPUT_ANCHOR;
    setValue(INPUT_ANCHOR);
  };
  useEffect(() => {
    if (disabled) {
      input.current?.blur();
      return;
    }
    if (!request || request === handled.current) return;
    handled.current = request;
    if (input.current?.isFocused()) input.current.blur();
    else input.current?.focus();
  }, [disabled, request]);
  return (
    <TextInput
      ref={input}
      value={value}
      editable={!disabled}
      style={styles.input}
      accessibilityLabel="Terminal keyboard"
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      keyboardType="default"
      keyboardAppearance={dark ? 'dark' : 'light'}
      autoComplete="off"
      returnKeyType="send"
      submitBehavior="submit"
      caretHidden
      contextMenuHidden
      showSoftInputOnFocus
      onFocus={() => onFocusChange(true)}
      onBlur={() => {
        reset();
        onFocusChange(false);
      }}
      onChangeText={(next) => {
        if (disabled) return;
        const data = nativeInputDelta(previous.current, next);
        previous.current = next;
        setValue(next);
        if (data) onInput(data);
        if (!next || next.length > 2048) reset();
      }}
      onSubmitEditing={() => {
        if (!disabled) {
          onInput('\r');
          reset();
        }
      }}
    />
  );
}
const styles = StyleSheet.create({
  input: {
    position: 'absolute',
    left: 12,
    bottom: 0,
    width: 1,
    height: 1,
    opacity: 0.01,
    fontSize: 16,
    padding: 0,
  },
});
