import { useRef } from "react";
import type { ComponentType, CSSProperties, KeyboardEvent } from "react";

import {
  COMPANION_MAX_WIDTH,
  COMPANION_MIN_WIDTH,
  type CompanionTab,
} from "../../lib/companionPreferences";
import { useAccountStore } from "../../state/accountStore";
import { useProjectStore } from "../../state/projectStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { CloseIcon, FolderIcon, SparklesIcon } from "../common/Icons";
import { FilesPanel } from "./FilesPanel";
import { DockSizeControl } from "../layout/DockSizeControl";
import { ChatPanel } from "./ChatPanel";
import { useCompanionResize } from "./useCompanionResize";

const TABS: { id: CompanionTab; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: "chat", label: "Chat", icon: SparklesIcon },
  { id: "files", label: "Files", icon: FolderIcon },
];

export function Companion({ active = true }: { active?: boolean }) {
  const account = useAccountStore(s => s.snapshot.profile?.email ?? "guest");
  const projectId = useProjectStore(s => s.activeId);
  const open = useWorkspaceStore((s) => s.companionOpen);
  const size = useWorkspaceStore((s) => s.companionSize);
  const tab = useWorkspaceStore((s) => s.companionTab);
  const preferredWidth = useWorkspaceStore((s) => s.companionWidth);
  const setTab = useWorkspaceStore((s) => s.setCompanionTab);
  const setWidth = useWorkspaceStore((s) => s.setCompanionWidth);
  const toggle = useWorkspaceStore((s) => s.toggleCompanion);
  const tabs = useRef<Record<CompanionTab, HTMLButtonElement | null>>({
    chat: null,
    files: null,
  });
  const resize = useCompanionResize(preferredWidth, setWidth);

  if (!open) return null;

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = TABS[next].id;
    setTab(nextTab);
    requestAnimationFrame(() => tabs.current[nextTab]?.focus());
  };

  return (
    <aside
      id="project-companion"
      className="companion"
      data-size={size}
      aria-label="Project companion"
      style={{ "--companion-width": `${resize.width}px` } as CSSProperties}
    >
      {size === "compact" && <div
        className="companion__resize"
        role="separator"
        aria-label="Resize project companion"
        aria-orientation="vertical"
        aria-valuemin={COMPANION_MIN_WIDTH}
        aria-valuemax={COMPANION_MAX_WIDTH}
        aria-valuenow={resize.width}
        tabIndex={0}
        onPointerDown={resize.start}
        onKeyDown={resize.resizeWithKeyboard}
        onDoubleClick={resize.reset}
      />}
      <header className="companion__head">
        <nav className="companion__tabs" role="tablist" aria-label="Companion tools">
          {TABS.map((entry, index) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                ref={(node) => {
                  tabs.current[entry.id] = node;
                }}
                id={`companion-tab-${entry.id}`}
                role="tab"
                aria-selected={tab === entry.id}
                aria-controls={`companion-panel-${entry.id}`}
                tabIndex={tab === entry.id ? 0 : -1}
                className={`companion__tab ${tab === entry.id ? "companion__tab--active" : ""}`}
                onClick={() => setTab(entry.id)}
                onKeyDown={(event) => moveTabFocus(event, index)}
              >
                <Icon size={13} />
                {entry.label}
              </button>
            );
          })}
        </nav>
        <DockSizeControl />
        <button className="icon-btn companion__close" aria-label="Close companion" title="Close" onClick={toggle}>
          <CloseIcon size={14} />
        </button>
      </header>
      <div
        className="companion__body"
        id={`companion-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`companion-tab-${tab}`}
      >
        {tab === "chat" && <ChatPanel key={`${account}:${projectId}`} active={active} />}
        {tab === "files" && (
          <div className="companion-panel companion-panel--files">
            <FilesPanel />
          </div>
        )}
      </div>
    </aside>
  );
}
