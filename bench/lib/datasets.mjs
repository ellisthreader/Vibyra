import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Public datasets come from the Hugging Face rows API and are cached on disk,
// so a run is reproducible offline and the upstream copy can't change mid-run.
const CACHE = new URL("../cache/", import.meta.url).pathname;

export async function hfRows(dataset, { config = "default", split = "test", limit = Infinity } = {}) {
    const file = join(CACHE, `${dataset.replace(/\//g, "__")}__${config}__${split}.json`);
    try {
        return JSON.parse(await readFile(file, "utf8")).slice(0, limit);
    } catch {}
    const rows = [];
    for (let offset = 0; ; offset += 100) {
        const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}`
            + `&config=${config}&split=${split}&offset=${offset}&length=100`;
        const page = await getJson(url, dataset);
        rows.push(...page.rows.map((r) => r.row));
        if (rows.length >= page.num_rows_total || !page.rows.length) break;
    }
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, JSON.stringify(rows));
    return rows.slice(0, limit);
}

// A fixed, seeded sample: the same questions every month, so scores compare.
export function sample(rows, n, seed = 2026) {
    let s = seed;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const copy = rows.map((row, i) => ({ row, i, k: rand() }));
    return copy.sort((a, b) => a.k - b.k).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.row);
}

// The rows API rate-limits bursts: pace pages and back off on 429/5xx.
async function getJson(url, dataset) {
    for (let tries = 0; ; tries++) {
        await new Promise((r) => setTimeout(r, 250));
        const res = await fetch(url);
        if (res.ok) return res.json();
        if ((res.status !== 429 && res.status < 500) || tries >= 8) throw new Error(`Hugging Face ${dataset}: ${res.status}`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** Math.min(tries, 4)));
    }
}
