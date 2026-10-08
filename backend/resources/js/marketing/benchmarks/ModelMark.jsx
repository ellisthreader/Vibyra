import React from "react";
import { effortLabel } from "./effortSelection.js";
import { PROVIDERS } from "./data.js";
import { logoPath } from "./metrics.js";

// A provider logo on a small tile, so every row is recognisable without colour.
export default function ModelMark({ model, size = 26 }) {
    const provider = PROVIDERS[model.provider];
    return (
        <span className={`bm-mark${provider?.dark ? " is-dark" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
            {provider?.logo ? <img src={logoPath(provider)} alt="" loading="lazy" /> : <b>{model.provider[0]}</b>}
        </span>
    );
}

export function ModelName({ model, showProvider = true }) {
    return (
        <span className="bm-model">
            <ModelMark model={model} />
            <span>
                <strong>{model.name}</strong>
                {showProvider && (
                    <small>
                        {PROVIDERS[model.provider]?.name ?? model.provider}
                        {model.effort && <em className="is-effort">{effortLabel(model)}</em>}
                        {model.openWeights && <em>Open weights</em>}
                        {model.provisional && <em className="is-early" title="Fewer than 6 leaderboards list this model yet">Early data</em>}
                    </small>
                )}
            </span>
        </span>
    );
}
