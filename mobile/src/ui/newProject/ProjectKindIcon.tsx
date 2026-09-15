import { Icon, type IconName } from '../primitives';
import type { ProjectKind } from '../../scaffold/types';

// One glyph per kind, from the app's own icon set. Nine small drawings rather
// than nine letters: the kind step is the first thing the sheet shows, and a
// wall of monograms reads as a list, not a menu.
const GLYPHS: Record<ProjectKind, IconName> = {
  website: 'globe-outline',
  webapp: 'browsers-outline',
  mobile: 'phone-portrait-outline',
  desktop: 'desktop-outline',
  game: 'game-controller-outline',
  backend: 'server-outline',
  library: 'code-slash-outline',
  ai: 'sparkles-outline',
  empty: 'folder-outline',
};

export function ProjectKindIcon({ kind, size = 18, color }: { kind: ProjectKind; size?: number; color?: string }) {
  return <Icon name={GLYPHS[kind]} size={size} color={color} />;
}
