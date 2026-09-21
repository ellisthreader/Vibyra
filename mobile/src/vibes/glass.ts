import { StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * The chat page's one material. Everything that sits on the page rather than in
 * it — the composer, a sent message, the effort panel — is a sheet of tinted
 * glass: a translucent surface, a hairline rim lit from above, and a soft shadow
 * that lifts it. Dark glass is lighter than the page, light glass is white, and
 * both read as the same object in the other theme.
 */
export interface Glass {
  surface: string; rim: string; shine: string; well: string; dot: string; knob: string;
  /** The rim and shadow together, ready to spread on a `View`. */
  sheet: ViewStyle;
}
export function useGlass(): Glass {
  const { dark } = useTheme();
  return dark ? darkGlass : lightGlass;
}
const shadow = (opacity: number): ViewStyle => ({
  shadowColor: '#000', shadowOpacity: opacity, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8,
});
const darkGlass: Glass = {
  surface: '#1A1D24', rim: 'rgba(255,255,255,0.11)', shine: 'rgba(255,255,255,0.10)',
  well: 'rgba(255,255,255,0.06)', dot: 'rgba(255,255,255,0.28)', knob: 'rgba(250,251,255,0.94)',
  sheet: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: '#1A1D24', ...shadow(0.42) },
};
const lightGlass: Glass = {
  surface: '#FFFFFF', rim: 'rgba(23,26,33,0.08)', shine: 'rgba(255,255,255,0.9)',
  well: 'rgba(23,26,33,0.045)', dot: 'rgba(23,26,33,0.2)', knob: '#FFFFFF',
  sheet: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(23,26,33,0.08)', backgroundColor: '#FFFFFF', ...shadow(0.10) },
};
