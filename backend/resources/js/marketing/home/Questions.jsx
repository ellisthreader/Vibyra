import React from "react";
import { Icon, DOWNLOAD_URL } from "./shared.jsx";
import AskVibyra from "./AskVibyra.jsx";

/* Section 05: the short questions as plain rows, then a row where a visitor
 * asks their own and the answer is written in underneath. */
const questions = [
    [
        "How do Code, Agents and Chat work?",
        "Code is your project and terminal workspace, with coding agents side by side. Agents gives you teammates with their own brief, memory, skills and folder access, and they can run on a routine while Vibyra is open. Chat sits in Code's project sidebar beside Worktrees and Preview. Teammates need a compatible installed Claude Code or Codex.",
    ],
    [
        "Do I need to know how to code?",
        "No. Describe the idea in plain language and learn as you build. You still choose and set up your agents, look over what they make and try it out yourself, and Vibyra keeps all of that in one place.",
    ],
    [
        "Can I use my own agents and my own projects?",
        "Yes to both. Vibyra works with installed Claude Code, Codex, Gemini, Aider, OpenCode and Qwen Code, signed in with each tool’s own account. Open any local project and your agents work in it; your repository and your provider subscriptions stay yours, separate from Vibyra’s cloud credits.",
    ],
    [
        "Does my code stay on my computer?",
        <>
            Your files, terminals and previews run on your computer. AI providers only receive what you or your
            agents send them; Vibyra’s cloud handles accounts, sync and publishing. Safe mode adds a separate Git
            worktree per agent, so you review and approve changes before they land. More in our{" "}
            <a href="/legal/privacy">privacy policy</a>.
        </>,
    ],
    [
        "Which computers and phones can I use?",
        <>
            Visit <a href={DOWNLOAD_URL} data-analytics-cta="faq_downloads">Downloads</a> to see the current Windows, macOS and Linux
            installers and system requirements. The phone companion is in development. You can explore
            the <a href="#mobile">phone walkthrough</a> here on the website.
        </>,
    ],
];

export default function Questions() {
    return (
        <section className="faq-section qa section-space" id="faq" aria-labelledby="faq-title">
            <div className="page-width qa-grid">
                <div className="qa-intro home-section-heading">
                    <h2 id="faq-title">Questions</h2>
                    <p>The short ones are here. For anything else, ask Vibyra below.</p>
                </div>
                <div className="qa-list">
                    {questions.map(([question, answer]) => (
                        <details className="faq-item qa-item" name="faq" key={question}>
                            <summary>
                                <span>{question}</span>
                                <Icon name="plus" size={20} />
                            </summary>
                            <div className="qa-answer">{answer}</div>
                        </details>
                    ))}
                    <AskVibyra />
                </div>
            </div>
        </section>
    );
}
