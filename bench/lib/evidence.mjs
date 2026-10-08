import { CATEGORY_WEIGHTS, summarise, toScore } from "./consensus.mjs";

export const EVIDENCE_POLICY = { minCategories: 3, minOrgs: 3 };

// Descriptive sensitivity to evaluator selection on the SAME calibration.
// These bounds are not statistical confidence intervals or model error bars.
export function evaluatorSensitivity(points) {
    const full = summarise(points, CATEGORY_WEIGHTS, EVIDENCE_POLICY);
    if (full.theta == null) return null;
    const orgs = [...new Set(points.filter((p) => CATEGORY_WEIGHTS[p.category]).map((p) => p.org))];
    const scenarios = orgs.flatMap((org) => {
        const result = summarise(points.filter((p) => p.org !== org), CATEGORY_WEIGHTS,
            { ...EVIDENCE_POLICY, minOrgs: 2 });
        return result.theta == null ? [] : [{ omitted: org, score: toScore(result.theta) }];
    });
    const scores = [toScore(full.theta), ...scenarios.map((s) => s.score)];
    return { low: Math.min(...scores), high: Math.max(...scores), scenarios,
        incomplete: scenarios.length < orgs.length };
}
