import type { ResolvedAgent } from "../agentTypes";
import type { PaneState } from "../state/terminalStoreTypes";

const KNOWN: Record<string, { name: string; initials: string }> = {
  codex: { name: "Codex", initials: "Cx" },
  claude: { name: "Claude Code", initials: "Cl" },
  gemini: { name: "Gemini", initials: "Ge" },
  shell: { name: "Shell", initials: "$" },
  ssh: { name: "SSH", initials: "$" },
};

/** The two-letter tile and the plain name every pane, row and card shows for
 * an agent: built-in names first, then the catalogue, then the id. */
export function agentIdentity(agentId: string | undefined, catalogue: ResolvedAgent[] = []): { name: string; initials: string } {
  const id = agentId || "shell";
  const known = KNOWN[id];
  const name = known?.name ?? catalogue.find((agent) => agent.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
  if (known) return { name, initials: known.initials };
  const letters = name.replace(/[^A-Za-z0-9]/g, "");
  return { name, initials: (letters.charAt(0).toUpperCase() + letters.charAt(1).toLowerCase()) || "·" };
}

export type PaneTone = "working" | "attention" | "running" | "quiet";

/** A terminal's state in one word and a tone, shared by pane headers, Home and
 * the sidebar so the same terminal never reads two ways. */
export function paneWord(pane: PaneState, activity: string | undefined): { word: string; tone: PaneTone } {
  if (pane.status === "suspended") return { word: "Saved", tone: "quiet" };
  if (pane.status === "exited") return { word: "Ended", tone: "quiet" };
  if (pane.visibility === "hibernated") return { word: "Paused", tone: "quiet" };
  if (activity === "attention") return { word: "Needs you", tone: "attention" };
  const shell = pane.agentId === "shell" || pane.agentId === "ssh";
  if (activity === "working") return shell ? { word: "Running", tone: "running" } : { word: "Working", tone: "working" };
  return { word: "Ready", tone: "quiet" };
}
