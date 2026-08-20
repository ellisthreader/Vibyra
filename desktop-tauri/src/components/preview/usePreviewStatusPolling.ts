import { type RefObject, useEffect } from "react";

import { getPreviewStatus } from "../../ipc/preview";
import type { PreviewStatus } from "../../previewTypes";

type LivePhase = "starting" | "running";
type PollTarget = [string, LivePhase, number];

function isLive(status: PreviewStatus): status is PreviewStatus & { phase: LivePhase } {
  return status.phase === "starting" || status.phase === "running";
}

export function usePreviewStatusPolling(
  root: string,
  statuses: Record<string, PreviewStatus>,
  targetRequests: RefObject<Record<string, number>>,
  rememberStatus: (status: PreviewStatus) => void,
) {
  const targets: PollTarget[] = Object.values(statuses)
    .filter(isLive)
    .map(
      (status): PollTarget => [
        status.targetId,
        status.phase,
        targetRequests.current[status.targetId] ?? 0,
      ],
    )
    .sort(([left], [right]) => left.localeCompare(right));
  const serialized = JSON.stringify(targets);

  useEffect(() => {
    const initial = JSON.parse(serialized) as PollTarget[];
    if (!initial.length) return;
    let cancelled = false;
    let timer = 0;
    const poll = async (entries: PollTarget[]) => {
      const results = await Promise.allSettled(
        entries.map(([id]) => getPreviewStatus(root, id)),
      );
      if (cancelled) return;
      const live: PollTarget[] = [];
      results.forEach((result, index) => {
        const [id, phase, version] = entries[index];
        if ((targetRequests.current[id] ?? 0) !== version) return;
        if (result.status === "rejected") {
          live.push([id, phase, version]);
          return;
        }
        rememberStatus(result.value);
        if (isLive(result.value)) {
          live.push([result.value.targetId, result.value.phase, version]);
        }
      });
      if (live.length) {
        const delay = live.some(([, phase]) => phase === "starting") ? 500 : 1800;
        timer = window.setTimeout(() => void poll(live), delay);
      }
    };
    const delay = initial.some(([, phase]) => phase === "starting") ? 500 : 1800;
    timer = window.setTimeout(() => void poll(initial), delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rememberStatus, root, serialized, targetRequests]);
}
