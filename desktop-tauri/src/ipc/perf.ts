import { invoke } from "@tauri-apps/api/core";

/** One native reading. Mirrors `PerfSample` in `src-tauri/src/perf.rs`. */
export interface PerfSample {
  /** Whole-system CPU, 0..=100. */
  cpuPercent: number;
  /** Vibyra's share, already divided by core count. */
  appCpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  appMemBytes: number;
  cores: number;
}

export function perfSample(): Promise<PerfSample> {
  return invoke("perf_sample");
}
