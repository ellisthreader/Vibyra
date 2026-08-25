/** Shared PerfWindow fixture for the perf policy and guard suites. */
export function perfWindow(overrides = {}) {
  return {
    lagMs: 0,
    cpuPercent: 10,
    appCpuPercent: 5,
    rendererCpuPercent: 0,
    memRatio: 0.4,
    softwareCompositing: false,
    autoGraphics: true,
    acceleratedGraphics: false,
    nvidiaSession: false,
    graphicsSwitchAvailable: true,
    workingPanes: 0,
    ...overrides,
  };
}
