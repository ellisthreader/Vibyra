import type {
  TerminalCandidate,
  TerminalDecision,
} from "../vibes/terminalDecision";

/** Presentation follows observed work; it never drives requests or fabricates rankings. */
export type AutoSelectionProgress =
  | { phase: "checking" }
  | { phase: "selecting"; candidates: TerminalCandidate[] }
  | { phase: "starting" | "sending"; selection: TerminalDecision };

export function autoStatus(
  progress?: AutoSelectionProgress,
  failed = false,
): string {
  if (failed) return "Your message is ready when you are.";
  switch (progress?.phase) {
    case "checking":
      return "Checking available models…";
    case "selecting":
      return "Finding the right model…";
    case "starting":
      return "Starting your terminal…";
    case "sending":
      return "Sending your message…";
    default:
      return "The right model. The right effort.";
  }
}

export function autoEffort(effort: string | null): string {
  if (effort === null) return "No adjustable effort";
  if (effort === "none") return "Reasoning off";
  const name =
    ({ xhigh: "Extra high", max: "Maximum" } as Record<string, string>)[
      effort
    ] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
  return `${name} effort`;
}
