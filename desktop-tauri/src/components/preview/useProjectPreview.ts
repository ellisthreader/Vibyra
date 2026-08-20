import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPreviewStatus,
  inspectPreview,
  startPreview,
  stopPreview,
} from "../../ipc/preview";
import type {
  PreviewInspection,
  PreviewStatus,
  PreviewTarget,
} from "../../previewTypes";
import {
  preferredTarget,
  savePreferredTarget,
} from "../../lib/previewPersistence";
import { usePreviewStatusPolling } from "./usePreviewStatusPolling";

const idleStatus = (targetId = ""): PreviewStatus => ({
  phase: "idle",
  targetId,
  url: null,
  command: null,
  logs: [],
  error: null,
});

function errorStatus(targetId: string, error: unknown): PreviewStatus {
  return {
    ...idleStatus(targetId),
    phase: "failed",
    error: String(error).replace(/^Error:\s*/, ""),
  };
}

export function useProjectPreview(projectId: string, root: string) {
  const [inspection, setInspection] = useState<PreviewInspection | null>(null);
  const [targetId, setTargetId] = useState("");
  const [statuses, setStatuses] = useState<Record<string, PreviewStatus>>({});
  const [inspecting, setInspecting] = useState(true);
  const request = useRef(0);
  const lifecycle = useRef(0);
  const targetRequests = useRef<Record<string, number>>({});
  const detectedTargets = useRef(new Set<string>());

  const rememberStatus = useCallback((next: PreviewStatus) => {
    setStatuses((current) => ({ ...current, [next.targetId]: next }));
  }, []);

  const hydrateStatuses = useCallback((targets: PreviewTarget[]) => {
    const instance = lifecycle.current;
    const pending = targets.map((target) => ({
      id: target.id,
      version: targetRequests.current[target.id] ?? 0,
      status: getPreviewStatus(root, target.id),
    }));
    void Promise.allSettled(pending.map((entry) => entry.status)).then((results) => {
      if (lifecycle.current !== instance) return;
      results.forEach((result, index) => {
        const { id, version } = pending[index];
        if (
          result.status === "fulfilled" &&
          detectedTargets.current.has(id) &&
          (targetRequests.current[id] ?? 0) === version
        ) {
          rememberStatus(result.value);
        }
      });
    });
  }, [rememberStatus, root]);

  const selectTarget = useCallback(
    async (nextId: string) => {
      request.current += 1;
      const instance = lifecycle.current;
      const version = targetRequests.current[nextId] ?? 0;
      setTargetId(nextId);
      setInspecting(false);
      savePreferredTarget(projectId, nextId);
      try {
        const next = await getPreviewStatus(root, nextId);
        if (
          lifecycle.current === instance &&
          (targetRequests.current[nextId] ?? 0) === version
        ) {
          rememberStatus(next);
        }
      } catch (error) {
        if (
          lifecycle.current === instance &&
          (targetRequests.current[nextId] ?? 0) === version
        ) {
          rememberStatus(errorStatus(nextId, error));
        }
      }
    },
    [projectId, rememberStatus, root],
  );

  const inspect = useCallback(async () => {
    const generation = ++request.current;
    setInspecting(true);
    try {
      const next = await inspectPreview(root);
      if (request.current !== generation) return;
      setInspection(next);
      detectedTargets.current = new Set(next.targets.map((target) => target.id));
      const saved = preferredTarget(projectId);
      const selected =
        next.targets.find((target) => target.id === saved) ??
        next.targets.find((target) => target.runnable) ??
        next.targets[0];
      setInspecting(false);
      if (selected) {
        setTargetId(selected.id);
        savePreferredTarget(projectId, selected.id);
      }
      hydrateStatuses(next.targets);
    } catch (error) {
      if (request.current !== generation) return;
      setInspection(null);
      detectedTargets.current.clear();
      setTargetId("");
      setInspecting(false);
      rememberStatus(errorStatus("", error));
    }
  }, [hydrateStatuses, projectId, rememberStatus, root]);

  useEffect(() => {
    void inspect();
    return () => {
      request.current += 1;
      lifecycle.current += 1;
    };
  }, [inspect]);

  usePreviewStatusPolling(root, statuses, targetRequests, rememberStatus);

  const start = useCallback(async () => {
    if (!targetId) return;
    const instance = lifecycle.current;
    const version = (targetRequests.current[targetId] ?? 0) + 1;
    targetRequests.current[targetId] = version;
    rememberStatus({
      ...(statuses[targetId] ?? idleStatus(targetId)),
      phase: "starting",
      error: null,
    });
    try {
      const next = await startPreview(root, targetId);
      if (lifecycle.current === instance && targetRequests.current[targetId] === version) {
        rememberStatus(next);
      }
    } catch (error) {
      if (lifecycle.current === instance && targetRequests.current[targetId] === version) {
        rememberStatus(errorStatus(targetId, error));
      }
    }
  }, [rememberStatus, root, statuses, targetId]);

  const stop = useCallback(async () => {
    if (!targetId) return;
    const instance = lifecycle.current;
    const version = (targetRequests.current[targetId] ?? 0) + 1;
    targetRequests.current[targetId] = version;
    try {
      const next = await stopPreview(root, targetId);
      if (lifecycle.current === instance && targetRequests.current[targetId] === version) {
        rememberStatus(next);
      }
    } catch (error) {
      if (lifecycle.current === instance && targetRequests.current[targetId] === version) {
        rememberStatus(errorStatus(targetId, error));
      }
    }
  }, [rememberStatus, root, targetId]);

  const target: PreviewTarget | null =
    inspection?.targets.find((candidate) => candidate.id === targetId) ?? null;
  const status = targetId
    ? statuses[targetId] ?? idleStatus(targetId)
    : statuses[""] ?? idleStatus();

  return {
    inspection,
    target,
    targetId,
    status,
    statuses,
    inspecting,
    inspect,
    selectTarget,
    start,
    stop,
  };
}
