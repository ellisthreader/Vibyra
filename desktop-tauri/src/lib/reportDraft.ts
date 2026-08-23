// The shape of a report while it is being written, and the rules for when it
// is worth sending. Kept free of React and IPC so the rules can be tested
// directly — a report the user cannot send is a bug they never tell you about.

export type ReportKind = "bug" | "crash" | "visual" | "performance" | "idea" | "question";
export type ReportSeverity = "blocker" | "high" | "normal" | "low";

export interface ReportKindOption {
  id: ReportKind;
  label: string;
  blurb: string;
  /** Kinds where "how bad is it" is not a sensible question. */
  gradeless?: boolean;
}

export const REPORT_KINDS: ReportKindOption[] = [
  { id: "bug", label: "Something's broken", blurb: "It doesn't do what it should" },
  { id: "crash", label: "It crashed", blurb: "Vibyra or a terminal died" },
  { id: "visual", label: "Looks wrong", blurb: "Layout, spacing or colours" },
  { id: "performance", label: "Too slow", blurb: "Lag, freezing or high CPU" },
  { id: "idea", label: "I have an idea", blurb: "Something you'd like added", gradeless: true },
  { id: "question", label: "I'm stuck", blurb: "Something isn't clear", gradeless: true },
];

export const REPORT_SEVERITIES: { id: ReportSeverity; label: string; blurb: string }[] = [
  { id: "blocker", label: "Can't work", blurb: "Nothing else matters until it's fixed" },
  { id: "high", label: "Painful", blurb: "I hit it often and it costs me time" },
  { id: "normal", label: "Annoying", blurb: "Worth fixing, not urgent" },
  { id: "low", label: "Minor", blurb: "A papercut" },
];

/** Where in the app. Ordered by how often each is the answer. */
export const REPORT_AREAS = [
  "Terminal pane",
  "AI companion",
  "File tree",
  "Preview",
  "Home screen",
  "Settings",
  "Screenshots",
  "Notifications",
  "Sign in / account",
  "Updates",
  "Somewhere else",
] as const;

/**
 * Which part of the app is on screen. Checked most-specific first: a modal is
 * what the user is looking at even though a project is open behind it.
 */
export function areaFor(state: {
  settingsOpen: boolean;
  companionOpen: boolean;
  projectMode: string;
  view: string;
  hasPane: boolean;
}): string {
  if (state.settingsOpen) return "Settings";
  if (state.view !== "project") return "Home screen";
  if (state.projectMode === "preview") return "Preview";
  if (state.hasPane) return "Terminal pane";
  if (state.companionOpen) return "AI companion";
  return "Somewhere else";
}

export interface ReportDraft {
  kind: ReportKind;
  severity: ReportSeverity;
  area: string;
  summary: string;
  details: string;
  steps: string;
  expected: string;
  contact: string;
  /** PNG data URL from the screenshot editor. */
  screenshot: string | null;
  /** Files the reporter attached or pasted, as paths on their own disk. */
  images: string[];
  /** Whether the focused pane's output rides along. */
  includeTerminal: boolean;
}

const MAX_SUMMARY = 300;
const MAX_BODY = 8_000;
/** Matches `report_image::MAX_IMAGES`; the dialog stops offering the button
 * at this point rather than letting the send fail. */
export const MAX_IMAGES = 4;

export function emptyDraft(area: string, contact = ""): ReportDraft {
  return {
    kind: "bug",
    severity: "normal",
    area,
    summary: "",
    details: "",
    steps: "",
    expected: "",
    contact,
    screenshot: null,
    images: [],
    // On by default when there is a pane to read: the terminal is where the
    // evidence usually is, and a user who does not want to send it can see the
    // toggle right next to the thing it describes.
    includeTerminal: true,
  };
}

/**
 * What still stands between this draft and being sendable, phrased as the next
 * thing to do rather than as an error. Null when it is ready.
 */
export function draftBlocker(draft: ReportDraft): string | null {
  if (!draft.summary.trim()) return "Add a short title";
  if (!draft.details.trim()) return "Describe what happened";
  if (draft.summary.length > MAX_SUMMARY) return "The summary is too long for one line";
  if (draft.images.length > MAX_IMAGES) return `Attach at most ${MAX_IMAGES} images`;
  if (
    draft.details.length > MAX_BODY ||
    draft.steps.length > MAX_BODY ||
    draft.expected.length > MAX_BODY
  ) {
    return "That is more text than one report can carry";
  }
  return null;
}

export function canSubmit(draft: ReportDraft): boolean {
  return draftBlocker(draft) === null;
}

/** Severity is meaningless on an idea or a question — those send as "normal". */
export function gradable(kind: ReportKind): boolean {
  return !REPORT_KINDS.find((option) => option.id === kind)?.gradeless;
}

/** What the user is really being asked for, per kind. Generic labels make a
 * form feel like paperwork; these make it feel like a conversation. */
export function detailsLabel(kind: ReportKind): string {
  if (kind === "idea") return "What would you like Vibyra to do?";
  if (kind === "question") return "What are you trying to do?";
  if (kind === "crash") return "What were you doing when it died?";
  return "What happened?";
}
