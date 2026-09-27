import { useRef } from "react";

import { useAgentInstalls } from "../../lib/useAgentInstalls";
import { useNestedDialog } from "../../lib/useNestedDialog";
import { useOptionalRuntimes } from "../../lib/useOptionalRuntimes";
import type { Settings } from "../../types";
import { CloseIcon } from "../common/Icons";
import { MoreAgentsRow } from "./MoreAgentsRow";

interface Props {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
  onClose: () => void;
}

/**
 * Every agent Vibyra can launch besides the three company accounts on the
 * page behind this.
 *
 * The list is the built-in catalog (`agents/catalog.rs`) minus the account
 * runners — never a hand-written list, so nothing can be offered that Vibyra
 * cannot actually run. Each row is a mark, a name, one line and one control;
 * the state machine is in `MoreAgentsRow`.
 *
 * A dialog inside a dialog, so it marks itself `data-escape-owner`: that is
 * how Settings underneath knows to leave Escape and Tab to this one. See
 * `useNestedDialog`.
 */
export function MoreAgentsModal({ settings, update, onClose }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const agents = useOptionalRuntimes("all");
  const { state, install, dismiss } = useAgentInstalls();
  useNestedDialog(dialog, true, onClose);

  const selected = new Set(settings.enabledAgentIds);
  const toggle = (id: string) =>
    void update({
      enabledAgentIds: selected.has(id)
        ? settings.enabledAgentIds.filter((item) => item !== id)
        : [...settings.enabledAgentIds, id],
    });

  const on = agents.filter((agent) => agent.installed && selected.has(agent.id)).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="modal more-agents"
        role="dialog"
        aria-modal="true"
        aria-label="More agents"
        data-escape-owner=""
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title">More agents</h2>
            <p className="modal__subtitle">
              {on > 0 ? `${on} in your launcher` : "Install one to add it to your launcher"}
            </p>
          </div>
          <button className="icon-btn" type="button" title="Done" aria-label="Done" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </header>
        <div className="modal__body more-agents__body">
          {agents.map((agent) => (
            <MoreAgentsRow
              key={agent.id}
              agent={agent}
              enabled={selected.has(agent.id)}
              install={state[agent.id]}
              onInstall={() => void install(agent.id)}
              onDismiss={() => dismiss(agent.id)}
              onToggle={() => toggle(agent.id)}
            />
          ))}
        </div>
        <p className="more-agents__foot">
          Each agent signs in with its own account the first time you launch it.
        </p>
      </section>
    </div>
  );
}
