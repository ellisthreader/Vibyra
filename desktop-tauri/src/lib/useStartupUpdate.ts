import { useCallback, useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";

import { useUpdateStore } from "../state/updateStore";
import type { StartupUpdatePhase } from "./startupUpdatePolicy";
import { NO_PROGRESS, type UpdateProgress } from "./updatePolicy";

const STARTUP_CHECK_TIMEOUT_MS = 8_000;
const MINIMUM_STARTUP_DWELL_MS = 600;
const RELAUNCH_HANDOFF_GRACE_MS = 3_000;
const RELAUNCH_FALLBACK_ERROR =
  "The update was installed, but Vibyra could not restart. Close and reopen it to finish.";

type RetryStage = "check" | "download" | "install" | "relaunch";

export interface StartupUpdateState {
  phase: StartupUpdatePhase;
  complete: boolean;
  version: string;
  progress: UpdateProgress;
  error: string | null;
  retry: () => void;
  continueToApp: () => void;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs the packaged-app update preflight before auth or the workspace mounts. */
export function useStartupUpdate(): StartupUpdateState {
  const development = import.meta.env.DEV;
  const version = useUpdateStore((state) => state.version);
  const progress = useUpdateStore((state) => state.progress);
  const [phase, setPhase] = useState<StartupUpdatePhase>(
    development ? "current" : "checking",
  );
  const [complete, setComplete] = useState(development);
  const [failure, setFailure] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const runningRef = useRef(false);
  const failedStageRef = useRef<RetryStage>("check");
  const startedAtRef = useRef(Date.now());

  const fail = useCallback((stage: RetryStage, fallback: string): void => {
    if (!mountedRef.current) return;
    const store = useUpdateStore.getState();
    failedStageRef.current = stage;
    setFailure(store.error ?? store.checkError ?? fallback);
    setPhase("failed");
  }, []);

  const run = useCallback(
    async (startAt: RetryStage): Promise<void> => {
      if (runningRef.current) return;
      runningRef.current = true;
      if (mountedRef.current) {
        setComplete(false);
        setFailure(null);
      }

      try {
        if (startAt === "relaunch") {
          if (mountedRef.current) setPhase("installing");
          try {
            await relaunch();
          } catch (error) {
            fail("relaunch", String(error));
            return;
          }
          await wait(RELAUNCH_HANDOFF_GRACE_MS);
          fail("relaunch", RELAUNCH_FALLBACK_ERROR);
          return;
        }

        let stage = startAt;
        if (stage === "check") {
          if (mountedRef.current) setPhase("checking");
          const checked = await useUpdateStore.getState().check(STARTUP_CHECK_TIMEOUT_MS);
          if (!mountedRef.current) return;
          const store = useUpdateStore.getState();
          if (!checked || store.checkState === "failed") {
            fail("check", "The update service could not be reached.");
            return;
          }
          if (store.status === "idle") {
            setPhase("current");
            const elapsed = Date.now() - startedAtRef.current;
            await wait(Math.max(0, MINIMUM_STARTUP_DWELL_MS - elapsed));
            if (mountedRef.current) setComplete(true);
            return;
          }
          stage = "download";
        }

        if (stage === "download") {
          if (mountedRef.current) setPhase("downloading");
          const downloaded = await useUpdateStore.getState().download();
          if (!mountedRef.current) return;
          if (!downloaded) {
            fail("download", "The update could not be downloaded.");
            return;
          }
        }

        setPhase("installing");
        const installed = await useUpdateStore.getState().installAtStartup();
        if (mountedRef.current && !installed) {
          fail("install", "The update could not be installed.");
          return;
        }
        if (installed) {
          // A successful install exits or relaunches this process. Tauri
          // normally terminates before this can render; if its handoff ever
          // returns without exiting, do not strand the user here forever.
          await wait(RELAUNCH_HANDOFF_GRACE_MS);
          fail("relaunch", RELAUNCH_FALLBACK_ERROR);
        }
      } finally {
        runningRef.current = false;
      }
    },
    [fail],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!development) void run("check");
    return () => {
      mountedRef.current = false;
    };
  }, [development, run]);

  const retry = useCallback((): void => {
    if (phase === "failed") void run(failedStageRef.current);
  }, [phase, run]);

  const continueToApp = useCallback((): void => {
    if (phase !== "failed" || runningRef.current) return;
    if (failedStageRef.current === "relaunch") {
      // `installAtStartup()` completed, so its pending handle is spent. Only
      // normalize on the explicit continue path; retry still relaunches the
      // installed build without downloading it again.
      useUpdateStore.setState({
        status: "idle",
        version: "",
        notes: "",
        progress: NO_PROGRESS,
        error: null,
      });
    }
    setComplete(true);
  }, [phase]);

  return { phase, complete, version, progress, error: failure, retry, continueToApp };
}
