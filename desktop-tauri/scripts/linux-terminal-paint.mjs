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
  const context = await driver.execute(`const row = document.querySelector('.pane .xterm-cursor')?.closest('.xterm-rows > div');
    if (!row) throw new Error('No visible DOM terminal cursor row');
    const rect = document.querySelector('.pane .xterm-screen').getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    window.__typingKeys = []; window.__typingPaint = [];
    const stamp = () => performance.timeOrigin + performance.now();
    if (window.__typingKeyListener) document.removeEventListener('keydown', window.__typingKeyListener, true);
    window.__typingKeyListener = event => window.__typingKeys.push({ key: event.key, at: stamp() });
    document.addEventListener('keydown', window.__typingKeyListener, true);
    window.__typingObserver?.disconnect();
    window.__typingObserver = new MutationObserver(() => window.__typingPaint.push({ at: stamp(),
      text: document.querySelector('.pane .xterm-rows')?.textContent }));
    window.__typingObserver.observe(document.querySelector('.pane .xterm-rows'), { subtree: true, childList: true, characterData: true });
    return { hidden: document.hidden, mode: document.documentElement.dataset.performance || 'full',
      canvasCount: document.querySelectorAll('.pane .xterm-screen canvas').length,
      rowRect: { x: rowRect.x, y: rowRect.y, width: rowRect.width, height: rowRect.height },
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
  frames.push({ expected: marker, capturedAt: Date.now(), path: await capture("settled") });
  context.pty = await snapshot();
  context.after = await driver.execute(`return { mutations: window.__typingPaint, keys: window.__typingKeys, hidden: document.hidden,
    rows: [...document.querySelectorAll('.pane .xterm-rows > div')].map(row => row.textContent) };`);
  // Compare the typed cells with a fully rendered reference. OCR alone can
  // confuse a lone Q with O or the block cursor with a letter.
  const rowText = context.after.rows.find(text => text.includes(marker));
  if (!rowText) throw new Error(`${phase}: DOM never received the complete marker`);
  const cellWidth = context.rowRect.width / context.terminals.find(terminal => terminal.visibility === "visible").cols;
  const markerX = Math.round(context.rowRect.x - x + rowText.indexOf(marker) * cellWidth);
  const rowY = Math.round(context.rowRect.y - y);
  const rowHeight = Math.floor(context.rowRect.height);
  const rowCrop = `${Math.floor(width)}x${rowHeight}+0+${rowY}`;
  await delay(300);
  const reference = await capture("reference");
  writeFileSync(join(folder, "evidence.json"), JSON.stringify({ context, frames, reference }, null, 2));
  const referenceOcr = reference.replace(/\.png$/, "-ocr.png");
  await run("convert", [reference, "+repage", "-crop", rowCrop, "+repage", "-negate", "-resize", "300%", referenceOcr]);
  const referenceText = (await run("tesseract", [referenceOcr, "stdout", "--psm", "6"])).stdout;
  if (!referenceText.replace(/\s/g, "").toUpperCase().includes(marker)) throw new Error("Reference screen does not show the complete marker");
  const failures = [];
  const earlyCaptures = [];
  for (const frame of frames) {
    const key = context.after.keys.find(event => event.key === frame.expected.at(-1));
    if (!key) throw new Error(`No native keydown recorded for ${frame.expected}`);
    frame.keyReceivedAt = key.at;
    frame.capturedAfterKeyMs = frame.capturedAt - key.at;
    const ocrPath = frame.path.replace(/\.png$/, "-ocr.png");
    await run("convert", [frame.path, "+repage", "-crop", rowCrop, "+repage", "-negate", "-resize", "300%", ocrPath]);
    frame.text = (await run("tesseract", [ocrPath, "stdout", "--psm", "6"], { maxBuffer: 1024 * 1024 })).stdout;
    const region = `${Math.round(frame.expected.length * cellWidth)}x${rowHeight}+${markerX}+${rowY}`;
    const sample = frame.path.replace(/\.png$/, "-cells.png");
    const expected = frame.path.replace(/\.png$/, "-expected.png");
    await run("convert", [frame.path, "+repage", "-crop", region, "+repage", sample]);
    await run("convert", [reference, "+repage", "-crop", region, "+repage", expected]);
    for (const cropped of [sample, expected]) {
      const dimensions = (await run("identify", ["-format", "%w %h", cropped])).stdout;
      if (dimensions !== `${Math.round(frame.expected.length * cellWidth)} ${rowHeight}`) {
        throw new Error(`Invalid glyph crop ${dimensions}: ${cropped}`);
      }
    }
    try {
      await run("compare", ["-metric", "AE", sample, expected, "null:"]);
      frame.differentPixels = 0;
    } catch (error) {
      if (error.code !== 1) throw error;
      frame.differentPixels = Number(error.stderr.trim());
      // OS injection can queue before WebKit receives it. A capture within
      // three 60 Hz frames of keydown cannot judge an 80 ms paint deadline.
      if (frame.capturedAfterKeyMs < 50) earlyCaptures.push(frame);
      else failures.push(frame);
    }
  }
  writeFileSync(join(folder, "evidence.json"), JSON.stringify({ context, frames, failures, earlyCaptures }, null, 2));
  await run("xdotool", ["key", "ctrl+u"]);
  await delay(300);
  if (earlyCaptures.length > 2) throw new Error(`${phase}: native input delivery was too late to measure paint reliably`);
  if (failures.length) failedProbes.push(`${phase}: ${failures.length} stale or unreadable frames`);
  if (phase === "cat" && failedProbes.length) throw new Error(`${failedProbes.join("; ")}; see ${output}`);
  return marker;
}
