import React from "react";
import { Icon, SectionLabel } from "../home/shared.jsx";

const questions = [
    [
        "Do I need an account or a paid plan?",
        <>
            No account or payment is needed to download the desktop app. You’ll sign in to a Vibyra account
            when you open it. Your connected coding agents use their own provider accounts and usage limits.
            Optional Vibyra plans cover Vibyra’s cloud AI credits.{" "}
            <a href="/#pricing">See plans and pricing</a>.
        </>,
    ],
    [
        "Which Linux download should I choose?",
        "Choose .deb for Debian or Ubuntu-based systems to install through the system package manager. AppImage is a portable alternative for compatible Linux systems. Both current packages are 64-bit; check the installation steps above.",
    ],
    [
        "Can I use it on my Mac?",
        "Use the macOS card to see which installers are currently available. Apple Silicon and Intel releases are listed separately when ready. We don’t infer the chip inside your Mac from your browser.",
    ],
    [
        "Where can I get the phone companion?",
        <>
            Public phone access is coming soon. The companion focuses on project-aware AI chat, generated
            previews, and community discovery. Connecting to the current native desktop is also upcoming.{" "}
            <a href="/#mobile">Meet Vibyra Mobile</a>.
        </>,
    ],
    [
        "Will I need to download every update here?",
        "Usually, you can update from inside Vibyra. Check for updates from the command bar and follow the app’s download and restart prompts. This page is also here if you need a fresh installer.",
    ],
    [
        "Can I use my existing projects and agents?",
        "Yes. Open your local project and bring your installed coding agents. Code Mode supports the CLI catalogue; Agent and Chat modes use compatible Claude Code or Codex installations. Your repository and provider accounts remain yours.",
    ],
];

export default function DownloadQuestions() {
    return (
        <section
            className="faq-section section-space page-width"
            id="download-questions"
            aria-labelledby="download-faq-title"
        >
            <div className="faq-intro">
                <SectionLabel number="02">BEFORE YOU GET GOING</SectionLabel>
                <h2 id="download-faq-title">
                    A little clarity.
                    <br />
                    <span>Then, let’s build.</span>
                </h2>
                <p>
                    A few answers to help you
                    <br />
                    feel at home from the start.
                </p>
            </div>
            <div className="faq-list">
                {questions.map(([question, answer], index) => (
                    <details className="faq-item" key={question}>
                        <summary>
                            <span className="faq-number">0{index + 1}</span>
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
