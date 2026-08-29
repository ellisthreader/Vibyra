import type { AgentPlace, AgentProfile, PermissionMode } from "../../agentTypes";

/**
 * What this turn can reach, said before it runs.
 *
 * The composer is the last honest moment to tell someone what is about to
 * happen, so the folders and the access level are here rather than two panes
 * away in Settings. A chat with no teammate says so plainly — "detached" is
 * the promise Chat Mode makes, and it has to be visible for the promise to
 * mean anything.
 */
export function ComposerDisclosure({
  agent,
  places,
  permission,
}: {
  agent: AgentProfile | null;
  places: AgentPlace[] | undefined;
  permission: PermissionMode;
}) {
  if (!agent) {
    return (
      <p className="composer__reach composer__reach--detached">
        Detached — no project, no folder, no memory. Mount a folder from the chat menu to give
        this conversation something to read.
      </p>
    );
  }

  const granted = places ?? [];
  const writable = granted.filter((place) => place.access === "readWrite").length;
  const reach =
    granted.length === 0
      ? "no folders yet"
      : `${granted.length} folder${granted.length === 1 ? "" : "s"}` +
        (permission === "plan"
          ? ", read only this turn"
          : writable > 0
            ? `, ${writable} writable`
            : ", all read only");

  return (
    <p className="composer__reach">
      {agent.name} can reach {reach}.
      {permission === "plan" && " Planning only — nothing will be changed."}
    </p>
  );
}
