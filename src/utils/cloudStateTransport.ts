import { AppApiError } from "./appApiErrors";
import { cloudStateChanges } from "./cloudStateDelta";

type Response = { ok?: boolean; syncVersion?: number };
type Request = (path: string, body: string, token: string) => Promise<Response>;

// Capability negotiation keeps new clients compatible with an older backend.
// Baselines advance only on an acknowledged save; conflicts never fall back
// to a full overwrite, and lost acknowledgements can replay idempotently.
export function createCloudStateTransport(request: Request) {
  let owner = "";
  let baseline: Record<string, unknown> | null = null;
  let supportsDelta = false;
  let unacknowledged: { body: string; state: Record<string, unknown> } | null = null;
  async function sendPending(token: string) {
    const pending = unacknowledged!;
    try {
      const response = await request("/api/session/state/delta", pending.body, token);
      if (response.ok !== true || response.syncVersion !== 1) throw new Error("State save was not acknowledged.");
      if (owner === token) { baseline = pending.state; unacknowledged = null; }
    } catch (error) {
      // A lost response may follow a committed write. Replay it before sending
      // a newer snapshot, otherwise its valid preimage would look like a conflict.
      if (owner === token && error instanceof AppApiError && error.status >= 400 && error.status < 500) {
        unacknowledged = null;
      }
      throw error;
    }
  }
  return async (body: string, token: string) => {
    if (owner !== token) {
      owner = token;
      baseline = null;
      supportsDelta = false;
      unacknowledged = null;
    }
    const next = JSON.parse(body) as Record<string, unknown>;
    if (baseline && supportsDelta) {
      try {
        if (unacknowledged) await sendPending(token);
        if (owner !== token) return;
        const changes = cloudStateChanges(baseline!, next);
        if (!changes.length) return;
        unacknowledged = { body: JSON.stringify({ syncVersion: 1, changes }), state: next };
        await sendPending(token);
        return;
      } catch (error) {
        if (!(error instanceof AppApiError) || ![404, 405].includes(error.status)) throw error;
        supportsDelta = false;
      }
    }
    const response = await request("/api/session/state", JSON.stringify({ ...next, responseMode: "ack-v1" }), token);
    if (owner === token) {
      supportsDelta = response.syncVersion === 1;
      baseline = next;
    }
  };
}
