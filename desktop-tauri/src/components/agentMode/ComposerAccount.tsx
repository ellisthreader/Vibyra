import { useEffect } from "react";
import type { Engine } from "../../agentTypes";
import { useProviderAccountStore } from "../../state/providerAccountStore";

export function ComposerAccount({ engine, value, onChange, disabled }: {
  engine: Engine; value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const provider = useProviderAccountStore((state) => state.providers.find((entry) => entry.id === engine));
  const refresh = useProviderAccountStore((state) => state.refresh);
  useEffect(() => { void refresh(); }, [refresh]);
  return (
    <label className="permission-picker composer__account">
      <span className="section-label">Account</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label="AI provider account">
        {!provider && <option value="default">Default login</option>}
        {provider?.accounts.map((account) => (
          <option key={account.accountId} value={account.accountId} disabled={account.status !== "connected"}>
            {account.accountLabel || "Default login"}{account.status !== "connected" ? " · Sign in required" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
