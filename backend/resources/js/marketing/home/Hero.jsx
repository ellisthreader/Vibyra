import React, { useState } from "react";
import { Action, Icon } from "./shared.jsx";
import WorkspaceDemo from "./WorkspaceDemo.jsx";
import AgentShowcase from "./AgentShowcase.jsx";
import Playground from "./playground/Playground.jsx";

export default function Hero() {
    const [playground, setPlayground] = useState(null);
    return (
        <section className="home-hero" id="top" aria-labelledby="hero-title">
            <div className="hero-scene">
                <div className="hero-atmosphere" aria-hidden="true">
                    <img
                        src="/media/marketing/hero-cobalt-sculpture.webp"
                        width="1672"
                        height="941"
                        alt=""
                        fetchPriority="high"
                        decoding="async"
                    />
                </div>
                <div className="page-width hero-intro">
                    <h1 id="hero-title">
                        Big ideas.
                        <br />
                        <span>One place to build.</span>
                    </h1>
                    <p className="hero-description">
                        Your agents, terminals, and previews. Finally, together.
                        <br className="desktop-break" />{" "}
                        A little less switching. A lot more creating.
                    </p>
                    <div className="hero-actions">
                        <Action icon="download">Get Vibyra for free</Action>
                        <Action href="#walkthrough" secondary icon="play">
                            Take a look inside
                        </Action>
                    </div>
                    <p className="hero-availability">
                        <Icon name="monitor" size={13} />
                        Windows & Linux <span>·</span> Free to download
                    </p>
                </div>
                <div className="page-width hero-showcase" id="walkthrough">
                    <WorkspaceDemo onExplore={setPlayground} />
                </div>
            </div>
            <AgentShowcase onExplore={setPlayground} />
            <Playground open={playground} onClose={() => setPlayground(null)} />
        </section>
    );
}
