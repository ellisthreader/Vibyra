import type { ComponentType } from "react";

import type { PaletteRange, PaletteScope } from "./paletteQuery";

/** Which scope prefix keeps an entry. `command` is everything the app can do. */
export type PaletteKind = "attention" | "session" | "project" | "command";

export interface CommandPaletteEntry {
  id: string;
  kind: PaletteKind;
  /** Heading this sits under while nothing is typed. */
  group: string;
  label: string;
  /** Right-aligned shortcut or status. */
  hint?: string;
  /** A second line — the command an agent wants to run, a model, a path. */
  detail?: string;
  /** Sets the detail line in mono. For literal text — a command, a path. */
  code?: boolean;
  /** Searchable words that are not in the label. Never highlighted. */
  keywords?: string;
  accent?: string;
  /** Single-letter mark, used where a project or session has a colour. */
  mono?: string;
  icon?: ComponentType<{ size?: number }>;
  attention?: boolean;
  /** Closes, stops, kills — drawn in red so a fast Enter is a considered one. */
  danger?: boolean;
  /** Nudges an entry up the ranking. Reserved for things that are waiting. */
  weight?: number;
  run: () => void;
}

export interface RankedPaletteEntry extends CommandPaletteEntry {
  /** Slices of `label` the query matched, for highlighting. */
  ranges: PaletteRange[];
}

export interface PaletteResult {
  scope: PaletteScope;
  /** What was typed after the scope character. */
  text: string;
  entries: RankedPaletteEntry[];
  /**
   * Whether to draw group headings. Unfiltered, the curated order is the most
   * useful thing on screen; once a query ranks the rows, headings would break
   * the ranking into meaningless islands.
   */
  grouped: boolean;
}
