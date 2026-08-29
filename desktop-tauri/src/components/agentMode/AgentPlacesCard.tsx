import { open as openDialog } from "@tauri-apps/plugin-dialog";

import type { AgentProfile } from "../../agentTypes";
import { useAgentRosterStore } from "../../state/agentRosterStore";

/**
 * The folders this agent may touch.
 *
 * Every agent starts with exactly one — its own private home — and nothing
 * else. Granting the project the user happens to have open is a decision they
 * make here, not something inherited, because an agent that silently adopts
 * the current project is an agent that edits the wrong repository the first
 * time someone switches tabs.
 */
export function AgentPlacesCard({ agent }: { agent: AgentProfile }) {
  const places = useAgentRosterStore((state) => state.places[agent.id] ?? []);
  const grant = useAgentRosterStore((state) => state.grant);
  const revoke = useAgentRosterStore((state) => state.revoke);
  const error = useAgentRosterStore((state) => state.error);

  const pick = async (access: "read" | "readWrite") => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: `Choose a folder ${agent.name} may ${access === "read" ? "read" : "read and change"}`,
    }).catch(() => null);
    if (typeof picked === "string" && picked) await grant(agent.id, picked, access);
  };

  return (
    <section className="settings-card">
      <h3>Places</h3>
      <p className="settings-card__hint">
        Nothing outside these folders is readable or writable, whatever a prompt asks for.
        Removing one takes effect on the next turn and the next routine run.
      </p>
      {error && <p className="panel__error">{error}</p>}
      <ul className="place-list">
        {places.map((place) => {
          const home = place.path === agent.homePath;
          return (
            <li key={place.id}>
              <code>{place.path}</code>
              <span className={`place-list__access place-list__access--${place.access}`}>
                {place.access === "readWrite" ? "read & write" : "read only"}
              </span>
              {home ? (
                <span className="place-list__home">its own folder</span>
              ) : (
                <button className="btn-ghost" onClick={() => void revoke(agent.id, place.id)}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="place-list__actions">
        <button className="btn-ghost" onClick={() => void pick("read")}>
          Add a folder to read
        </button>
        <button className="btn-ghost" onClick={() => void pick("readWrite")}>
          Add a folder it may change
        </button>
      </div>
    </section>
  );
}
