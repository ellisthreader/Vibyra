// Vibyra consensus score: one number per model from many public leaderboards.
//
// Each source s reports value v(s,m) for the models it covers, on its own
// scale (Elo, %, index). We fit one latent skill θ(m) per model and one line
// per source, v(s,m) ≈ a(s) + b(s)·θ(m), by alternating least squares. That
// puts every source on a common scale even when sources cover different
// models (a board that only tests top models no longer drags them to
// "average"). θ is the category-balanced mean of each model's per-source
// estimates, so coding boards, which are the most numerous, can't dominate.
import { mean } from "./stats.mjs";

// Preference stays visible, but is not a capability test.
export const CATEGORY_WEIGHTS = { overall: 1, coding: 1, agents: 1, reasoning: 1, knowledge: 1, instruction: 1, preference: 0 };
export const MIN_SOURCES = 3;
export const MIN_SOURCE_MODELS = 5;

const dispersion = (xs) => {
    const m = mean(xs);
    return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const sd = (xs) => dispersion(xs) || 1;

export function consensus(sources, modelIds, { iterations = 50, weights = CATEGORY_WEIGHTS } = {}) {
    // Direction-fix and drop sources too small to place on the scale.
    const usable = sources
        .map((s) => ({ ...s, values: Object.fromEntries(Object.entries(s.scores)
            .filter(([id, v]) => modelIds.includes(id) && Number.isFinite(v?.value))
            .map(([id, v]) => [id, s.higherIsBetter === false ? -v.value : v.value])) }))
        .filter((s) => Object.keys(s.values).length >= MIN_SOURCE_MODELS);

    // Start from plain z-scores, then refine the source lines and skills together.
    let fits = usable.map((s) => {
        const vs = Object.values(s.values);
        return { a: mean(vs), b: sd(vs) };
    });
    let theta = {};
    for (let it = 0; it < iterations; it++) {
        theta = estimate(usable, fits, modelIds, weights).theta;
        const norm = normalise(theta);
        theta = norm;
        fits = usable.map((s) => fitLine(s.values, theta) ?? { a: mean(Object.values(s.values)), b: sd(Object.values(s.values)) });
    }
    const { perModel } = estimate(usable, fits, modelIds, weights);
    return {
        fits: Object.fromEntries(usable.map((s, i) => [s.id, fits[i]])),
        sources: usable.map((s, i) => ({ id: s.id, category: s.category, models: Object.keys(s.values).length, slope: fits[i].b })),
        models: Object.fromEntries(modelIds.map((id) => [id, summarise(perModel[id], weights)])),
    };
}

// Per-model estimates from every source that covers it, grouped by category.
function estimate(usable, fits, modelIds, weights) {
    const perModel = Object.fromEntries(modelIds.map((id) => [id, []]));
    usable.forEach((s, i) => {
        for (const [id, v] of Object.entries(s.values)) {
            perModel[id].push({ source: s.id, org: s.evaluator ?? s.org ?? s.id, family: s.family ?? s.id,
                category: s.category, x: (v - fits[i].a) / fits[i].b });
        }
    });
    const theta = {};
    for (const id of modelIds) {
        const s = summarise(perModel[id], weights);
        if (s.theta != null) theta[id] = s.theta;
    }
    return { theta, perModel };
}

export function summarise(points, weights = CATEGORY_WEIGHTS, { minCategories = 2, minOrgs = 0 } = {}) {
    const byCategory = Map.groupBy(points, (p) => p.category);
    // A publisher cannot gain votes by adding more boards or family variants.
    const categories = Object.fromEntries([...byCategory].map(([c, ps]) => [c, mean(
        [...Map.groupBy(ps, (p) => p.org ?? p.source)].map(([, runs]) => mean(
            [...Map.groupBy(runs, (p) => p.family ?? p.source)].map(([, family]) => mean(family.map((p) => p.x))),
        )),
    )]));
    const used = Object.keys(categories).filter((c) => weights[c]);
    const evidence = points.filter((p) => weights[p.category]);
    const orgs = new Set(evidence.map((p) => p.org ?? p.source)).size;
    const theta = evidence.length >= MIN_SOURCES && used.length >= minCategories && orgs >= minOrgs
        ? used.reduce((sum, c) => sum + weights[c] * categories[c], 0) / used.reduce((sum, c) => sum + weights[c], 0)
        : null;
    return { theta, categories, sources: evidence.length, orgs, categoryCount: used.length,
        spread: evidence.length > 1 ? dispersion(evidence.map((p) => p.x)) : null, points };
}

// Least-squares line v = a + b·θ over the models this source shares with θ.
function fitLine(values, theta) {
    const pairs = Object.entries(values).filter(([id]) => theta[id] != null).map(([id, v]) => [theta[id], v]);
    if (pairs.length < 3) return null;
    const mx = mean(pairs.map((p) => p[0]));
    const my = mean(pairs.map((p) => p[1]));
    const sxx = pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0);
    const b = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
    // A source that runs against the consensus keeps its plain z-scale instead of flipping.
    return b > 0 ? { a: my - b * mx, b } : null;
}

// Keep θ centred with unit spread so the scale can't drift between iterations.
function normalise(theta) {
    const vs = Object.values(theta);
    const m = mean(vs);
    const s = sd(vs);
    return Object.fromEntries(Object.entries(theta).map(([id, v]) => [id, (v - m) / s]));
}

// Display scale: 50 is the average of today's roster, 15 points per standard deviation.
export const toScore = (theta) => (theta == null ? null : Math.max(0, Math.min(100, Math.round((50 + 15 * theta) * 10) / 10)));
