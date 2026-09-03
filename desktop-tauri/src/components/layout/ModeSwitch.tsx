import { BotIcon, ChatIcon, TerminalIcon } from "../common/AgentIcons";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import type { AppMode } from "../../agentTypes";

/**
 * Agent / Code / Chat, in the titlebar.
 *
 * It borrows the segmented shape `nav-segmented.css` already owns, for the
 * same reason the dock size control does: this is a "pick one of these
 * panels" control, and the product should not have two idioms for that.
 *
 * The count on Agent is the ambient version of the decisions queue: it is
 * loaded by the work bus rather than by the panel that shows it, so it is true
 * from Code Mode, from Skills, from inside a chat. A count that is only right
 * while you are already looking at the thing it counts is worse than no count.
 *
 * Switching is a display change, never an unmount. Code Mode's terminals are
 * live PTYs carrying xterm renderers and scrollback; tearing them down to show
 * a chat list would cost all of it, and the panes would come back blank.
 */
const MODES: { id: AppMode; label: string; Icon: typeof BotIcon; hint: string }[] = [
  { id: "agent", label: "Agent", Icon: BotIcon, hint: "Your persistent teammates" },
  { id: "code", label: "Code", Icon: TerminalIcon, hint: "Projects and terminals" },
  { id: "chat", label: "Chat", Icon: ChatIcon, hint: "A conversation with no project" },
];

export function ModeSwitch() {
  const mode = useAgentModeStore((state) => state.mode);
  const setMode = useAgentModeStore((state) => state.setMode);
  const waiting = useAgentWorkStore((state) => state.approvals.length);

  return (
    <div className="dock-size mode-switch" role="tablist" aria-label="Workspace mode">
      {MODES.map(({ id, label, Icon, hint }) => (
        <button
          key={id}
          role="tab"
          aria-selected={mode === id}
          className={mode === id ? "dock-size__on" : ""}
          title={hint}
          onClick={() => setMode(id)}
        >
          <Icon size={13} />
          {label}
          {id === "agent" && waiting > 0 && (
            <span className="mode-switch__pip" aria-label={`${waiting} waiting for you`}>
              {waiting}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
