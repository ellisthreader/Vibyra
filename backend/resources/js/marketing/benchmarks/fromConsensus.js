// Vibyra Score: the consensus of many public leaderboards (built by
// `node bench/cli.mjs consensus`). Price, speed and context still come from
// the Artificial Analysis snapshot, credited in the Sources row.
import * as snapshot from "./snapshot-aa.js";

// Snapshot ids that differ from the roster ids.
const SNAPSHOT_ID = { "claude-haiku-4-5": "claude-4-5-haiku-reasoning", "gemini-3-1-pro": "gemini-3-1-pro-preview" };
const CATEGORY_ORDER = ["overall", "coding", "agents", "reasoning", "knowledge", "preference"];
const CATEGORY = { overall: "Overall", coding: "Coding", agents: "Agents", reasoning: "Reasoning", knowledge: "Knowledge", preference: "Human preference" };

const date = (iso, month) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric" });

export const consensusReady = (doc) => doc.sources?.length >= 3 && doc.models?.some((m) => m.score != null);

export function fromConsensus(doc) {
    const count = doc.sources.length;
    return {
        SOURCE: "consensus",
        SOURCE_NAME: `${count} leaderboards`,
        AS_OF: date(doc.generatedAt, "long"),
        AS_OF_SHORT: date(doc.generatedAt, "short"),
        // The leaderboards are listed in the method section; only price and speed need crediting here.
        SOURCES: [],
        CONSENSUS_SOURCES: doc.sources.map((s) => ({ ...s, categoryName: CATEGORY[s.category] ?? s.category })),
        LABELS: {
            intelligence: { label: "Vibyra Score", title: "Vibyra Score", note: `The average of ${count} public leaderboards, balanced so no one kind of test dominates. 50 is the average of these models.` },
            coding: { title: "Vibyra Coding", note: "The average of the coding and agent leaderboards. 50 is the average of these models." },
            pickSmartest: `Highest average across ${count} leaderboards.`,
            pickCoder: "Highest average across the coding leaderboards.",
            method: {
                lead: `We average ${count} public leaderboards from ${new Set(doc.sources.map((s) => s.org)).size} organisations. Scores use one shared scale where 50 is the average of these models.`,
                intelligence: "Every leaderboard is put on one shared scale, then averaged by category (overall, coding, agents, reasoning, knowledge, human preference) so the many coding boards can't outvote the rest. A model needs at least 3 leaderboards to get a score.",
                coding: "The same average, using only the coding and agent leaderboards.",
                disclaimer: "Vibyra runs these models; it does not make them. Every number comes from the public leaderboards listed here, each crediting its own evaluators; prices are OpenRouter list prices and speeds are from Artificial Analysis. Models on fewer than 6 leaderboards are marked early data.",
            },
        },
        // Columns are category averages; the single leaderboards are listed in the method section.
        BENCHMARKS: CATEGORY_ORDER.filter((c) => c !== "coding" && doc.sources.some((s) => s.category === c)).map((c) => ({
            id: c,
            name: CATEGORY[c],
            short: CATEGORY[c],
            description: `Average of ${doc.sources.filter((s) => s.category === c).length} leaderboards.`,
            unit: "score",
        })),
        MODELS: doc.models.map((m) => {
            const base = snapshot.MODELS.find((x) => x.id === (SNAPSHOT_ID[m.id] ?? m.id)) ?? {};
            const livePrice = m.priceIn != null && m.priceOut != null;
            return {
                ...base,
                // Roster facts come from the consensus file, so a brand-new model
                // shows correctly even before any snapshot knows about it.
                id: m.id,
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
                coding: m.categories.coding ?? null,
                categories: m.categories,
                sourceCount: m.sourceCount,
                agreement: m.agreement,
                scores: m.categories,
                boards: m.sources,
                approx: base.approx,
                codingAgent: undefined,
            };
        }),
        extraSources: [
            { name: "OpenRouter (prices)", url: "https://openrouter.ai/models" },
            { name: "Artificial Analysis (speed)", url: "https://artificialanalysis.ai/leaderboards/models" },
        ],
    };
}
