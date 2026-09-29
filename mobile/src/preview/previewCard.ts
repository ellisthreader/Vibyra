import type { ViewStyle } from 'react-native';
import type { Colors } from '../theme';

export const CARD_RADIUS = 18;
/** How a card reads: quiet, working (accent edge), running (green edge) or failed. */
export type CardTone = 'idle' | 'working' | 'ready' | 'failed';

/** One surface for every Preview card. The edge is the only thing that changes
 *  with state; light mode adds a soft lift, dark mode keeps it flat. */
export function cardStyle(colors: Colors, dark: boolean, tone: CardTone = 'idle'): ViewStyle {
  const edge = { idle: colors.border, working: colors.accent, ready: colors.success, failed: colors.error }[tone];
  return {
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    // Hex with a two-digit alpha keeps a state's edge soft; `idle` is the plain border.
    borderColor: tone === 'idle' ? edge : `${edge}66`,
    ...(dark ? null : { shadowColor: '#0E1220', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }),
  };
}
