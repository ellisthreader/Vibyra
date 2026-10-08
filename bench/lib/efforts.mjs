import { CATEGORY_WEIGHTS, consensus, summarise, toScore } from "./consensus.mjs";
import { EVIDENCE_POLICY, evaluatorSensitivity } from "./evidence.mjs";
import { PROVISIONAL_BELOW } from "./consensus-check.mjs";

export const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max", "default", "unspecified"];
const fallbackOrder = (run) => run.fallback === false ? 0 : run.fallback == null ? 1 : 2;
const order = { none: 0, low: 1, medium: 2, high: 3, xhigh: 4, max: 5, default: -1, unspecified: -2 };
export const runsFor = (source, id) => source.scores[id]?.measurements ?? (source.scores[id]
    ? [{ ...source.scores[id], effort: "unspecified", mode: "unspecified", fallback: null }] : []);

// Same-effort harness variants count once per board. Prefer a published run
// without old-model fallbacks, then the strongest same-effort harness.
export function selectRun(runs, higherIsBetter = true, effort) {
    const candidates = runs.filter((r) => Number.isFinite(r.value) && (!effort || r.effort === effort));
    return candidates.sort((a, b) => (!effort ? (order[b.effort] - order[a.effort]) : 0)
        || fallbackOrder(a) - fallbackOrder(b)
        || (higherIsBetter ? b.value - a.value : a.value - b.value))[0];
}

export function effortConsensus(sources, roster) {
    const anchors = sources.map((s) => ({ ...s, scores: Object.fromEntries(roster.flatMap((m) => {
        const run = selectRun(runsFor(s, m.id), s.higherIsBetter);
        return run ? [[m.id, run]] : [];
    })) }));
    // Fit each source once on the model roster. Project every effort through
    // those SAME fitted lines: switching effort must not recenter low to 50.
    const fit = consensus(anchors.filter((s) => s.consensus !== false), roster.map((m) => m.id));
    const kept = sources.filter((s) => fit.fits[s.id] || s.consensus === false);
    const profiles = roster.flatMap((m) => {
        const levels = [...new Set(kept.flatMap((s) => runsFor(s, m.id).map((r) => r.effort)))];
        if (!levels.length) levels.push("unspecified");
        const highest = [...levels].sort((a, b) => order[b] - order[a])[0];
        return levels.map((effort) => {
            const boards = {};
            const points = [];
            for (const s of kept) {
                const run = selectRun(runsFor(s, m.id), s.higherIsBetter, effort);
                if (!run) continue;
                const calibration = fit.fits[s.id];
                const x = calibration ? ((s.higherIsBetter === false ? -run.value : run.value) - calibration.a) / calibration.b : null;
                if (x != null) points.push({ source: s.id, org: s.evaluator ?? s.org ?? s.id, family: s.family ?? s.id, category: s.category, x });
                const peers = roster.flatMap((peer) => {
                    const row = selectRun(runsFor(s, peer.id), s.higherIsBetter, effort);
                    return row ? [{ id: peer.id, value: row.value }] : [];
                }).sort((x, y) => (s.higherIsBetter === false ? x.value - y.value : y.value - x.value));
                const rank = 1 + peers.filter((p) => s.higherIsBetter === false ? p.value < run.value : p.value > run.value).length;
                boards[s.id] = { ...run, rank, of: peers.length, normalised: toScore(x) };
            }
            const r = summarise(points, CATEGORY_WEIGHTS, EVIDENCE_POLICY);
            const code = [r.categories.coding, r.categories.agents].filter((x) => x != null);
            const speed = boards["aa-intelligence"]?.speed ?? null;
            return {
                id: `${m.id}@${effort}`, modelId: m.id, effort, highest: effort === highest,
                score: toScore(r.theta), categories: Object.fromEntries(Object.entries(r.categories).map(([c, x]) => [c, toScore(x)])),
                coding: code.length && r.theta != null ? toScore(code.reduce((a, b) => a + b) / code.length) : null,
                sourceCount: r.sources, publishedCount: Object.keys(boards).length,
                evaluatorCount: r.orgs, categoryCount: r.categoryCount,
                sensitivity: evaluatorSensitivity(points),
                provisional: r.theta != null && r.sources < PROVISIONAL_BELOW,
                agreement: r.spread == null ? null : r.spread <= .45 ? "strong" : r.spread <= .85 ? "fair" : "mixed",
                speed, sources: boards,
            };
        });
    });
    return { sources: kept, profiles };
}
