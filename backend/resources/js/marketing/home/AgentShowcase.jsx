import React, { useRef } from "react";
import { agents, logoPath } from "./agents.js";
import useAgentMotion from "./useAgentMotion.js";

const seen = new Set();
const oncePerLogo = agents.filter((agent) => {
    if (seen.has(agent.logo)) return false;
    seen.add(agent.logo);
    return true;
});
const lanes = [
    oncePerLogo.slice(0, 6),
    oncePerLogo.slice(6),
];

export default function AgentShowcase({ onPick }) {
    const root = useRef(null);
    const active = useAgentMotion(root);
    return (
        <section ref={root} className="agent-showcase" aria-labelledby="agents-title" data-paused={!active}>
            <div className="page-width agent-heading">
                <h2 id="agents-title">Your favourites. <span>All welcome.</span></h2>
                <p>Pick one to start it in the demo above.</p>
            </div>
            <div className="page-width agent-flow">
                {lanes.map((lane, index) => (
                    <div className={`agent-lane agent-lane-${index}`} key={index}>
                        <div className="agent-window">
                          <div className="agent-track">
                            {[0, 1, 2].map((copy) => <div className="agent-group" key={copy} aria-hidden={copy ? true : undefined}>
                                {lane.map((agent) => <button className={`agent-card ${agent.id === "aider" ? "agent-wordmark" : ""}`} key={agent.id}
                                    type="button" tabIndex={copy ? -1 : 0}
                                    onMouseDown={copy ? (event) => event.preventDefault() : undefined}
                                    onClick={() => onPick(agent)} aria-label={`Start ${agent.name} in the demo workspace`}>
                                    <span className="agent-logo"><img className={agent.mono ? "agent-mono" : ""} src={logoPath(agent)} alt="" width="34" height="34" /></span>
                                    <span><strong>{agent.name}</strong><small>{agent.company}</small></span>
                                </button>)}
                            </div>)}
                          </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
