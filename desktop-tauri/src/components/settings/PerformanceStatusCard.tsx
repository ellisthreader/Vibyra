import { useEffect, useState } from "react";

import { perfSample, type PerfSample } from "../../ipc/perf";
import { rendererPolicy } from "../../ipc/render";
import { webglIsTrustworthy } from "../../lib/rendererPolicy";
import { useTerminalStore } from "../../state/terminalStore";
import type { RendererPolicy } from "../../types";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/** Frequent enough to feel live while the pane is open, rare enough that the
 * reading itself never becomes the load it reports. */
const POLL_MS = 4_000;

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

function gigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** A row, not a tile. Five tiles in an auto-fit grid wrapped 4 + 1 and left a
 * ragged hole; five rows in the shared group card line their numbers up. */
function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <SettingRow label={label} hint={detail}>
      <span className="settings-value settings-value--metric">{value}</span>
    </SettingRow>
  );
}

function graphicsValue(policy: RendererPolicy | null): string {
  if (!policy) return "—";
  return policy.softwareCompositing ? "CPU" : "GPU";
}

function graphicsDetail(policy: RendererPolicy | null): string | undefined {
  if (!policy) return undefined;
  const compositing = policy.softwareCompositing
    ? "Compatibility compositing"
    : "Accelerated compositing";
  const terminals = webglIsTrustworthy(policy) ? "WebGL terminals" : "safe terminal drawing";
  return `${compositing}, ${terminals}`;
}

/**
 * The numbers Vibyra already measures for its performance watchdog, finally on
 * screen: which rendering path is live, and what it costs right now. Polls
 * only while mounted, so an unopened Settings pane costs nothing.
 */
export function PerformanceStatusCard() {
  const [policy, setPolicy] = useState<RendererPolicy | null>(null);
  const [sample, setSample] = useState<PerfSample | null>(null);
  const streaming = useTerminalStore(
    (state) => state.panes.filter((pane) => state.activity[pane.id] === "working").length,
  );

  useEffect(() => {
    let cancelled = false;
    void rendererPolicy()
      .then((next) => {
        if (!cancelled) setPolicy(next);
      })
      .catch(() => {});
    const read = () =>
      void perfSample()
        .then((next) => {
          if (!cancelled) setSample(next);
        })
        .catch(() => {});
    read();
    const timer = window.setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <SettingsBlock label="Right now">
      <div className="settings-group">
        <Stat label="Graphics" value={graphicsValue(policy)} detail={graphicsDetail(policy)} />
        <Stat
          label="Vibyra CPU"
          value={percent(sample?.appCpuPercent)}
          detail="of the whole machine"
        />
        <Stat
          label="Renderer CPU"
          value={percent(sample?.rendererCpuPercent)}
          detail="of one core"
        />
        <Stat
          label="Memory"
          value={sample ? gigabytes(sample.appMemBytes) : "—"}
          detail={
            sample ? `machine ${gigabytes(sample.memUsedBytes)} of ${gigabytes(sample.memTotalBytes)}` : undefined
          }
        />
        <Stat
          label="Streaming panes"
          value={String(streaming)}
          detail="terminals producing output"
        />
      </div>
      <p className="settings-lead settings-lead--foot">
        High renderer CPU with several streaming panes is normal; high renderer CPU while
        everything is idle is not — check the graphics mode below.
      </p>
    </SettingsBlock>
  );
}
