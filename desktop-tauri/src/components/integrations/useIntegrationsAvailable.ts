import { useEffect, useState } from "react";
import { integrationRequest } from "./api";
import type { IntegrationSnapshot } from "./types";
import { integrationsUsable } from "./visibility";

const RECHECK_MS = 5 * 60_000;
const probes = new Map<string, { at: number; result: Promise<boolean> }>();

// A signed-out account, an older server without the endpoint and a network
// failure all mean the same thing to a person: there is nothing to open yet.
function probe(agentId: string): Promise<boolean> {
  return integrationRequest<IntegrationSnapshot>(agentId, { operation: "list" })
    .then(integrationsUsable)
    .catch(() => false);
}

export function useIntegrationsAvailable(agentId: string, accountKey: string): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    // One probe per account, shared by every teammate header and re-run
    // occasionally so a newly registered provider appears without a restart.
    let entry = probes.get(accountKey);
    if (!entry || Date.now() - entry.at >= RECHECK_MS) {
      entry = { at: Date.now(), result: probe(agentId) };
      probes.set(accountKey, entry);
    }
    void entry.result.then((ok) => {
      if (alive) setAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, [agentId, accountKey]);
  return available;
}
