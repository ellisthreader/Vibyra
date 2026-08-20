import { useEffect } from "react";

import { useWorkspaceStore } from "../../state/workspaceStore";
import { CloseIcon } from "../common/Icons";

export function Toasts() {
  const error = useWorkspaceStore((s) => s.error);
  const setError = useWorkspaceStore((s) => s.setError);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6500);
    return () => clearTimeout(timer);
  }, [error, setError]);

  if (!error) return null;

  return (
    <div className="toasts">
      <div className="toast" role="alert">
        <span className="dot" />
        <span>{error}</span>
        <button className="icon-btn" onClick={() => setError(null)} title="Dismiss">
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}
