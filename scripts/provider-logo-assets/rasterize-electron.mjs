import { app, BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath, sizeArg] = process.argv.slice(-3);
const size = Number(sizeArg);
if (!inputPath || !outputPath || !Number.isInteger(size)) {
  console.error("Usage: electron rasterize-electron.mjs INPUT_JSON OUTPUT_JSON SIZE");
  process.exit(1);
}

app.whenReady().then(run).catch(fail);

async function run() {
  let window;
  try {
    const sources = JSON.parse(await readFile(inputPath, "utf8"));
    window = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    await window.loadURL("data:text/html,<canvas id=c></canvas>");

    const results = {};
    for (const [provider, svg] of Object.entries(sources)) {
      results[provider] = await window.webContents.executeJavaScript(rasterScript(svg, size));
    }
    await writeFile(outputPath, JSON.stringify(results));
    window.destroy();
    app.exit(0);
  } catch (error) {
    window?.destroy();
    fail(error);
  }
}

function rasterScript(svg, size) {
  return `(async () => {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("SVG image decode failed"));
      setTimeout(() => reject(new Error("SVG image decode timed out")), 5000);
    });
    image.src = "data:image/svg+xml;base64,${Buffer.from(svg.replace(/currentColor/g, "#FFFFFF")).toString("base64")}";
    await loaded;
    const canvas = document.getElementById("c");
    canvas.width = ${size};
    canvas.height = ${size};
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, ${size}, ${size});
    const padding = 3;
    const scale = Math.min((${size} - padding * 2) / image.naturalWidth, (${size} - padding * 2) / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (${size} - width) / 2, (${size} - height) / 2, width, height);
    const rgba = context.getImageData(0, 0, ${size}, ${size}).data;
    let binary = "";
    for (let index = 0; index < rgba.length; index += 0x8000) {
      binary += String.fromCharCode(...rgba.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  })()`;
}

function fail(error) {
  console.error(error);
  app.exit(1);
}
