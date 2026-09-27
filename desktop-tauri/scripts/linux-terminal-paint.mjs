import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const failedProbes = [];

// Capture the X server, not WebDriver: requesting a webview screenshot can
// itself wake a stalled renderer. No webview IPC runs between the test keys.
export async function probePaint(driver, output, snapshot, phase = "cat") {
  const folder = join(output, `native-paint-${phase}`);
  mkdirSync(folder, { recursive: true });
  if (phase === "shell") await driver.keyboard("PS1='> '; clear\n");
  await delay(2_000); // Let the window resize and picker transition finish.
  const context = await driver.execute(`const rect = document.querySelector('.pane .xterm-screen').getBoundingClientRect();
    window.__typingKeys = []; window.__typingPaint = [];
    const stamp = () => performance.timeOrigin + performance.now();
    document.addEventListener('keydown', event => window.__typingKeys.push({ key: event.key, at: stamp() }), true);
    window.__typingObserver?.disconnect();
    window.__typingObserver = new MutationObserver(() => window.__typingPaint.push({ at: stamp(),
      text: document.querySelector('.pane .xterm-rows')?.textContent }));
    window.__typingObserver.observe(document.querySelector('.pane .xterm-rows'), { subtree: true, childList: true, characterData: true });
    return { hidden: document.hidden, mode: document.documentElement.dataset.performance || 'full',
      canvasCount: document.querySelectorAll('.pane .xterm-screen canvas').length,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };`);
  context.renderer = await driver.invoke("renderer_policy");
  context.version = await driver.invoke("plugin:app|version");
  const expectedVersion = process.env.VIBYRA_SMOKE_EXPECT_VERSION;
  if (expectedVersion && (context.version !== expectedVersion || !context.renderer.softwareCompositing)) {
    throw new Error(`Expected ${expectedVersion} with compatibility compositing: ${JSON.stringify(context)}`);
  }
  context.terminals = await driver.invoke("list_terminals");
  const { x, y, width, height } = context.rect;
  const crop = `${Math.floor(width)}x${Math.floor(height)}+${Math.floor(x)}+${Math.floor(y)}`;
  const capture = async name => {
    const path = join(folder, `${name}.png`);
    await run("import", ["-window", "root", "-crop", crop, path]);
    return path;
  };
  const marker = phase === "shell" ? "ABCDEFGH23456789" : "QRSTUVWX23456789";
  const frames = [];
  await run("xdotool", ["key", "ctrl+u"]);
  await delay(300);
  for (let index = 0; index < marker.length; index++) {
    await run("xdotool", ["type", "--clearmodifiers", "--delay", "0", marker[index]]);
    const sentAt = Date.now();
    await delay(80);
    frames.push({ expected: marker.slice(0, index + 1), sentAt, capturedAt: Date.now(), path: await capture(`key-${index + 1}`) });
    await delay(220);
    frames.push({ expected: marker.slice(0, index + 1), sentAt, capturedAt: Date.now(), path: await capture(`idle-${index + 1}`) });
  }
  await delay(1_000);
  frames.push({ expected: marker, path: await capture("settled") });
  context.pty = await snapshot();
  context.after = await driver.execute(`return { mutations: window.__typingPaint, keys: window.__typingKeys, hidden: document.hidden,
    rows: [...document.querySelectorAll('.pane .xterm-rows > div')].map(row => row.textContent) };`);
  const failures = [];
  for (const frame of frames) {
    const ocrPath = frame.path.replace(/\.png$/, "-ocr.png");
    await run("convert", [frame.path, "-negate", "-resize", "300%", ocrPath]);
    frame.text = (await run("tesseract", [ocrPath, "stdout", "--psm", "6"], { maxBuffer: 1024 * 1024 })).stdout;
    if (frame.expected.length >= 5 && !frame.text.replace(/\s/g, "").toUpperCase().includes(frame.expected)) failures.push(frame);
  }
  writeFileSync(join(folder, "evidence.json"), JSON.stringify({ context, frames, failures }, null, 2));
  await run("xdotool", ["key", "ctrl+u"]);
  await delay(300);
  if (failures.length) failedProbes.push(`${phase}: ${failures.length} stale or unreadable frames`);
  if (phase === "cat" && failedProbes.length) throw new Error(`${failedProbes.join("; ")}; see ${output}`);
  return marker;
}
