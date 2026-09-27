// Source order: our own Vibyra Bench run (vibyra-results.json) if one is
// published; else the Vibyra Score consensus of public leaderboards
// (consensus-results.json); else the Artificial Analysis snapshot alone.
import results from "./vibyra-results.json" with { type: "json" };
import consensusDoc from "./consensus-results.json" with { type: "json" };
import { consensusReady, fromConsensus } from "./fromConsensus.js";
import * as snapshot from "./snapshot-aa.js";

const date = (iso, month) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric" });

function fromVibyra(doc) {
    const suites = doc.suites.filter((s) => s.id !== "code");
    return {
        SOURCE: "vibyra",
        SOURCE_NAME: "Vibyra Bench",
        AS_OF: date(doc.generatedAt, "long"),
        AS_OF_SHORT: date(doc.generatedAt, "short"),
        SOURCES: [
            { name: "OpenRouter (model access and prices)", url: "https://openrouter.ai/models" },
            { name: "AIME 2026 problems (MathArena)", url: "https://huggingface.co/datasets/MathArena/aime_2026" },
            { name: "MMLU-Pro (TIGER-Lab)", url: "https://huggingface.co/datasets/TIGER-Lab/MMLU-Pro" },
        ],
        LABELS: {
            intelligence: { title: "Vibyra Index", note: "The average of Vibyra's four test suites, run by us. Higher is better." },
            coding: { title: "Vibyra Coding", note: "Vibyra's private coding tasks, checked by hidden tests. Higher is better." },
            pickSmartest: "Highest Vibyra Index across all four suites.",
            pickCoder: "Top score on Vibyra's private coding tasks.",
            method: {
                lead: "Every score is the share of tasks passed, with a 95% range; models whose ranges overlap are shown as tied.",
                intelligence: "The plain average of the four suites below, so no single test dominates.",
                coding: "Twelve private tasks: write tricky functions and fix bugs in small projects. Hidden tests run the model's code in a locked sandbox.",
                disclaimer: "Vibyra runs every test itself, through OpenRouter, at each model's highest reasoning effort, three times for small suites. Our private questions are never published, so no model can have trained on them.",
            },
        },
        BENCHMARKS: suites.map((s) => ({ id: s.id, name: s.name, short: s.name, description: s.description, unit: "%" })),
        MODELS: doc.models.map((m) => ({
            id: m.id, name: m.name, provider: m.provider, released: m.released, openWeights: Boolean(m.openWeights),
            intelligence: m.index,
            coding: m.scores.code?.score ?? null,
            scores: Object.fromEntries(suites.map((s) => [s.id, m.scores[s.id]?.score ?? null])),
            ci: m.indexCi, rank: m.rank,
            priceIn: m.priceIn, priceOut: m.priceOut, blended: null,
            speed: m.speed, ttft: m.ttft, context: m.context,
        })),
    };
}

const fallback = {
    SOURCE: "aa",
    SOURCE_NAME: "Artificial Analysis",
    ...snapshot,
    LABELS: {
        intelligence: { title: "Intelligence index", note: "One score across ten hard evaluations. Higher is better." },
        coding: { title: "Coding agent index", note: "Each model working inside its own coding agent. Higher is better." },
        pickSmartest: "Highest Intelligence Index score, across ten hard evaluations.",
        pickCoder: "Top coding agent score.",
        method: {
            lead: "Scores are percent correct, except GDPval, which is a rating.",
            intelligence: "One number that blends ten hard evaluations: reasoning, knowledge, science, coding and real agent work.",
            coding: "Each model working inside its own coding agent, such as Claude Code or Codex, on real repository and terminal tasks. It scores the pair, so it is closest to what you get in Vibyra.",
            disclaimer: "Vibyra runs these models; it does not make them. Numbers come from the independent sources above and can shift as providers update their models.",
        },
    },
};

const chosen = results.models?.length ? fromVibyra(results)
    : consensusReady(consensusDoc) ? fromConsensus(consensusDoc)
    : fallback;

export const { SOURCE, SOURCE_NAME, AS_OF, AS_OF_SHORT, LABELS, BENCHMARKS, MODELS } = chosen;
export const SOURCES = [...chosen.SOURCES, ...(chosen.extraSources ?? [])];
export const CONSENSUS_SOURCES = chosen.CONSENSUS_SOURCES ?? null;
export const PROVIDERS = snapshot.PROVIDERS;
