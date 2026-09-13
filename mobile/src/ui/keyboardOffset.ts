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
