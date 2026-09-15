import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import type { ProjectKind } from '../../scaffold/types';
import { KIND_ART } from './projectKindArt';

/**
 * One mark per kind, from the wizard's own drawings rather than the app's
 * general icon set. The kind step is nine marks side by side and nothing else,
 * so they have to read as a family: the same stroke, the same optical weight,
 * the same level of detail. Nine picks from a general-purpose set never do —
 * each was drawn for a different context.
 *
 * One weight at every size: the mark is geometry on a 24-grid, so the stroke
 * belongs to the drawing rather than to the box it is drawn in.
 */
export function ProjectKindIcon({ kind, size = 26, color }: { kind: ProjectKind; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color ?? colors.text} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {KIND_ART[kind].map(d => <Path key={d} d={d} />)}
  </Svg>;
}
