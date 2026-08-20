import type { MemoryVaultSummary } from "../../ipc/memory";
import { CloseIcon, LinkIcon } from "../common/Icons";

export function MemorySourceBar({
  vault,
  busy,
  onDisconnect,
}: {
  vault: MemoryVaultSummary;
  busy: boolean;
  onDisconnect: () => void;
}) {
  const count = `${vault.noteCount}${vault.countLimited ? "+" : ""} note${vault.noteCount === 1 ? "" : "s"}`;
  return (
    <div className="memory-source" role="status">
      <LinkIcon size={13} />
      <span>
        <strong>{vault.name}</strong>
        <small>{vault.location} · {count} · read only</small>
      </span>
      <button
        className="icon-btn"
        aria-label={`Disconnect ${vault.name}`}
        title="Disconnect vault"
        disabled={busy}
        onClick={onDisconnect}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
