import { keyOf } from "./store.mjs";

// Runs every (model × task × attempt) once, a few at a time per model, with
// retries for rate limits and a hard spending cap across the whole run.
export async function run({ models, suites, repeats, complete, store, key, maxUsd, concurrency = 4, log = () => {} }) {
    let spent = store.rows().reduce((sum, r) => sum + (r.cost ?? 0), 0);
    let stopped = false;
    const jobs = [];
    for (const model of models) {
        for (const suite of suites) {
            for (const task of suite.tasks) {
                for (let attempt = 0; attempt < repeats; attempt++) {
                    const row = { model: model.id, suite: suite.id, task: task.id, attempt };
                    if (!store.has(row)) jobs.push({ model, suite, task, row });
                }
            }
        }
    }
    log(`${jobs.length} calls to make, $${spent.toFixed(2)} already spent`);
    const byModel = Map.groupBy(jobs, (j) => j.model.id);
    await Promise.all([...byModel.values()].map(async (queue) => {
        const workers = Array.from({ length: concurrency }, async () => {
            while (queue.length && !stopped) {
                const job = queue.shift();
                if (spent >= maxUsd) {
                    stopped = true;
                    log(`Stopped: spending cap of $${maxUsd} reached`);
                    return;
                }
                const row = await attemptJob(job, complete, key);
                spent += row.cost ?? 0;
                await store.add(row);
                log(`${keyOf(row)} → ${row.error ? `error: ${row.error}` : row.score} ($${spent.toFixed(2)})`);
            }
        });
        await Promise.all(workers);
    }));
    return { spent, stopped };
}

async function attemptJob({ model, suite, task, row }, complete, key) {
    for (let tries = 0; ; tries++) {
        try {
            const call = await complete({
                model: model.openrouter,
                effort: model.effort,
                messages: suite.messages(task, row.attempt),
                maxTokens: model.maxTokens,
                key,
            });
            const graded = await suite.grade(task, call.text, row.attempt);
            const { text, ...timing } = call;
            return { ...row, ...timing, score: graded.score, detail: graded.detail, answer: text.slice(-1500) };
        } catch (error) {
            // API failures retry (with backoff); a wrong answer is never retried.
            if (!error.retryable || tries >= 8) return { ...row, score: 0, error: error.message.slice(0, 300) };
            await new Promise((r) => setTimeout(r, 2000 * 2 ** tries));
        }
    }
}
