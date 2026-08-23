import { navUpdateCopy } from "../../lib/updatePolicy";
import { useUpdateStore } from "../../state/updateStore";

/** Persistent updater entry in the titlebar. Unlike the announcement banner,
 * this never respects `dismissed`, so a live release is always reachable. */
export function UpdateNavAction() {
  const status = useUpdateStore((state) => state.status);
  const version = useUpdateStore((state) => state.version);
  const progress = useUpdateStore((state) => state.progress);
  const copy = navUpdateCopy(status, version, progress);

  if (!copy) return null;

  const act = (): void => {
    const store = useUpdateStore.getState();
    if (store.status === "ready" || store.status === "restartError") void store.restart();
    else if (store.status !== "downloading" && store.status !== "installing") void store.download();
  };

  return (
    <button
      type="button"
      className={`chip chrome__update chrome__update--${status}`}
      title={copy.title}
      aria-label={copy.title}
      aria-live="polite"
      onClick={act}
      disabled={copy.busy}
    >
      <span className="chrome__update-dot" aria-hidden="true" />
      {copy.label}
    </button>
  );
}
