import { useCallback, useRef, useState, type RefObject } from 'react';
import type { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** `AppHeader`'s `minHeight`. Kept here so the offset below cannot drift. */
export const APP_HEADER_HEIGHT = 64;

/**
 * How far a screen under the app header sits from the top of the window.
 *
 * `KeyboardAvoidingView` measures its own frame against its *parent*, then
 * subtracts a keyboard position given in *window* coordinates. Every screen
 * below the header starts at `top inset + header`, so without telling it that
 * distance it under-pads by exactly that much: on a 390x844 phone it applied
 * 191pt where 302 was needed, and the composer plus the whole key row — 102pt
 * of it — finished up behind the keyboard.
 *
 * A screen presented as its own full-height modal has no header above it and
 * must pass nothing at all.
 */
export function useKeyboardOffset() {
  return useSafeAreaInsets().top + APP_HEADER_HEIGHT;
}

/**
 * The same distance for a surface whose top nobody can add up: a page sheet
 * starts some way down the window, and the avoiding view inside it lifted its
 * content short by exactly that much — enough to leave a form's button behind
 * the keyboard's own row of suggestions. Put `frame` and `onLayout` on the
 * surface's outermost view; `offset` is where that view was measured to start.
 */
export function useMeasuredKeyboardOffset() {
  const frame = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  const onLayout = useCallback(() => {
    frame.current?.measureInWindow((_x, y) => { if (Number.isFinite(y) && y >= 0) setOffset(Math.round(y)); });
  }, []);
  return { frame, onLayout, offset };
}

/**
 * Brings the foot of a form up once the keyboard has finished arriving. iOS
 * scrolls the focused field into view and nothing else, so the button under a
 * form's last field stayed behind the keyboard's row of suggestions.
 */
export function revealFormEnd(scroll: RefObject<ScrollView | null>) {
  setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 280);
}
