import { useCallback, useEffect, useRef, useState } from "react";
import { cloudPage } from "../../../ipc/cloudPage";
import { cloudSync } from "../../../ipc/cloudSync";
import { cloudMoving, overviewRows } from "../../../lib/cloudOverview";
import type { CloudOverview } from "../../../lib/cloudOverviewTypes";
import type { SyncStatus } from "../../../lib/cloudSyncClient";
import { connectError } from "../../../lib/cloudTab";
import { readCloudScope, useCloudAvailability } from "../../../state/cloudAvailability";

/** One read at a time; a mutation invalidates every read started before it. Nothing polls while the page is hidden. */
export function useCloudPage() {
  const scope = useCloudAvailability();
  const [overview, setOverview] = useState<CloudOverview | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => !document.hidden);
  const live = useRef(true), reading = useRef(false), acting = useRef(false), revision = useRef(0);
  const state = useRef({ overview, sync }); state.current = { overview, sync };
  const reschedule = useRef<(value: { overview: CloudOverview; sync: SyncStatus }) => void>(() => {});
  const current = useCallback(() => live.current && scope !== null && readCloudScope() === scope, [scope]);
  const refresh = useCallback(async () => {
    if (!current() || reading.current || acting.current || document.hidden) return;
    reading.current = true;
    const version = revision.current;
    try {
      const [nextOverview, nextSync] = await Promise.all([cloudPage.read(), cloudSync.status()]);
      if (current() && version === revision.current) {
        setOverview(nextOverview); setSync(nextSync); setError("");
        return { overview: nextOverview, sync: nextSync };
      }
    } catch (cause) {
      if (current() && version === revision.current) setError(connectError(cause));
    } finally { reading.current = false; }
  }, [current]);
  useEffect(() => {
    live.current = true;
    let timer = 0, generation = 0;
    const queue = (owner: number, snapshot: typeof state.current) => {
      const moving = snapshot.overview && snapshot.sync && overviewRows(snapshot.overview, snapshot.sync).some(cloudMoving);
      timer = window.setTimeout(() => void poll(owner), moving || snapshot.overview?.computer?.chip === "starting" ? 3_000 : 15_000);
    };
    const poll = async (owner: number) => {
      const next = await refresh();
      if (!current() || owner !== generation || document.hidden) return;
      queue(owner, next ?? state.current);
    };
    reschedule.current = next => {
      generation++; window.clearTimeout(timer);
      if (current() && !document.hidden) queue(generation, next);
    };
    const visibility = () => {
      setVisible(!document.hidden); generation++; window.clearTimeout(timer);
      if (!document.hidden) void poll(generation);
    };
    void poll(generation);
    document.addEventListener("visibilitychange", visibility);
    return () => { live.current = false; reschedule.current = () => {}; generation++; revision.current++; window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [current, refresh]);
  const run = useCallback(async <T,>(key: string, operation: () => Promise<T>): Promise<T | null> => {
    if (!current() || acting.current) return null;
    acting.current = true; revision.current++; setBusy(key); setError("");
    try {
      const value = await operation();
      if (!current()) return null;
      return value;
    } catch (cause) {
      if (current()) setError(connectError(cause));
      return null;
    } finally {
      acting.current = false;
      if (current()) setBusy(null);
    }
  }, [current]);
  const change = useCallback(async (key: string, operation: () => Promise<CloudOverview | SyncStatus>) => {
    const next = await run(key, async () => {
      const changed = await operation();
      if (!current()) return null;
      // Reconcile the complementary side after the write, never a GET started before it.
      return "gate" in changed ? { sync: changed, overview: await cloudPage.read() }
        : { overview: changed, sync: await cloudSync.status() };
    });
    if (!next || !current()) return false;
    setSync(next.sync); setOverview(next.overview);
    reschedule.current(next);
    return true;
  }, [current, run]);
  return { scope, current, overview, sync, error, busy, visible, refresh, run, change };
}
export type CloudPageController = ReturnType<typeof useCloudPage>;
