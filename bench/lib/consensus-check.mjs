// Sanity checks on the leaderboard snapshots before they are averaged.
// Errors stop the build; warnings are printed for a human to judge.
export const STALE_DAYS = 45;
export const PROVISIONAL_BELOW = 6;

export function checkSources(sources, roster, now = new Date()) {
    const ids = new Set(roster.map((m) => m.id));
    const errors = [];
    const warnings = [];
    const seen = new Set();
    for (const s of sources) {
        if (seen.has(s.id)) errors.push(`${s.id}: duplicate source id`);
        seen.add(s.id);
        for (const key of ["id", "name", "org", "url", "updated", "metric", "category", "scores"]) {
            if (s[key] == null) errors.push(`${s.id ?? "?"}: missing ${key}`);
        }
        for (const [id, v] of Object.entries(s.scores ?? {})) {
            if (!ids.has(id)) errors.push(`${s.id}: unknown model id "${id}" (add it to roster.json or fix the id)`);
            if (!Number.isFinite(v?.value)) errors.push(`${s.id}: ${id} has no numeric value`);
            const allowed = new Set(["none", "low", "medium", "high", "xhigh", "max", "default", "unspecified"]);
            for (const run of v?.measurements ?? []) {
                if (!Number.isFinite(run.value)) errors.push(`${s.id}: ${id} measurement has no numeric value`);
                if (!allowed.has(run.effort)) errors.push(`${s.id}: ${id} measurement has invalid effort ${run.effort}`);
                if (!run.variant) errors.push(`${s.id}: ${id} measurement is missing variant`);
                if (run.costPerTask != null && (!Number.isFinite(run.costPerTask) || run.costPerTask <= 0 || !run.costBasis))
                    errors.push(`${s.id}: ${id} measurement needs a positive cost and its basis`);
            }
        }
        const age = (now - new Date(s.updated)) / 864e5;
        if (age > STALE_DAYS) warnings.push(`${s.id}: last updated ${s.updated} (${Math.round(age)} days ago) — refresh or drop`);
    }
    for (const m of roster) {
        const n = sources.filter((s) => s.scores?.[m.id]).length;
        if (n < 3) warnings.push(`${m.name}: only ${n} leaderboard(s) list it — no score until 3`);
        else if (n < PROVISIONAL_BELOW) warnings.push(`${m.name}: ${n} leaderboards — shown as early data`);
    }
    return { errors, warnings };
}
