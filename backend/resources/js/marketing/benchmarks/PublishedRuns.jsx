import React from "react";
import { CONSENSUS_SOURCES } from "./data.js";
import { modelLabel } from "./effortSelection.js";

export default function PublishedRuns({ model }) {
    if (!model) return <p className="bm-run-hint">Select a model to inspect its published runs, effort and fallback settings.</p>;
    const runs = Object.entries(model.boards ?? {}).flatMap(([id, selected]) => {
        const source = CONSENSUS_SOURCES?.find((s) => s.id === id);
        return (selected.measurements ?? [selected]).map((run) => ({ source, run }));
    });
    return (
        <details className="bm-published-runs" open key={model.id}>
            <summary>Published runs · {modelLabel(model)}</summary>
            <p>{model.sourceCount ?? 0} capability boards · {model.evaluatorCount ?? 0} evaluators · {model.categoryCount ?? 0}/{model.categoryTotal ?? 6} categories.
                {model.sensitivity && <> Evaluator sensitivity: {model.sensitivity.low}–{model.sensitivity.high}, not a confidence interval.
                    {model.sensitivity.incomplete && " Some omissions leave too little category coverage, so this range is incomplete."}</>}</p>
            {!runs.length && <p>No published runs for this effort.</p>}
            <ul>{runs.map(({ source, run }, i) => (
                <li key={`${source?.id}-${i}`}>
                    <div><a href={source?.url} target="_blank" rel="noreferrer">{source?.name}</a>
                        <strong>{Number(run.value.toFixed(4))}</strong></div>
                    <p>{run.variant}</p>
                    {run.costPerTask != null && <p>${run.costPerTask.toFixed(4)} / task · {run.costBasis}
                        {run.costFallbackAttempts > 0 && ` · ${run.costFallbackAttempts}/${run.costAttemptCount} fallback attempts (${run.costFallbackDefinition}).`}</p>}
                    {source?.consensus === false && <small>Reference only: {source.consensusReason}</small>}
                    <small>{run.rawEffort ? `Reported effort: ${run.rawEffort} · ` : "Effort unreported · "}
                        {run.mode && run.mode !== "unspecified" && `${run.mode} · `}
                        {run.harness && `${run.harness} · `}
                        {run.fallback === true ? "Fallback enabled" : run.fallback === false ? "Fallback excluded or counted as failures" : "Fallback policy unreported"}</small>
                </li>
            ))}</ul>
        </details>
    );
}
