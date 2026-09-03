import { open as openDialog } from "@tauri-apps/plugin-dialog";

import type { AgentProfile } from "../../agentTypes";
import { FolderIcon } from "../common/Icons";
import { NONE } from "../../lib/emptyList";
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
  const places = useAgentRosterStore((state) => state.places[agent.id] ?? NONE);
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
    <section className="settings-block">
      <span className="section-label">Places</span>
      <div className="settings-group">
        <p className="settings-note">
          Nothing outside these folders is readable or writable, whatever a prompt asks for.
          Removing one takes effect on the next turn and the next routine run.
        </p>
        {places.map((place) => {
          const home = place.path === agent.homePath;
          return (
            <div className="setting-row" key={place.id}>
              <span className="setting-row__lead">
                <span className="setting-row__icon">
                  <FolderIcon size={13} />
                </span>
                <span className="setting-row__text">
                  <code className="place__path" title={place.path}>
                    {place.path}
                  </code>
                  <span className="setting-row__hint">
                    {home ? "Its own folder — always granted, always writable." : place.label}
                  </span>
                </span>
              </span>
              <span className="setting-row__control settings-row-actions">
                <span className={`place__access place__access--${place.access}`}>
                  {place.access === "readWrite" ? "Read & write" : "Read only"}
                </span>
                {!home && (
                  <button
                    className="btn btn--sm btn--secondary"
                    onClick={() => void revoke(agent.id, place.id)}
                  >
                    Remove
                  </button>
                )}
              </span>
            </div>
          );
        })}
        <div className="settings-group__foot">
          {error && <span className="settings-feedback settings-feedback--error">{error}</span>}
          <button className="btn btn--sm" onClick={() => void pick("read")}>
            Add a folder to read
          </button>
          <button className="btn btn--sm" onClick={() => void pick("readWrite")}>
            Add a folder it may change
          </button>
        </div>
      </div>
    </section>
  );
}
