import { useCallback, useEffect, useState } from "react";
import { fetchProjectPublishStatuses, type ProjectPublishStatus } from "../../../utils/communityApi";

export function useProjectPublishStatuses(authToken?: string | null) {
  const [items, setItems] = useState<Record<string, ProjectPublishStatus>>({});

  const refresh = useCallback(async () => {
    if (!authToken) { setItems({}); return; }
    try {
      const statuses = await fetchProjectPublishStatuses(authToken);
      setItems(Object.fromEntries(statuses.map((status) => [status.sourceProjectId, status])));
    } catch {
      // Publish status is helpful UI state; keep Projects usable if the API is offline.
    }
  }, [authToken]);

  const upsert = useCallback((status?: ProjectPublishStatus | null) => {
    if (!status?.sourceProjectId) return;
    setItems((current) => ({ ...current, [status.sourceProjectId]: status }));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { items, refresh, upsert };
}
