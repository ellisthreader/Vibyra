import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

import { ReportModal } from "../src/components/report/ReportModal";
import { emptyDraft } from "../src/lib/reportDraft";
import { useReportStore } from "../src/state/reportStore";
import type { ReportSurroundings } from "../src/lib/reportContext";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.has("light") ? "light" : "dark";
mockWindows("main");
mockIPC(() => null);

const surroundings: ReportSurroundings = {
  area: "Terminal pane",
  sessionId: 23,
  paneName: "Development server",
  context: {
    appVersion: "0.7.9 (build 9)",
    platform: "macOS",
    renderer: "WebKit",
    view: "terminals",
    project: "Studio",
    projectRoot: "/Users/example/Studio",
    agent: "Codex",
    model: "GPT",
    pane: "Development server",
    reporter: "Example (example@example.test)",
    hardware: null,
    ip: null,
    locale: "en-GB",
    screen: "1280×800 @ 2x",
  },
};

useReportStore.setState({
  open: true,
  draft: emptyDraft(surroundings.area),
  surroundings,
  channelReady: true,
  recentErrors: ["Terminal failed to start: process exited"],
  status: "idle",
});

Object.assign(window, {
  attachReportScreenshot: () => useReportStore.getState().patch({
    screenshot: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#334466"/></svg>')}`,
  }),
});

createRoot(document.getElementById("root")!).render(
  <>
    <main style={{ padding: 32, color: "var(--muted)" }}>Studio workspace</main>
    <ReportModal />
  </>,
);
