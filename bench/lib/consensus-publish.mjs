import { readdir, readFile, writeFile } from "node:fs/promises";
import { CATEGORY_WEIGHTS, MIN_SOURCES } from "./consensus.mjs";
import { checkSources } from "./consensus-check.mjs";
import { effortConsensus, runsFor } from "./efforts.mjs";
import { EVIDENCE_POLICY } from "./evidence.mjs";
import { openRouterPricing } from "./env.mjs";

const DIR = new URL("../consensus/sources/", import.meta.url);
export const CONSENSUS = new URL("../../backend/resources/js/marketing/benchmarks/consensus-results.json", import.meta.url).pathname;
export async function loadSources() {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".json")).sort();
    const docs = await Promise.all(files.map(async (f) => JSON.parse(await readFile(new URL(f, DIR), "utf8"))));
    return docs.flatMap((d) => d.sources);
}

export async function buildConsensus(roster) {
    const sources = await loadSources();
    const check = checkSources(sources, roster);
    if (check.errors.length) throw new Error(`Fix the source files first:\n  ${check.errors.join("\n  ")}`);
    const pricing = await openRouterPricing().catch((error) => {
        check.warnings.push(`Live prices unavailable: ${error.message}`);
        return {};
    });
    const { sources: kept, profiles } = effortConsensus(sources, roster);
    const fact = (profile) => {
        const m = roster.find((m) => m.id === profile.modelId);
        const price = pricing[m.openrouter];
        return {
            ...profile, name: m.name, provider: m.provider, released: m.released, openWeights: Boolean(m.openWeights),
            priceIn: price?.in ?? null, priceOut: price?.out ?? null, context: price?.context ?? null,
            sources: Object.fromEntries(Object.entries(profile.sources).map(([id, run]) => [id, {
                ...run, measurements: runsFor(kept.find((s) => s.id === id), m.id).filter((r) => r.effort === profile.effort),
            }])),
        };
    };
    const allProfiles = profiles.map(fact);
    const doc = {
        generatedAt: new Date().toISOString(),
        method: {
            minSources: MIN_SOURCES, ...EVIDENCE_POLICY, categoryWeights: CATEGORY_WEIGHTS,
            evaluatorPolicy: "Equal evaluator weight within each capability category, with benchmark families averaged before evaluators. Preference is displayed separately. Reference-only boards do not affect calibration or the score. At least 3 evaluators and 3 capability categories are required; missing categories are not estimated. Evaluator sensitivity removes one evaluator at a time on the same scale and is not a confidence interval.",
            scale: "One fitted scale across effort levels; 50 is the reference roster average, 15 points is one standard deviation.",
            effortPolicy: "Each profile uses only its exact published effort. Highest reported selects the highest observed named effort for each model; unknown effort is never treated as max. Sources are calibrated once using their highest reported runs, without recentering each effort. Same-effort harness variants count once per board; published fallback-as-failure results are preferred.",
            valuePolicy: "Cost/performance is separate from capability. Compare exact-run raw performance with published API USD/task within one workload, using Pareto tiers. Missing or estimated costs/performance are not ranked; adjusted fallback scores retain original run costs, including fallback. Efficient coder selects the cheapest AA coding-agent run within 5 index points of the displayed leader.",
        },
        sources: kept.map(({ scores, ...s }) => ({ ...s, models: Object.keys(scores).length })),
        models: allProfiles.filter((p) => p.highest), profiles: allProfiles,
    };
    for (const p of doc.models) {
        if (p.score == null) check.warnings.push(`${p.name} (${p.effort}): ${p.sourceCount} capability boards, ${p.evaluatorCount} evaluators, ${p.categoryCount} categories — insufficient effort-specific coverage`);
        else if (p.provisional) check.warnings.push(`${p.name} (${p.effort}): ${p.sourceCount} boards — early data`);
    }
    await writeFile(CONSENSUS, `${JSON.stringify(doc, null, 1)}\n`);
    return { ...doc, warnings: check.warnings };
}
