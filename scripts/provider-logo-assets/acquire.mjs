import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_LOGO_SOURCES } from "./manifest.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const sourceDir = path.join(repoRoot, "desktop/assets/provider-logos/sources");
const metadataPath = path.join(repoRoot, "desktop/assets/provider-logos/source-metadata.json");

await mkdir(sourceDir, { recursive: true });

const metadata = {};
for (const [provider, source] of Object.entries(PROVIDER_LOGO_SOURCES)) {
  const response = await fetch(source.assetUrl, {
    headers: { "user-agent": "Vibyra provider logo asset builder" }
  });
  if (!response.ok) throw new Error(`${provider}: ${response.status} ${source.assetUrl}`);

  const svg = normalizeSvg(await response.text());
  if (!svg.includes("<svg") || !svg.includes("</svg>")) {
    throw new Error(`${provider}: downloaded asset is not a complete SVG`);
  }

  const bytes = Buffer.from(svg);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path.join(sourceDir, `${provider}.svg`), bytes);
  metadata[provider] = { ...source, file: `sources/${provider}.svg`, sha256 };
}

await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Acquired ${Object.keys(metadata).length} provider logo sources.`);

function normalizeSvg(value) {
  return String(value).replace(/\r\n/g, "\n").trim() + "\n";
}
