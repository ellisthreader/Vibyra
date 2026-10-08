import { useCallback, useEffect, useState } from "react";
import { listProviderAccounts } from "../../ipc/providerAccounts";
import { readCloudSetupScope } from "../../state/cloudAvailability";
import { teammateApi } from "../teammates/api";
import type { CloudAccounts } from "./ConnectSteps";

/** Fresh account inventory for this setup attempt; never silently treat a failed read as no accounts. */
export function useCloudHas(scope: string) {
  const [accounts, setAccounts] = useState<CloudAccounts>({ claude: false, codex: false, github: false });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    setReady(false); setError("");
    void Promise.all([listProviderAccounts(), teammateApi<{ integrations: { id: string; installed: boolean }[] }>("connectors")])
      .then(([providers, catalogue]) => {
        if (!live || readCloudSetupScope() !== scope) return;
        const signed = (id: string) => providers.some((p) => p.id === id && p.accounts.some((a) => a.status === "connected"));
        setAccounts({ codex: signed("codex"), claude: signed("claude"),
          github: (catalogue.integrations ?? []).some((item) => item.id === "github" && item.installed) });
        setReady(true);
      }).catch((cause) => { if (live && readCloudSetupScope() === scope) setError(String(cause)); });
    return () => { live = false; };
  }, [scope, attempt]);
  return { accounts, ready, error, retry };
}
