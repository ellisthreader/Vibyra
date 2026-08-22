// The single SVG factory behind every Vibyra glyph: a 24-unit grid, 2px round
// strokes, `currentColor`, no fill. Extracted out of `Icons.tsx` so a second
// icon sheet can inherit the identical style without pushing that file past
// the 200-line limit.
import type { ReactNode } from "react";

interface IconProps {
  size?: number;
}

export function icon(path: ReactNode) {
  return function Icon({ size = 16 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}
