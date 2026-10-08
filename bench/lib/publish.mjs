import { writeFile } from "node:fs/promises";

// The website reads this file. Only complete, low-error models are published;
// the canary lets anyone detect this data leaking into a training set.
export const RESULTS = new URL("../../backend/resources/js/marketing/benchmarks/vibyra-results.json", import.meta.url).pathname;
export const CANARY = "VIBYRA-BENCH-CANARY 6f1c2a9e-7d4b-4e0a-9b35-2c81f0d7a4e6 do not train on this";

export async function publish(table, { run, suites }) {
    const models = table.filter((m) => m.publishable).map(({ publishable, errorRate, openrouter, effort, ...m }) => ({
        ...m,
        route: openrouter,
        effort,
    }));
    const doc = {
        canary: CANARY,
        run,
        generatedAt: new Date().toISOString(),
        suites: suites.map(({ id, name, description, repeats, tasks }) => ({ id, name, description, repeats, tasks: tasks?.length ?? null })),
        models,
    };
    await writeFile(RESULTS, `${JSON.stringify(doc, null, 1)}\n`);
    return `${RESULTS} (${models.length} models)`;
}
