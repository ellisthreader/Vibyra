import React, { useEffect, useRef, useState } from "react";
import { portalApi } from "../api.js";

export default function TokenWallet({ accountId, onWallet }) {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let live = true;
    generation.current++; setNext(null); setLoading(false);
    setWallet(null); setItems(null);
    const refresh = () => portalApi.wallet().then(({ wallet: value }) => {
      if (!live) return;
      setWallet(value); setError(""); onWallet?.(value);
    }).catch(e => { if (live) setError(e.message); });
    void refresh(); window.addEventListener("focus", refresh);
    return () => { live = false; generation.current++; window.removeEventListener("focus", refresh); };
  }, [accountId, onWallet]);
  const history = async (before = null) => {
    const current = generation.current; setLoading(true);
    try {
      const data = await portalApi.activity(before);
      if (current !== generation.current) return;
      setItems(previous => before ? [...(previous ?? []), ...data.items] : data.items); setNext(data.next);
    } catch (e) { if (current === generation.current) setError(e.message); }
    finally { if (current === generation.current) setLoading(false); }
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('activity') === '1') void history();
  }, [accountId]);
  return <section className="account-panel" aria-label="Vibyra tokens">
    <p className="panel-label">Vibyra tokens</p>
    {error && <p role="alert">{error}</p>}
    {wallet ? <>
      <h2>{wallet.available.toLocaleString(undefined, { maximumFractionDigits: 4 })} available</h2>
      {wallet.held > 0 && <p>{wallet.held.toLocaleString()} reserved for work in progress</p>}
      <p>{wallet.paidAvailable.toLocaleString()} paid tokens. Paid tokens never expire.</p>
      {wallet.version === 2 && wallet.plan === "free" && <p>{wallet.freeAllowance?.eligible
        ? `${wallet.freeAllowance.tokens} free tokens each month. Next grant: ${new Date(wallet.freeAllowance.nextAt).toLocaleDateString()}.`
        : "Monthly free tokens are a limited pilot. Your account is not enrolled yet."}</p>}
      {wallet.freeAllowance?.expiresAt && <p>Free tokens expire {new Date(wallet.freeAllowance.expiresAt).toLocaleDateString()}.</p>}
      <p>Your own provider accounts do not spend Vibyra tokens.</p>
      {wallet.membership?.conflict && <p role="alert">More than one subscription is active. Contact support to resolve billing.</p>}
      <button className="portal-link-button" disabled={loading} onClick={() => history()}>Show token activity</button>
      {items && <ul>{items.map(item => <li key={item.id}>{new Date(item.createdAt).toLocaleDateString()} · {item.kind} · {(Number(item.deltaUnits) / item.unitScale).toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens</li>)}</ul>}
      {next && <button className="portal-link-button" disabled={loading} onClick={() => history(next)}>More activity</button>}
    </> : !error && <p role="status">Loading your balance…</p>}
  </section>;
}
