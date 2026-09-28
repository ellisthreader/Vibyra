import React, { useRef } from "react";
import { Action, Icon } from "./shared.jsx";
import WorkspaceDemo from "./WorkspaceDemo.jsx";
import AgentShowcase from "./AgentShowcase.jsx";
import { useDeviceDemo } from "./device/useDeviceDemo.js";
import { agents, logoPath } from "./agents.js";

const featured = agents.filter((agent) => ["claude", "codex", "gemini"].includes(agent.id));
const others = new Set(agents.map((agent) => agent.logo)).size - featured.length;

export default function Hero() {
    // The software preview and provider shelf share one interactive workspace.
    const demo = useDeviceDemo();
    const showcase = useRef(null);
    const startAgent = (agent) => {
        demo.startAgent(agent);
        showcase.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    return (
        <section className="home-hero" id="top" aria-labelledby="hero-title">
            <div className="hero-scene">
                <div className="page-width hero-intro">
                    <div className="hero-headline">
                        <h1 id="hero-title">
                            <span className="hero-title-lead">Big ideas.</span>
                            <br />
                            <span className="hero-title-follow">One workspace.</span>
                        </h1>
                    </div>
                    <div className="hero-aside">
                        <p className="hero-description">
                            Your favourite agents. Your own projects.
                            Everything you need to turn <span>“what if”</span> into something real.
                        </p>
                        <div className="hero-actions">
                            <Action icon={null} data-analytics-cta="hero_download">Get Vibyra for free</Action>
                            <Action href="#walkthrough" secondary icon={null} data-analytics-cta="hero_walkthrough">
                                Try the demo
                            </Action>
                        </div>
                        <div className="hero-meta">
                            <p className="hero-proof">
                                <span className="hero-proof-logos" aria-hidden="true">
                                    {featured.map((agent) => <i key={agent.id}><img className={agent.mono ? "agent-mono" : ""} src={logoPath(agent)} alt="" width="14" height="14" /></i>)}
                                </span>
                                <span><span className="hero-proof-lead">Works with </span>Claude Code, Codex, Gemini CLI +{others} more</span>
                            </p>
                            <a className="hero-film" href="#film" data-analytics-cta="hero_film">
                                <span className="hero-film-disc" aria-hidden="true"><Icon name="play" size={12} /></span>
                                Watch the film <span className="hero-film-time">1:04</span>
                            </a>
                        </div>
                    </div>
                </div>
                <div className="page-width hero-showcase" id="walkthrough" ref={showcase}>
                    <div className="hero-light" aria-hidden="true">
                        <div className="hero-light-halo" />
                        <div className="hero-light-rim" />
                        <div className="hero-light-floor" />
                    </div>
                    <WorkspaceDemo demo={demo} />
                </div>
            </div>
            <AgentShowcase onPick={startAgent} />
        </section>
    );
}
