import { useCallback, useEffect, useRef, useState } from "react";

export default function useOwnerAccess(ownerId) {
  const [challenge, setChallenge] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const deadline = useRef(0);
  const expire = useCallback((next = { enabled: true }) => {
    epoch.current += 1;
    deadline.current = 0;
    setExpiresAt(null);
    setChallenge(next);
  }, []);
  const accept = useCallback((payload, generation) => {
    if (generation !== epoch.current) return false;
    if (!ownerId || String(payload?.ownerAccountId) !== String(ownerId)) {
      expire(null); setError("Your signed-in account changed. Reload the owner dashboard."); return false;
    }
    if (!Number.isFinite(payload?.ownerAccessExpiresAt) || payload.ownerAccessExpiresAt <= Date.now()) {
      expire(); return false;
    }
    deadline.current = payload.ownerAccessExpiresAt;
    setExpiresAt(payload.ownerAccessExpiresAt);
    setChallenge(null);
    return true;
  }, [expire, ownerId]);
  const failure = useCallback((caught, generation) => {
    if (generation !== epoch.current) return;
    if ([401, 403, 419, 428].includes(caught.status)) expire(caught.status === 428 ? { enabled: true, ...caught.payload } : null);
    if (caught.status !== 428) setError(caught.message || "Please try again.");
  }, [expire]);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => expire(), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt, expire]);
  const active = useCallback(() => deadline.current > Date.now(), []);
  return { challenge, expiresAt, error, setError, epoch, accept, failure, active };
}
