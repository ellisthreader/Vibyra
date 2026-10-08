// Vibyra Score: the consensus of many public leaderboards (built by
// `node bench/cli.mjs consensus`). Prices are live OpenRouter list prices;
// speed belongs to the exact effort run, with no higher-effort fallback.
import * as snapshot from "./snapshot-aa.js";

// Snapshot ids that differ from the roster ids.
const SNAPSHOT_ID = { "claude-haiku-4-5": "claude-4-5-haiku-reasoning", "gemini-3-1-pro": "gemini-3-1-pro-preview" };
const CATEGORY_ORDER = ["overall", "coding", "agents", "reasoning", "knowledge", "instruction", "preference"];
const CATEGORY = { overall: "Overall", coding: "Coding", agents: "Agents", reasoning: "Reasoning", knowledge: "Knowledge", instruction: "Instruction following", preference: "Human preference" };

const date = (iso, month) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric" });

export const consensusReady = (doc) => doc.sources?.length >= 3 && doc.models?.some((m) => m.score != null);

export function fromConsensus(doc) {
    const count = doc.sources.length;
    const included = doc.sources.filter((s) => s.consensus !== false && s.category !== "preference").length;
    const mapModel = (m) => {
            const base = snapshot.MODELS.find((x) => x.id === (SNAPSHOT_ID[m.modelId ?? m.id] ?? m.modelId ?? m.id)) ?? {};
            const livePrice = m.priceIn != null && m.priceOut != null;
            return {
                ...base,
                // Roster facts come from the consensus file, so a brand-new model
                // shows correctly even before any snapshot knows about it.
                id: m.id,
                modelId: m.modelId ?? m.id,
                effort: m.effort,
                highest: m.highest,
                speed: m.effort ? m.speed ?? null : base.speed,
                name: m.name ?? base.name,
                provider: m.provider ?? base.provider,
                released: m.released ?? base.released,
                openWeights: m.openWeights ?? base.openWeights,
                priceIn: livePrice ? m.priceIn : base.priceIn,
                priceOut: livePrice ? m.priceOut : base.priceOut,
                blended: livePrice ? null : base.blended,
                context: m.context ?? base.context,
                provisional: Boolean(m.provisional),
                intelligence: m.score,
                coding: m.effort ? m.coding ?? null : m.categories.coding ?? null,
                categories: m.categories,
                sourceCount: m.sourceCount,
                publishedCount: m.publishedCount ?? m.sourceCount,
                evaluatorCount: m.evaluatorCount,
                categoryCount: m.categoryCount,
                categoryTotal: new Set(doc.sources.filter((s) => s.consensus !== false && s.category !== "preference").map((s) => s.category)).size,
                sensitivity: m.sensitivity,
                agreement: m.agreement,
                scores: m.categories,
                boards: m.sources,
                approx: m.effort ? undefined : base.approx,
                codingAgent: undefined,
            };
    };

    return {
        SOURCE: "consensus",
        SOURCE_NAME: `${count} leaderboards`,
        AS_OF: date(doc.generatedAt, "long"),
        AS_OF_SHORT: date(doc.generatedAt, "short"),
        // The leaderboards are listed in the method section; only price and speed need crediting here.
        SOURCES: [],
        CONSENSUS_SOURCES: doc.sources.map((s) => ({ ...s, categoryName: CATEGORY[s.category] ?? s.category })),
        LABELS: {
            intelligence: { label: "Vibyra Score", title: "Vibyra Score", note: `A capability summary from ${included} eligible boards, balanced by evaluator and category, using only the selected effort. Coverage differs by model.` },
            coding: { title: "Vibyra Coding", note: "The average of the coding and agent categories, using the selected effort." },
            pickSmartest: "Highest capability summary. A heuristic comparison, with evaluator sensitivity and coverage shown in the scores table.",
            pickCoder: "Highest average across the coding leaderboards.",
            method: {
                lead: `${count} public boards are available; ${included} feed the capability summary. Effort levels use one shared reference scale.`,
                intelligence: "Scores balance evaluators within categories, then average available capability categories. Preference is separate. A score needs 3 evaluators across 3 categories; missing results are not estimated.",
                coding: "The same average, using only the coding and agent leaderboards.",
                disclaimer: "Vibyra runs these models; it does not make them. Every number comes from the public leaderboards listed here, each crediting its own evaluators; prices are OpenRouter list prices and speeds are from Artificial Analysis. Models on fewer than 6 leaderboards are marked early data.",
            },
        },
        // Columns are category averages; the single leaderboards are listed in the method section.
        BENCHMARKS: CATEGORY_ORDER.filter((c) => c !== "coding" && doc.sources.some((s) => s.category === c && s.consensus !== false)).map((c) => ({
            id: c,
            name: CATEGORY[c],
            short: CATEGORY[c],
            description: "Shared reference scale, with equal evaluator weight. Preference is separate from the capability score.",
            unit: "score",
        })),
        MODELS: doc.models.map(mapModel),
        ALL_MODELS: (doc.profiles ?? doc.models).map(mapModel),
        extraSources: [
            { name: "OpenRouter (prices)", url: "https://openrouter.ai/models" },
            { name: "Artificial Analysis (speed)", url: "https://artificialanalysis.ai/leaderboards/models" },
        ],
    };
}
