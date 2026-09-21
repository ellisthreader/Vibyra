import { useEffect, useRef, type RefObject } from 'react';
import { Keyboard, type TextInput } from 'react-native';

/** Return to typing only when the picker was opened while typing. */
export function useComposerPanelFocus(input: RefObject<TextInput | null>, open: boolean) {
  const restore = useRef(false);
  useEffect(() => {
    if (open || !restore.current) return;
    const timer = setTimeout(() => { restore.current = false; input.current?.focus(); }, 240);
    return () => clearTimeout(timer);
  }, [open, input]);
  const capture = () => { restore.current = Boolean(input.current?.isFocused()); };
  return { capture, prepare: () => { restore.current ||= Boolean(input.current?.isFocused()); Keyboard.dismiss(); } };
}
