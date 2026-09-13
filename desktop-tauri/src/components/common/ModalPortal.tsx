import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/** Keep dialogs outside the workspace made inert by their focus controller. */
export function ModalPortal({ children }: { children: ReactNode }) {
  let root = document.getElementById("modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.appendChild(root);
  }
  return createPortal(children, root);
}
