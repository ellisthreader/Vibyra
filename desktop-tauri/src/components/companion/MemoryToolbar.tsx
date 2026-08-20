import { useEffect, useRef, useState } from "react";

import {
  CheckIcon,
  ChevronDownIcon,
  FileIcon,
  FolderIcon,
  EyeIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
} from "../common/Icons";

interface MemoryToolbarProps {
  saving: boolean;
  busy: boolean;
  notice: string | null;
  showImport: boolean;
  title: string;
  local: boolean;
  view: "read" | "edit";
  onView: (view: "read" | "edit") => void;
  onConnectVault: () => void;
  onImportFiles: () => void;
}

export function MemoryToolbar(props: MemoryToolbarProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="memory-toolbar">
      <span className="memory-toolbar__file">
        <FileIcon size={13} /> <span title={props.title}>{props.title}</span>
      </span>
      <div className="memory-toolbar__actions">
        <span
          className={`memory-status ${props.saving || props.busy ? "memory-status--saving" : ""}`}
          aria-live="polite"
        >
          {props.saving || props.busy ? (
            <span className="memory-status__pulse" />
          ) : (
            <CheckIcon size={12} />
          )}
          {props.local
            ? props.notice ?? (props.busy ? "Working…" : props.saving ? "Saving…" : "Saved")
            : "Read only"}
        </span>
        {props.local && (
          <div className="memory-view-toggle" aria-label="Memory view">
            <button
              className={props.view === "read" ? "is-active" : ""}
              aria-label="Read memory"
              title="Read"
              onClick={() => props.onView("read")}
            >
              <EyeIcon size={12} />
            </button>
            <button
              className={props.view === "edit" ? "is-active" : ""}
              aria-label="Edit memory"
              title="Edit"
              onClick={() => props.onView("edit")}
            >
              <PencilIcon size={12} />
            </button>
          </div>
        )}
        {props.showImport && (
          <div className="memory-import" ref={menu}>
            <button
              className="memory-import__trigger"
              aria-haspopup="menu"
              aria-expanded={open}
              disabled={props.busy}
              onClick={() => setOpen((value) => !value)}
            >
              <PlusIcon size={12} /> Import <ChevronDownIcon size={11} />
            </button>
            {open && (
              <div className="memory-import__menu" role="menu">
                <button role="menuitem" onClick={() => run(props.onConnectVault)}>
                  <span><LinkIcon size={14} /></span>
                  <span><strong>Obsidian vault</strong><small>Link read-only notes</small></span>
                </button>
                <button role="menuitem" onClick={() => run(props.onImportFiles)}>
                  <span><FolderIcon size={14} /></span>
                  <span><strong>Markdown files</strong><small>Copy into MEMORY.md</small></span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
