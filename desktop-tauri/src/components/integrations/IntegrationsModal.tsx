import { useRef, useState } from "react";
import { ModalPortal } from "../common/ModalPortal";
import { CloseIcon } from "../common/Icons";
import { useModalFocus } from "../../lib/useModalFocus";
import { ConnectionRow } from "./ConnectionRow";
import { ConnectPanel } from "./ConnectPanel";
import { useIntegrations } from "./useIntegrations";
import type { IntegrationProvider } from "./types";
import "../../styles/agent-integrations.css";

export function IntegrationsModal({ agentId, agentName, onClose }: {
  agentId: string; agentName: string; onClose: () => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  useModalFocus(shell, true, onClose);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<IntegrationProvider | null>(null);
  const { snapshot, busy, error, notice, attempt, act } = useIntegrations(agentId);
  const providers = snapshot?.providers.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <ModalPortal><div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-title"
      ref={shell} tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}>
      <header className="modal__header">
        <div><h2 id="integration-title" className="modal__title">Integrations</h2><p className="integration-modal__subtitle">Accounts for {agentName}</p></div>
        <button className="icon-btn" aria-label="Close integrations" onClick={onClose}><CloseIcon size={16} /></button>
      </header>
      <div className="modal__body integration-modal__body">
        {error && <p className="modal__error" role="alert">{error}</p>}
        {notice && <p className="integration-notice" role="status">{notice}</p>}
        {attempt ? <div className="integration-wait" role="status"><h3>Finish connecting in your browser</h3>
          <p>This window will update when sign-in finishes.</p>
          <button className="btn btn--secondary" disabled={!!busy} onClick={() => void act("cancel", { operation: "cancel", id: attempt })}>Cancel connection</button>
        </div> : selected ? <ConnectPanel key={selected.id} provider={selected} busy={!!busy} onBack={() => setSelected(null)}
          onConnect={(shop) => void act(selected.id, { operation: "start", service: selected.id, ...(selected.id === "shopify" ? { shop } : {}) })
            .then((ok) => { if (ok) setSelected(null); })} /> : <>
          <input className="input integration-search" type="search" placeholder="Find an integration…" aria-label="Find an integration" value={query} onChange={(e) => setQuery(e.target.value)} />
          {!snapshot && <p role="status">{busy ? "Loading accounts…" : "Accounts could not be loaded."}</p>}
          {!snapshot && !busy && <button className="btn btn--secondary" onClick={() => void act("loading", { operation: "list" })}>Retry</button>}
          {snapshot && !providers.length && <p>No integrations match your search.</p>}
          <div className="integration-list">{providers.map((p) => {
            const connections = snapshot!.connections.filter((c) => c.service === p.id);
            return <section className="integration-service" key={p.id} aria-label={p.name}>
              <div className="integration-service__head"><span className={`integration-mark integration-mark--${p.provider}`} aria-hidden="true">{p.name.charAt(0)}</span>
                <div className="integration-service__text"><h3>{p.name}</h3><p>{p.description}</p></div>
                <button className="btn btn--secondary" disabled={!p.ready || !!busy} title={!p.ready ? "Vibyra needs to enable this provider before accounts can connect." : undefined}
                  onClick={() => setSelected(p)}>{!p.ready ? "Setup needed" : connections.some((c) => c.status === "reconnect") ? "Reconnect" : connections.length ? "Add account" : "Connect"}</button>
              </div>
              {connections.map((c) => <ConnectionRow key={c.id} connection={c} disabled={!!busy} act={act} />)}
            </section>;
          })}</div>
          {snapshot?.providers.some((p) => !p.ready) && <p className="integration-modal__hint">Some services need Vibyra’s provider setup before sign-in is available.</p>}
        </>}
      </div>
      <footer className="modal__foot integration-modal__foot"><span>Read access only. You control which accounts this teammate can use.</span>
        <button className="btn btn--secondary" onClick={onClose}>Done</button></footer>
    </div>
  </div></ModalPortal>;
}
