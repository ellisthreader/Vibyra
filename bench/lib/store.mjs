import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

// Every graded attempt is one JSON line. Re-running a run skips lines already
// written, so a crash or a budget stop never pays for the same call twice.
export async function openRun(path) {
    await mkdir(dirname(path), { recursive: true });
    const done = new Map();
    try {
        for (const line of (await readFile(path, "utf8")).split("\n")) {
            if (!line) continue;
            const row = JSON.parse(line);
            done.set(keyOf(row), row);
        }
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    return {
        rows: () => [...done.values()],
        has: (row) => done.has(keyOf(row)),
        async add(row) {
            done.set(keyOf(row), row);
            await appendFile(path, `${JSON.stringify(row)}\n`);
        },
    };
}

export const keyOf = ({ model, suite, task, attempt }) => `${model}|${suite}|${task}|${attempt}`;
