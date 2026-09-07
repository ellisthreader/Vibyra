import { useState } from "react";
import type { IntegrationProvider } from "./types";

export function ConnectPanel({ provider, busy, onConnect, onBack }: {
  provider: IntegrationProvider;
  busy: boolean;
  onConnect: (shop?: string) => void;
  onBack: () => void;
}) {
  const [shop, setShop] = useState("");
  const valid = provider.id !== "shopify" || /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop.trim().toLowerCase());
  return <form className="integration-connect" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) onConnect(shop.trim().toLowerCase()); }}>
    <h3>Connect {provider.name}</h3>
    <p>{provider.description}. You choose whether this teammate can use the account after connecting.</p>
    <p>Your browser will open for sign-in. Vibyra securely stores the connection on its server and processes requested reads there.</p>
    {provider.id === "shopify" && <label>Store address<input className="input" autoFocus value={shop} maxLength={100}
      placeholder="my-shop.myshopify.com" onChange={(e) => setShop(e.target.value)} autoComplete="off" spellCheck={false} /></label>}
    <div className="integration-connect__actions">
      <button type="button" className="btn btn--secondary" disabled={busy} onClick={onBack}>Back</button>
      <button type="submit" className="btn btn--primary" disabled={busy || !valid}>{busy ? "Opening…" : `Continue to ${provider.name}`}</button>
    </div>
  </form>;
}
