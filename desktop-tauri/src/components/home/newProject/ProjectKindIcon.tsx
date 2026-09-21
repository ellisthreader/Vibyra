import type { ProjectKind } from '../../../lib/projectTemplateTypes';
import { KIND_ART } from './projectKindArt';

/**
 * One mark per kind, from the wizard's own drawings rather than the app's
 * general icon set. The kind step is nine marks side by side and nothing else,
 * so they have to read as a family: the same stroke, the same optical weight,
 * the same level of detail. Nine picks from a general-purpose set never do —
 * each was drawn for a different context.
 *
 * One weight at every size: the mark is geometry on a 24-grid, so the stroke
 * belongs to the drawing rather than to the box it is drawn in. The phone
 * renders the same paths through `react-native-svg`.
 */
export function ProjectKindIcon({ kind, size = 26 }: { kind: ProjectKind; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {KIND_ART[kind].map(d => <path key={d} d={d} />)}
  </svg>;
}
