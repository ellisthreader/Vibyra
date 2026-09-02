import { icon } from "../../common/iconFactory";
import type { ProjectKind } from "../../../lib/projectTemplateTypes";

// One glyph per kind, on the same 24-unit grid as every other Vibyra icon.
// Nine small drawings rather than nine letters: the kind step is the first
// thing the dialog shows, and a wall of monograms reads as a list, not a menu.

const Website = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M7 6.5h.01M9.5 6.5h.01" />
  </>,
);

const WebApp = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 13h8M8 16.5h5" />
  </>,
);

const Mobile = icon(
  <>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </>,
);

const Desktop = icon(
  <>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M8 20.5h8M12 16.5v4" />
  </>,
);

const Game = icon(
  <>
    <path d="M7.5 8h9a5 5 0 0 1 4.4 7.4l-.7 1.3a2.4 2.4 0 0 1-4-.4L15 15H9l-1.2 1.3a2.4 2.4 0 0 1-4 .4l-.7-1.3A5 5 0 0 1 7.5 8z" />
    <path d="M7 11.5h2M8 10.5v2M15.5 11.5h.01" />
  </>,
);

const Backend = icon(
  <>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </>,
);

const Library = icon(
  <>
    <path d="m8 8-4 4 4 4M16 8l4 4-4 4" />
    <path d="m13.5 5-3 14" />
  </>,
);

const Ai = icon(
  <>
    <path d="M12 3.5 13.7 9l5.3 1.8-5.3 1.8L12 18l-1.7-5.4L5 10.8 10.3 9z" />
    <path d="M18.5 16.5 19 18l1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
  </>,
);

const Empty = icon(
  <>
    <path d="M4 6a2 2 0 0 1 2-2h3l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
    <path d="M12 11v5M9.5 13.5h5" />
  </>,
);

const GLYPHS: Record<ProjectKind, ReturnType<typeof icon>> = {
  website: Website,
  webapp: WebApp,
  mobile: Mobile,
  desktop: Desktop,
  game: Game,
  backend: Backend,
  library: Library,
  ai: Ai,
  empty: Empty,
};

export function ProjectKindIcon({ kind, size = 18 }: { kind: ProjectKind; size?: number }) {
  const Glyph = GLYPHS[kind];
  return <Glyph size={size} />;
}
