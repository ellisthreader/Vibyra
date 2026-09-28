import React from "react";
import { Icon } from "./shared.jsx";
import { agents, logoPath } from "./agents.js";

const seen = new Set();
const oncePerLogo = agents.filter((agent) => {
    if (seen.has(agent.logo)) return false;
    seen.add(agent.logo);
    return true;
});
const lanes = [
    { label: "Coding agents", items: oncePerLogo.filter((a) => a.kind === "Coding agent") },
    { label: "Models", items: oncePerLogo.filter((a) => a.kind === "Model family") },
];

export default function AgentShowcase({ onPick }) {
    return (
        <section className="agent-showcase" aria-labelledby="agents-title">
            <div className="page-width agent-heading">
                <h2 id="agents-title">Your favourites. <span>All welcome.</span></h2>
                <p>Pick one to start it in the demo above.</p>
            </div>
            <div className="page-width agent-flow">
                {lanes.map((lane, index) => (
                    <div className={`agent-lane agent-lane-${index}`} key={lane.label}>
                        <p className="agent-lane-label">{lane.label}</p>
                        <div className="agent-group">
                                {lane.items.map((agent) => <button className={`agent-card ${agent.id === "aider" ? "agent-wordmark" : ""}`} key={agent.id}
                                    onClick={() => onPick(agent)} aria-label={`Start ${agent.name} in the demo workspace`}>
                                    <span className="agent-logo"><img className={agent.mono ? "agent-mono" : ""} src={logoPath(agent)} alt="" width="34" height="34" /></span>
                                    <span><strong>{agent.name}</strong><small>{agent.company}</small></span>
                                    <Icon name="arrow" size={14} />
                                </button>)}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
