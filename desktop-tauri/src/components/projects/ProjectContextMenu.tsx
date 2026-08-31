import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ProjectSpec } from "../../types";
import { CloseIcon, GearIcon, GitBranchIcon } from "../common/Icons";

export type ProjectAction = "activity" | "configuration" | "close";

interface Props {
  project: ProjectSpec;
  anchor: { x: number; y: number };
  onAction: (action: ProjectAction) => void;
  onClose: () => void;
}

export function ProjectContextMenu({ project, anchor, onAction, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(anchor);

  useLayoutEffect(() => {
    const rect = menu.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      x: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)),
    });
  }, [anchor]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    const blur = () => onClose();
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("blur", blur);
    };
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  return (
    <div
      ref={menu}
      className="project-menu"
      role="menu"
      aria-label={`${project.name} project actions`}
      style={{ left: position.x, top: position.y, "--project-c": project.color } as React.CSSProperties}
      onKeyDown={onKeyDown}
    >
      <div className="project-menu__identity">
        <span className="project-menu__mark">{project.name.charAt(0).toUpperCase()}</span>
        <span><strong>{project.name}</strong><small>Project actions</small></span>
      </div>
      <span className="project-menu__rule" />
      <MenuItem autoFocus icon={<GitBranchIcon size={15} />} label="Project activity" hint="Daily lines changed" onClick={() => onAction("activity")} />
      <MenuItem icon={<GearIcon size={15} />} label="Configuration" hint="Name and colour" onClick={() => onAction("configuration")} />
      <span className="project-menu__rule" />
      <MenuItem danger icon={<CloseIcon size={15} />} label="Close project" hint="Folder stays untouched" onClick={() => onAction("close")} />
    </div>
  );
}

function MenuItem(props: { icon: React.ReactNode; label: string; hint: string; danger?: boolean; autoFocus?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className={`project-menu__item ${props.danger ? "project-menu__item--danger" : ""}`} autoFocus={props.autoFocus} onClick={props.onClick}>
      <span className="project-menu__item-icon">{props.icon}</span>
      <span><strong>{props.label}</strong><small>{props.hint}</small></span>
    </button>
  );
}
