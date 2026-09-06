import React from "react";
import { Icon, SectionLabel, DOWNLOAD_URL } from "./shared.jsx";

const questions = [
    [
        "What are Agent, Code, and Chat modes?",
        "Agent gives you persistent teammates with their own briefs, memory, skills, and folder access. Code is your project and CLI terminal workspace. Chat is a standalone conversation without a teammate or project attached. Agent and Chat require a compatible installed Claude Code or Codex CLI.",
    ],
    [
        "Can teammates work on a schedule?",
        "Yes. Give a teammate a routine that runs daily, on chosen days, or at an interval. Routines run while Vibyra is open on your computer; they are not always-on cloud workers. You can also choose which teammates are allowed to hand work to each other.",
    ],
    [
        "Do I need to know how to code?",
        "You can start by describing your idea in plain language. Vibyra brings your coding agents and previews into one workspace, so you can learn as you build. You’ll still need to set up your chosen agents, review their work, and test what you create.",
    ],
    [
        "Which computers can I use?",
        <>
            Public desktop beta downloads are available for Windows and Linux. macOS is coming later. Visit{" "}
            <a href={DOWNLOAD_URL}>Downloads</a> for current packages and platform availability.
        </>,
    ],
    [
        "Can I use Vibyra on my phone?",
        "The phone companion is in development, with project-aware AI chat, generated-app previews, and community discovery. Public phone access is coming soon. Connecting it to the current native desktop is also upcoming; remote control isn’t included in today’s desktop beta.",
        "phone-availability",
    ],
    [
        "Can I bring my own coding agents?",
        "Yes. The desktop supports installed Claude Code, Codex, Gemini, Aider, OpenCode, and Qwen Code CLIs, plus custom agent commands. You use the account and credentials required by each provider. Their subscriptions and usage limits are separate from Vibyra’s cloud AI plans.",
    ],
    [
        "Can I work on a project I already have?",
        "Yes. Open a local project and use your agents in its workspace. You keep your repository and existing tools. For Git projects, safe mode can create a separate worktree so you can review an experiment before merging it back.",
    ],
    [
        "Does my code stay on my computer?",
        <>
            Your project files, terminals, and local previews run on your computer. AI providers can receive
            the context you send them, while accounts, cloud chat, sync, and publishing use Vibyra’s services.
            It is not a fully offline workflow. See our <a href="/legal/privacy">privacy policy</a> for more.
        </>,
    ],
    [
        "What does safe mode protect?",
        "Safe mode creates an isolated Git worktree for your agent’s changes. You can inspect the diff and merge or discard the work. It is Git-level isolation, not an operating-system sandbox. Command permissions also depend on the agent and access settings you choose.",
    ],
    [
        "What can I preview or publish?",
        "Desktop Preview runs supported local web projects, including supported package scripts, static sites, and Laravel/PHP targets, at different viewport sizes. The phone has generated-app preview and community publishing paths. Publishing is for supported demos and listings, not a promise of production hosting for every stack.",
    ],
    [
        "How do Vibyra credits work?",
        "Credits cover Vibyra-routed cloud AI usage, with model and usage limits set by your plan. They are separate from your coding agents’ own provider accounts. Current monthly credits and project allowances are shown above; billing and account settings manage your membership.",
    ],
];

export default function Questions() {
    return (
        <section className="faq-section section-space page-width" id="faq" aria-labelledby="faq-title">
            <div className="faq-intro">
                <SectionLabel number="05">A FEW GOOD QUESTIONS</SectionLabel>
                <h2 id="faq-title">
                    A little clarity
                    <br />
                    <span>before you build.</span>
                </h2>
                <p>
                    Real tools. Clear expectations.
                    <br />
                    Here’s what to know.
                </p>
            </div>
            <div className="faq-list">
                {questions.map(([question, answer, id], index) => (
                    <details className="faq-item" id={id} key={question}>
                        <summary>
                            <span className="faq-number">{String(index + 1).padStart(2, "0")}</span>
                            <span>{question}</span>
                            <Icon name="plus" size={19} />
                        </summary>
                        <div className="faq-answer">{answer}</div>
                    </details>
                ))}
            </div>
        </section>
    );
}
