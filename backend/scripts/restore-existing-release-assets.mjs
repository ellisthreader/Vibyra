import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const assets = [{"path": "public/media/hero-scroll.mp4", "url": "https://vibyra-production.up.railway.app/media/hero-scroll.mp4", "sha256": "4c9de13be1899221b79072ce202bb533345e14d667a095d0af72d4a3e8f017de"}, {"path": "public/media/vibyra-film.mp4", "url": "https://vibyra-production.up.railway.app/media/vibyra-film.mp4", "sha256": "ddfa78b236fc4f0c5e0a9e0de5e3a2b904817893784f3429d1bd3794a5535273"}, {"path": "public/media/vibyra-launch-film.mp4", "url": "https://vibyra-production.up.railway.app/media/vibyra-launch-film.mp4", "sha256": "d25e8598dcbb347c94b00ae0fb37dcdb9e03cfa2882281764c4604736df6a7af"}];
for (const asset of assets) {
 let existing;
 try { existing = await readFile(asset.path); } catch {}
 const matches = data => createHash('sha256').update(data).digest('hex') === asset.sha256;
 if (existing && matches(existing)) continue;
 const response = await fetch(asset.url, { signal: AbortSignal.timeout(120000) });
 if (!response.ok) throw new Error(`Asset restore failed: ${asset.path} HTTP ${response.status}`);
 const data = Buffer.from(await response.arrayBuffer());
 if (!matches(data)) throw new Error(`Asset restore checksum mismatch: ${asset.path}`);
 await mkdir(dirname(asset.path), { recursive: true });
 await writeFile(asset.path, data);
 console.log(`Restored verified existing asset: ${asset.path}`);
}
