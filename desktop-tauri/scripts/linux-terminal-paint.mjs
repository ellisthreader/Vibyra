import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Type at a human cadence without polling the PTY or webview between keys.
// This separates an actual display delay from test-induced IPC contention.
export async function probePaint(driver, output, snapshot) {
  const marker = "vibyrapaint123456789";
  for (const key of marker) {
    await driver.keyboard(key);
    await delay(50);
  }
  writeFileSync(join(output, "terminal-paint-50ms.png"), await driver.screenshot());
  writeFileSync(join(output, "terminal-paint-pty-after-first-frame.json"), JSON.stringify({ snapshot: await snapshot() }, null, 2));
  await delay(100);
  writeFileSync(join(output, "terminal-paint-150ms.png"), await driver.screenshot());
  await delay(400);
  writeFileSync(join(output, "terminal-paint-550ms.png"), await driver.screenshot());
  return marker;
}
