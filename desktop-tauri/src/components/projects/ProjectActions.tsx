import { useState } from "react";
import { createPortal } from "react-dom";

import type { ProjectSpec } from "../../types";
import { CloseProjectDialog } from "./CloseProjectDialog";
import { ProjectActivitySheet } from "./ProjectActivitySheet";
import { ProjectConfigurationDialog } from "./ProjectConfigurationDialog";
import { ProjectContextMenu, type ProjectAction } from "./ProjectContextMenu";

export interface ProjectMenuTarget {
  project: ProjectSpec;
  anchor: { x: number; y: number };
}

interface Props {
  target: ProjectMenuTarget;
  onClose: () => void;
}

export function ProjectActions({ target, onClose }: Props) {
  const [action, setAction] = useState<ProjectAction | null>(null);
  const project = target.project;
  let overlay: React.ReactNode;

  if (action === "activity") {
    overlay = <ProjectActivitySheet project={project} onClose={onClose} />;
  } else if (action === "configuration") {
    overlay = <ProjectConfigurationDialog project={project} onClose={onClose} />;
  } else if (action === "close") {
    overlay = <CloseProjectDialog project={project} onClose={onClose} />;
  } else {
    overlay = (
      <ProjectContextMenu
        project={project}
        anchor={target.anchor}
        onAction={setAction}
        onClose={onClose}
      />
    );
  }
  return createPortal(overlay, document.body);
}
