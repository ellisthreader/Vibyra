const values = new Map();
const sent = new Set();
let send = () => {};
let clsValue = 0;

function remember(name, value) {
  if (Number.isFinite(value) && value >= 0 && value <= 120000) {
    values.set(name, Math.round(value));
  }
}

export function flushWebsiteVitals(names = null) {
  for (const [name, value] of values) {
    if (names && !names.includes(name)) continue;
    if (sent.has(name)) continue;
    if (send(name, value)) sent.add(name);
  }
}

export function initWebsiteVitals(onMetric) {
  send = onMetric;
  const navigation = performance.getEntriesByType("navigation")[0];
  if (navigation) remember("ttfb", navigation.responseStart);
  if (typeof PerformanceObserver === "function") {
    for (const [type, callback] of [
      ["largest-contentful-paint", (entry) => remember("lcp", entry.startTime)],
      ["layout-shift", (entry) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          remember("cls", clsValue * 1000);
        }
      }],
      ["event", (entry) => {
        if (entry.interactionId) remember("inp", Math.max(values.get("inp") || 0, entry.duration));
      }],
    ]) {
      try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback));
        observer.observe({ type, buffered: true, durationThreshold: type === "event" ? 40 : undefined });
      } catch { /* The browser does not support this metric. */ }
    }
  }
  window.addEventListener("pagehide", () => flushWebsiteVitals());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWebsiteVitals();
  });
  window.setTimeout(() => flushWebsiteVitals(["ttfb", "lcp"]), 30000);
}
