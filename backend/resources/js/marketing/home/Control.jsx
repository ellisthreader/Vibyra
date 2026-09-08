import React from "react";
import { Icon, SectionLabel } from "./shared.jsx";

export default function Control() {
    return (
        <section className="control-section section-space page-width" aria-labelledby="control-title">
            <SectionLabel number="03">YOUR WORK. YOUR CALL.</SectionLabel>
            <div className="section-heading">
                <h2 id="control-title">
                    Go all in on the idea.
                    <br />
                    <span>Stay in control of the work.</span>
                </h2>
                <p>
                    A friendly way in.
                    <br />
                    Real development tools underneath.
                </p>
            </div>
            <div className="control-grid">
                <article>
                    <Icon name="monitor" size={27} />
                    <h3>Built on your computer.</h3>
                    <p>
                        Your desktop runs the terminals, project files, and preview servers. Bring a new idea
                        or a repository you already know.
                    </p>
                    <span className="control-footnote">Local execution. Familiar tools.</span>
                </article>
                <article>
                    <Icon name="branch" size={27} />
                    <h3>A little room to experiment.</h3>
                    <p>
                        Use safe mode to work in a separate Git worktree. Review the changes before you merge
                        them into your project.
                    </p>
                    <span className="control-footnote">Git isolation, not a system sandbox.</span>
                </article>
                <article>
                    <Icon name="shield" size={27} />
                    <h3>Know where the work goes.</h3>
                    <p>
                        Cloud AI uses your selected provider. Vibyra’s cloud handles accounts, credits, sync,
                        and publishing. Provider terms still apply.
                    </p>
                    <a className="text-link" href="/legal/privacy">
                        Read our privacy policy
                        <Icon size={15} />
                    </a>
                </article>
            </div>
        </section>
    );
}
