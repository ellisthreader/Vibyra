import { create } from "zustand";

/** One pending Run, held while the confirm sheet is up. There is deliberately
 *  no "don't ask again": a remember-me on a gate whose input is written by a
 *  language model defeats the gate. */
export interface PendingRun {
  /** Every line exactly as it will be typed, so the sheet can show all of them. */
  lines: string[];
  /** Short plain sentences from `classifyDanger`, rendered in `--danger`. */
  reasons: string[];
  /** Where it will run: "In Studio · ~/Projects/Studio · Terminal 2". */
  destination: string;
  /** Write it. Clears this record itself, so the sheet stays a dumb surface. */
  confirm: () => void;
  /** Dismiss without writing — the backdrop, Escape and Cancel all land here. */
  cancel: () => void;
}

interface RunConfirmStore {
  pending: PendingRun | null;
  request: (pending: PendingRun) => void;
  clear: () => void;
}

export const useRunConfirmStore = create<RunConfirmStore>((set) => ({
  pending: null,
  request: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
