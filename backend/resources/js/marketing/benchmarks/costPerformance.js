// Compare paired measurements from one evaluator/workload, never capability / price.
export const WORKLOADS = [
    { id: "aa-coding-agent", name: "AA · Coding agents", unit: "index", note: "Model + native coding agent. Published API cost estimates include caching and any fallback attempts." },
    { id: "aa-intelligence", name: "AA · General intelligence", unit: "index", note: "AA’s transformed Intelligence Index and weighted evaluation cost per task. Index points are not a pass rate." },
    { id: "vals-terminal-bench-4", name: "Vals · Terminal-Bench 4", unit: "%", note: "Mini-SWE-agent. Fallback attempts count as failures in performance; cost includes those original attempts." },
    { id: "vals-vibe-code-bench", name: "Vals · Vibe Code Bench", unit: "%", note: "OpenHands on Vibe Code Bench v1.1. Published mean API cost per task." },
    { id: "vals-proofbench", name: "Vals · ProofBench", unit: "%", note: "ProofBench v1.1. Published mean API cost per task." },
    { id: "arc-prize-agi-2", name: "ARC Prize · ARC-AGI-2", unit: "%", note: "Verified semi-private split, standard harness. Published API cost per task; unpublished efforts are not filled in." },
];

export const taskMoney = (v) => `$${v < .01 ? v.toFixed(4) : v.toFixed(2)}`;
export const performanceText = (row, workload) => `${row.performance.toFixed(2)}${workload.unit === "%" ? "%" : ""}`;

export function pairedRows(models, sourceId) {
    return models.flatMap((model) => {
        const run = model.boards?.[sourceId];
        return run?.costEligible !== false && Number.isFinite(run?.costPerTask) && run.costPerTask > 0 && Number.isFinite(run.value)
            ? [{ model, run, performance: run.value, cost: run.costPerTask }] : [];
    });
}

export const dominates = (a, b) => a.performance >= b.performance && a.cost <= b.cost
    && (a.performance > b.performance || a.cost < b.cost);

// Tier 1 contains undominated choices; remove it to find tier 2, and so on.
// A cheap weaker model and a costly stronger model can share a tier.
export function paretoRanks(rows) {
    let remaining = [...rows];
    const result = [];
    for (let tier = 1; remaining.length; tier++) {
        const front = remaining.filter((row) => !remaining.some((other) => dominates(other, row)));
        result.push(...front.map((row) => ({ ...row, tier })));
        const removed = new Set(front);
        remaining = remaining.filter((row) => !removed.has(row));
    }
    return result.sort((a, b) => a.tier - b.tier || b.performance - a.performance || a.cost - b.cost);
}

export function efficientCoder(models, gap = 5) {
    const rows = pairedRows(models, "aa-coding-agent");
    if (!rows.length) return null;
    const peak = Math.max(...rows.map((row) => row.performance));
    return rows.filter((row) => row.performance >= peak - gap)
        .sort((a, b) => a.cost - b.cost || b.performance - a.performance)[0];
}
