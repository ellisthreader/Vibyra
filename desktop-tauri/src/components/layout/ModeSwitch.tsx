import { BotIcon, ChatIcon, TerminalIcon } from "../common/AgentIcons";
import { useAgentModeStore } from "../../state/agentModeStore";
import type { AppMode } from "../../agentTypes";

/**
 * Agent / Code / Chat, in the titlebar.
 *
 * It borrows the segmented shape `nav-segmented.css` already owns, for the
 * same reason the dock size control does: this is a "pick one of these
 * panels" control, and the product should not have two idioms for that.
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

  return (
    <div className="dock-size mode-switch" role="tablist" aria-label="Workspace mode">
      {MODES.map(({ id, label, Icon, hint }) => (
        <button
          key={id}
          role="tab"
          aria-selected={mode === id}
          className={mode === id ? "dock-size__on" : undefined}
          title={hint}
          onClick={() => setMode(id)}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}
