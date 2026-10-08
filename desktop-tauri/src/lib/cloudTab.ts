import { CONNECT_ERRORS } from "./cloudCopy";

/** The project the Connect flow pre-ticks: the one open now, else the first. Nothing else starts ticked. */
export function defaultPick(projects: { id: string }[], activeProjectId: string | null | undefined): string | null {
  return projects.find((p) => p.id === activeProjectId)?.id ?? projects[0]?.id ?? null;
}

/** The shelf order: the open project first, the rest in the Mac's own order, so the ticked card is always in view. */
export function recentFirst<P extends { id: string }>(projects: P[], activeProjectId: string | null | undefined): P[] {
  const at = projects.findIndex((p) => p.id === activeProjectId);
  return at <= 0 ? projects : [projects[at], ...projects.slice(0, at), ...projects.slice(at + 1)];
}

/** A refused Connect, in words: the server's own sentence, or the phone's words for a bare code. */
export function connectError(cause: unknown): string {
  const raw = String(cause instanceof Error ? cause.message : cause ?? "").replace(/^Error:\s*/, "").trim();
  const code = Object.keys(CONNECT_ERRORS).find((key) => raw === key || raw.includes(key));
  return code ? CONNECT_ERRORS[code] : raw || "Couldn’t connect to Vibyra Cloud. Try again.";
}
