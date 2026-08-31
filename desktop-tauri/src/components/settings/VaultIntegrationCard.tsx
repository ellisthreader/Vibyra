import { useEffect } from "react";

import type { MemoryVaultSummary } from "../../ipc/memory";
import { useVaultStore } from "../../state/vaultStore";
import { ChevronIcon, CloseIcon, LinkIcon } from "../common/Icons";

/**
 * The connected Obsidian vault, as an integration rather than a panel.
 *
 * It sits with the provider accounts because it is the same kind of thing:
 * connect an outside service once, see its status, disconnect. Connecting was
 * a per-project act while this lived in the dock, which meant reconnecting the
 * same vault for every repository — being app-level state now, that is gone
 * rather than fixed.
 *
 * Borrows the card the model catalog uses, so this page keeps one shape.
 */

function noteCount(vault: MemoryVaultSummary): string {
  const suffix = vault.countLimited ? "+" : "";
  return `${vault.noteCount}${suffix} note${vault.noteCount === 1 ? "" : "s"}`;
}

function VaultChoices({ suggestions }: { suggestions: MemoryVaultSummary[] }) {
  const busy = useVaultStore((state) => state.busy);
  const connect = useVaultStore((state) => state.connect);

  return (
    <div className="vault-choices">
      {suggestions.slice(0, 3).map((vault) => (
        <button
          key={vault.id}
          type="button"
          className="vault-choice"
          disabled={busy}
          onClick={() => void connect(vault.id)}
        >
          <LinkIcon size={14} />
          <span><strong>{vault.name}</strong><small>{vault.location} · {noteCount(vault)}</small></span>
          <ChevronIcon size={11} />
        </button>
      ))}
      <button
        type="button"
        className="vault-choice"
        disabled={busy}
        onClick={() => void connect()}
      >
        <LinkIcon size={14} />
        <span>
          <strong>{suggestions.length > 0 ? "Choose another folder…" : "Choose a vault folder…"}</strong>
          <small>Any folder holding an Obsidian vault</small>
        </span>
        <ChevronIcon size={11} />
      </button>
    </div>
  );
}

export function VaultIntegrationCard() {
  const sources = useVaultStore((state) => state.sources);
  const loaded = useVaultStore((state) => state.loaded);
  const busy = useVaultStore((state) => state.busy);
  const error = useVaultStore((state) => state.error);
  const load = useVaultStore((state) => state.load);
  const disconnect = useVaultStore((state) => state.disconnect);

  useEffect(() => { void load(); }, [load]);

  const vault = sources?.vault ?? null;
  const warning = error ?? sources?.warning ?? null;
  const status = !loaded ? "Checking" : vault ? "Connected" : "Not connected";
  const tone = !loaded ? "working" : vault ? "success" : "neutral";

  return (
    <article className="settings-group integration-card">
      <div className="integration-card__head">
        <span className="vault-mark" aria-hidden="true"><LinkIcon size={18} /></span>
        <div className="integration-card__identity">
          <div className="integration-card__title">
            <h3>Obsidian</h3>
            <span className={`settings-status settings-status--${tone}`}>
              <i aria-hidden="true" />{status}
            </span>
          </div>
          <p>
            {vault
              ? `${vault.name} · ${vault.location} · ${noteCount(vault)}`
              : "Lend your agents the notes you already keep"}
          </p>
        </div>
        {vault ? (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Disconnect ${vault.name}`}
            title="Disconnect vault"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            <CloseIcon size={13} />
          </button>
        ) : null}
      </div>

      {loaded && !vault ? <VaultChoices suggestions={sources?.suggestions ?? []} /> : null}

      <p className="integration-card__note">
        Read only. Vibyra ranks matching notes on this machine and never writes to the vault.
      </p>
      {warning ? <p className="integration-error" role="alert">{warning}</p> : null}
    </article>
  );
}
