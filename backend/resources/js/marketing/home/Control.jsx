import React from "react";
import { Icon, SectionLabel } from "./shared.jsx";
import FeatureGrid from "./features/FeatureGrid.jsx";

/* Section 03: the tools around your agents. A bento of live scenes, one per
 * feature (features/), then the plain facts about where the work runs. */
const TRUST = [
    {
        icon: "monitor",
        title: "Built on your computer.",
        copy: "Your desktop runs the terminals, project files and preview servers. Bring a new idea or a repository you already know.",
    },
    {
        icon: "branch",
        title: "Git isolation, not a system sandbox.",
        copy: "Safe mode keeps each agent’s changes in its own worktree until you approve them.",
    },
    {
        icon: "shield",
        title: "Know where the work goes.",
        copy: "Cloud AI uses the provider you choose. Vibyra’s cloud handles accounts, credits, sync and publishing. Provider terms still apply.",
        link: true,
    },
];

export default function Control() {
    return (
        <section className="fx section-space" id="why" aria-labelledby="control-title">
            <div className="page-width">
                <SectionLabel number="03" light>
                    THE TOOLS AROUND YOUR AGENTS
                </SectionLabel>
                <div className="section-heading">
                    <h2 id="control-title">
                        Show it. Say it.
                        <br />
                        <span>Watch it happen.</span>
                    </h2>
                    <p>Point at the problem, say what you want, and watch your agents get it done.</p>
                </div>
                <FeatureGrid />
                <ul className="fx-trust">
                    {TRUST.map((item) => (
                        <li key={item.icon}>
                            <Icon name={item.icon} size={20} />
                            <p>
                                <strong>{item.title}</strong>
                                {item.copy}
                                {item.link && (
                                    <a className="fx-trust-link" href="/legal/privacy">
                                        Read our privacy policy
                                    </a>
                                )}
                            </p>
                        </li>
                    ))}
                </ul>
                <p className="fx-foot">
                    Illustrated demos of Vibyra Desktop. Screenshot capture works on Windows and Linux. Voice input works
                    on Linux and uses your own OpenAI key.
                </p>
            </div>
        </section>
    );
}
