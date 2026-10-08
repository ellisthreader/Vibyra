import { bootstrap, bootstrapIndex, mean, median } from "./stats.mjs";

// Turns raw attempt rows into the published table: per-suite scores (0–100)
// with 95% intervals, the Vibyra Index, measured speed and cost, and a rank
// range so statistically tied models are shown as tied, not ordered.
export const MAX_ERROR_RATE = 0.02;

export function aggregate(rows, { roster, suites, indexSuites, pricing = {} }) {
    const models = roster.map((model) => {
        const mine = rows.filter((r) => r.model === model.id);
        if (!mine.length) return null;
        const errors = mine.filter((r) => r.error).length;
        const scores = {};
        const perSuite = {};
        for (const suite of suites) {
            // Average repeats within a task first, then bootstrap across tasks.
            const byTask = Map.groupBy(mine.filter((r) => r.suite === suite), (r) => r.task);
            const perTask = [...byTask.values()].map((rs) => mean(rs.map((r) => r.score)));
            perSuite[suite] = perTask;
            const ci = bootstrap(perTask);
            scores[suite] = ci && { score: round(ci.mean * 100), low: round(ci.low * 100), high: round(ci.high * 100), tasks: perTask.length };
        }
        const complete = indexSuites.every((s) => scores[s]);
        const index = complete ? round(mean(indexSuites.map((s) => scores[s].score))) : null;
        const joint = complete && bootstrapIndex(indexSuites.map((s) => perSuite[s]));
        const indexCi = joint && { low: round(joint.low * 100), high: round(joint.high * 100) };
        const ok = mine.filter((r) => !r.error);
        const price = pricing[model.openrouter];
        return {
            ...model,
            index,
            indexCi,
            scores,
            speed: round(median(ok.map((r) => r.speed))),
            ttft: round(median(ok.map((r) => r.ttft)), 1),
            priceIn: price?.in ?? null,
            priceOut: price?.out ?? null,
            context: price?.context ?? null,
            runCost: round(ok.reduce((s, r) => s + (r.cost ?? 0), 0), 2),
            tokensPerTask: Math.round(mean(ok.map((r) => r.tokensOut)) ?? 0),
            errorRate: round(errors / mine.length, 3),
            publishable: complete && errors / mine.length <= MAX_ERROR_RATE,
        };
    }).filter(Boolean);
    return withRanks(models);
}

// Rank range: best = 1 + models clearly above; worst = models not clearly below.
function withRanks(models) {
    const ranked = models.filter((m) => m.indexCi);
    return models.map((m) => {
        if (!m.indexCi) return m;
        const above = ranked.filter((o) => o.indexCi.low > m.indexCi.high).length;
        const notBelow = ranked.filter((o) => o !== m && o.indexCi.high >= m.indexCi.low).length;
        return { ...m, rank: { best: above + 1, worst: notBelow + 1 } };
    });
}

const round = (v, places = 1) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** places) / 10 ** places);
