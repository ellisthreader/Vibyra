const {
  mkdir: defaultMkdir,
  readFile: defaultReadFile,
  writeFile: defaultWriteFile
} = require("node:fs/promises");
const { basename, join, resolve, sep } = require("node:path");

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_PNG_BYTES = 100 * 1024 * 1024;

function createDesktopScreenshot(dependencies) {
  const {
    clipboard,
    desktopCapturer,
    dialog,
    globalShortcut,
    nativeImage,
    screen,
    getParentWindow = () => undefined,
    getScreenshotsDirectory = () => "",
    mkdir = defaultMkdir,
    now = () => new Date(),
    readFile = defaultReadFile,
    screenAccessStatus = () => "granted",
    writeFile = defaultWriteFile,
    onShortcutError = (error) => console.error("Screenshot shortcut failed:", error)
  } = dependencies;
  let shortcutRegistered = false;

  function selectDisplayUnderCursor() {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    if (!display) throw new Error("No display was found under the cursor.");
    return display;
  }

  async function captureDisplay(display = selectDisplayUnderCursor()) {
    const access = screenAccessStatus();
    if (["denied", "restricted"].includes(access)) {
      throw new Error("Allow Vibyra in macOS System Settings > Privacy & Security > Screen Recording, then restart Vibyra.");
    }
    const scaleFactor = Number(display.scaleFactor) || 1;
    const thumbnailSize = {
      width: Math.max(1, Math.round(display.size.width * scaleFactor)),
      height: Math.max(1, Math.round(display.size.height * scaleFactor))
    };
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize,
      fetchWindowIcons: false
    });
    const source = sources.find((candidate) => (
      String(candidate.display_id) === String(display.id)
    )) || (sources.length === 1 ? sources[0] : null);
    if (!source) throw new Error(`Unable to capture display ${display.id}.`);
    if (source.thumbnail.isEmpty?.()) {
      throw new Error(`Display ${display.id} returned an empty screenshot.`);
    }
    return {
      dataUrl: `${PNG_DATA_URL_PREFIX}${source.thumbnail.toPNG().toString("base64")}`,
      display
    };
  }

  function copyPngDataUrl(dataUrl) {
    assertPngDataUrl(dataUrl);
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty?.()) throw new Error("The screenshot PNG could not be decoded.");
    clipboard.writeImage(image);
    return dataUrl;
  }

  async function copySavedScreenshot(filePath) {
    const directory = resolve(getScreenshotsDirectory());
    const target = resolve(String(filePath || ""));
    if (!target.startsWith(`${directory}${sep}`)) {
      throw new Error("The screenshot file is outside the Vibyra screenshot library.");
    }
    const png = await readFile(target);
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty?.()) throw new Error("The saved screenshot PNG could not be decoded.");
    clipboard.write({
      image,
      text: shellQuotedPath(target)
    });
    return target;
  }

  async function captureAndCopy() {
    const capture = await captureDisplay();
    copyPngDataUrl(capture.dataUrl);
    return capture;
  }

  async function savePngDataUrl(dataUrl) {
    const png = pngBuffer(dataUrl);
    const directory = getScreenshotsDirectory();
    if (!directory) throw new Error("The Vibyra screenshot folder is unavailable.");
    await mkdir(directory, { recursive: true });
    const filePath = join(directory, timestampedPngName(now()));
    await writeFile(filePath, png);
    return savedScreenshot(filePath, png);
  }

  function savedScreenshot(filePath, png, modifiedAt = now().getTime()) {
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty?.()) throw new Error("The saved screenshot PNG could not be decoded.");
    const size = image.getSize();
    const thumbnail = image.resize({
      width: Math.min(320, size.width),
      quality: "good"
    });
    return {
      filePath,
      name: basename(filePath),
      modifiedAt,
      thumbnailDataUrl: thumbnail.toDataURL()
    };
  }

  function registerF9Shortcut(handler = captureAndCopy) {
    if (shortcutRegistered) return true;
    shortcutRegistered = globalShortcut.register("F9", () => {
      Promise.resolve().then(handler).catch(onShortcutError);
    });
    return shortcutRegistered;
  }

  function unregisterF9Shortcut() {
    if (!shortcutRegistered) return;
    globalShortcut.unregister("F9");
    shortcutRegistered = false;
  }

  return {
    captureAndCopy,
    captureDisplay,
    copyPngDataUrl,
    copySavedScreenshot,
    registerF9Shortcut,
    savePngDataUrl,
    selectDisplayUnderCursor,
    unregisterF9Shortcut
  };
}

function shellQuotedPath(filePath) {
  return `'${String(filePath).replace(/'/g, `'\\''`)}'`;
}

function assertPngDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new TypeError("Expected a base64 PNG data URL.");
  }
  const encoded = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new TypeError("Expected a valid base64 PNG data URL.");
  }
  if (Math.floor(encoded.length * 3 / 4) > MAX_PNG_BYTES) {
    throw new RangeError("The screenshot PNG is too large.");
  }
}

function pngBuffer(dataUrl) {
  assertPngDataUrl(dataUrl);
  return Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), "base64");
}

function timestampedPngName(date) {
  const stamp = date.toISOString().replace(/[.:T]/g, "-");
  return `Vibyra-Screenshot-${stamp}.png`;
}

module.exports = { createDesktopScreenshot, shellQuotedPath, timestampedPngName };
