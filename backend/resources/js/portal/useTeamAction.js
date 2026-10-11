import { useCallback, useState } from "react";

/** Runs one Team call, hands the fresh overview to `onData`, and keeps a single busy flag and error line for the page. */
export function useTeamAction(onData) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async (call) => {
    setBusy(true);
    setError("");
    try {
      const next = await call();
      if (next && "team" in next) onData(next);
      return next;
    } catch (caught) {
      setError(caught.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [onData]);
  return { busy, error, setError, run };
}
