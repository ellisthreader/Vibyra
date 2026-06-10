import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProjectPublishStatuses, type ProjectPublishStatus } from "../../../utils/communityApi";
import { publishStatusPollKey } from "../inline/ProjectPublishLifecycle";
import { isPublishStatusPending } from "../inline/ProjectPublishResult";

export function useProjectPublishStatuses(authToken?: string | null) {
  const [items, setItems] = useState<Record<string, ProjectPublishStatus>>({});
  const pollCount = useRef(0);
  const pollKey = useRef("");

  const refresh = useCallback(async () => {
    if (!authToken) { setItems({}); return []; }
    try {
      const statuses = await fetchProjectPublishStatuses(authToken);
      setItems(Object.fromEntries(statuses.map((status) => [status.sourceProjectId, status])));
      return statuses;
    } catch {
      // Publish status is helpful UI state; keep Projects usable if the API is offline.
      return [];
    }
  }, [authToken]);

  const upsert = useCallback((status?: ProjectPublishStatus | null) => {
    if (!status?.sourceProjectId) return;
    setItems((current) => ({ ...current, [status.sourceProjectId]: status }));
  }, []);

  const remove = useCallback((sourceProjectId?: string | null) => {
    if (!sourceProjectId) return;
    setItems((current) => {
      const next = { ...current };
      delete next[sourceProjectId];
      return next;
    });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const pending = Object.values(items).filter(isPublishStatusPending);
    if (!authToken || pending.length === 0) {
      pollCount.current = 0;
      pollKey.current = "";
      return;
    }
    const nextPollKey = publishStatusPollKey(pending);
    if (nextPollKey !== pollKey.current) {
      pollKey.current = nextPollKey;
      pollCount.current = 0;
    }
    if (pollCount.current >= 75) return;
    const awaitingReview = pending.every((status) => status.reviewStatus === "under_review" || status.reviewStatus === "pending");
    const timeout = setTimeout(() => {
      pollCount.current += 1;
      void refresh();
    }, awaitingReview ? 12000 : 4000);
    return () => clearTimeout(timeout);
  }, [authToken, items, refresh]);

  return { items, refresh, remove, upsert };
}
