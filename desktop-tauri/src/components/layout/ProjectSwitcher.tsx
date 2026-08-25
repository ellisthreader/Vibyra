import { useEffect, useRef, useState } from "react";

import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { ChevronDownIcon } from "../common/Icons";

/**
 * Where you are, and the one control that moves you.
 *
 * Replaces the Home / Project breadcrumb. The strip on the left still switches
 * projects by tile; this gives the same set a name, a keyboard route, and —
 * the part the breadcrumb never had — somewhere for Home to live once the
 * crumb is gone.
 */
export function ProjectSwitcher() {
  const view = useProjectStore((state) => state.view);
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const project = projects.find((entry) => entry.id === activeId);
  const label = view === "project" && project ? project.name : "Home";

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [],
      );
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
  }, [open]);

  return (
    <div className="pswitch" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="pswitch__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title={project ? project.root : "Home"}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span
          className="pswitch__dot"
          style={{ background: project ? project.color : "var(--dim)" }}
          aria-hidden="true"
        />
        <span className="pswitch__name">{label}</span>
        <ChevronDownIcon size={12} />
      </button>

      {open && (
        <div
          className="chrome-menu chrome-menu--left"
          role="menu"
          aria-label="Switch project"
          ref={menuRef}
        >
          <button
            role="menuitem"
            className="chrome-menu__item"
            aria-current={view === "home"}
            onClick={() => {
              close(false);
              useProjectStore.getState().goHome();
            }}
          >
            <span className="pswitch__dot" style={{ background: "var(--dim)" }} aria-hidden="true" />
            Home
          </button>

          {projects.length > 0 && <div className="chrome-menu__sep" role="separator" />}

          {projects.map((entry) => (
            <button
              key={entry.id}
              role="menuitem"
              className="chrome-menu__item"
              aria-current={view === "project" && entry.id === activeId}
              onClick={() => {
                close(false);
                void useProjectStore.getState().activate(entry.id);
              }}
            >
              <span
                className="pswitch__dot"
                style={{ background: entry.color }}
                aria-hidden="true"
              />
              {entry.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
