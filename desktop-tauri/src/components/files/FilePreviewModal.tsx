import { useWorkspaceStore } from "../../state/workspaceStore";
import { CloseIcon } from "../common/Icons";

export function FilePreviewModal() {
  const preview = useWorkspaceStore((s) => s.preview);
  const closePreview = useWorkspaceStore((s) => s.closePreview);

  if (!preview) return null;

  const name = preview.path.split("/").pop() ?? preview.path;

  return (
    <div className="modal-backdrop" onClick={closePreview}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title">{name}</h2>
            <p className="modal__subtitle">{preview.path}</p>
          </div>
          <button className="icon-btn" onClick={closePreview} title="Close">
            <CloseIcon size={15} />
          </button>
        </header>
        {preview.truncated && (
          <p className="modal__notice">
            Showing the first 256 KB of {(preview.size / 1024).toFixed(0)} KB.
          </p>
        )}
        <pre className="modal__code">{preview.content}</pre>
      </div>
    </div>
  );
}
