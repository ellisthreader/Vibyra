import React, { useEffect, useRef, useState } from "react";
import { Brand, Icon } from "./shared.jsx";
import { agents, logoPath } from "./agents.js";

export default function AgentShowcase({ onExplore }) {
    const root = useRef(null);
    const [paused, setPaused] = useState(false);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        let inView = false;
        const update = () => setVisible(inView && !document.hidden);
        const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
        observer.observe(root.current);
        document.addEventListener("visibilitychange", update);
        return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
    }, []);
    return (
        <section ref={root} className="agent-showcase" aria-labelledby="agents-title" data-paused={paused || !visible}>
            <div className="page-width agent-heading">
                <div><p className="agent-eyebrow">YOUR KIND OF INTELLIGENCE</p>
                    <h2 id="agents-title">Different agents.<br /><span>One place to build.</span></h2></div>
                <div className="agent-intro"><p>The minds you love.<br />A workspace that brings them together.</p>
                    <button className="agent-pause" onClick={() => setPaused(!paused)} aria-pressed={paused}>
                        <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span> {paused ? "Play animation" : "Pause animation"}
                    </button></div>
            </div>
            <div className="agent-flow">
                {[agents.slice(0, 6), agents.slice(6)].map((row, index) => (
                    <div className={`agent-lane agent-lane-${index}`} key={index}>
                        <div className="agent-track">
                            {[0, 1].map((copy) => <div className="agent-group" key={copy} aria-hidden={copy === 1 ? true : undefined} inert={copy === 1 ? true : undefined}>
                                {row.map((agent) => <button className={`agent-card ${agent.id === "aider" ? "agent-wordmark" : ""}`} key={agent.id} tabIndex={copy ? -1 : 0}
                                    onClick={() => onExplore({ view: "agents", provider: agent.id })} aria-label={`Explore ${agent.name} in the demo`}>
                                    <span className="agent-logo"><img className={agent.mono ? "agent-mono" : ""} src={logoPath(agent)} alt="" width="34" height="34" /></span>
                                    <span><strong>{agent.name}</strong><small>{agent.company}</small></span>
                                    <Icon name="arrow" size={14} />
                                </button>)}
                            </div>)}
                        </div>
                    </div>
                ))}
                <div className="agent-convergence" aria-hidden="true"><i /><span><Brand word={false} /></span><i /></div>
            </div>
            <div className="page-width agent-footnote"><span><i /> A place for your next idea</span>
                <p>Coding agents above. Model families below, through compatible tools and providers. Availability varies by setup.</p>
            </div>
        </section>
    );
}
