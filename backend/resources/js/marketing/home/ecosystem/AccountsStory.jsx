import React from "react";
import { T, Check } from "./storyParts.jsx";
import { ClaudeMark, OpenAIMark, GeminiMark, GitHubMark, FigmaMark, GoogleMark, StripeMark, ObsidianMark } from "./brandMarks.jsx";

/* Connect all your accounts. Sign in to the three AI providers with the
 * subscriptions you already pay for, then the apps light up one by one; the API key
 * field is struck out because nobody needs one. Styles: home-eco-accounts.css. */

const AI = [
    { name: "Claude", Mark: ClaudeMark, at: 0.7 },
    { name: "ChatGPT", Mark: OpenAIMark, at: 1.2 },
    { name: "Gemini", Mark: GeminiMark, at: 1.7 },
];
const APPS = [
    { name: "GitHub", Mark: GitHubMark, at: 2.3 },
    { name: "Figma", Mark: FigmaMark, at: 2.6 },
    { name: "Google", Mark: GoogleMark, at: 2.9 },
    { name: "Stripe", Mark: StripeMark, at: 3.2 },
    { name: "Obsidian", Mark: ObsidianMark, at: 3.5 },
];

export default function AccountsStory() {
    return (
        <div className="ecs ecs-accounts">
            <div className="ecs-win ecs-acc-panel">
                <div className="ecs-bar">
                    Accounts
                    <span className="ecs-acc-count">
                        <T tag="span" at={0} out={3.9}>
                            Sign in once
                        </T>
                        <T tag="span" at={4} className="is-on">
                            8 connected
                        </T>
                    </span>
                </div>
                <div className="ecs-acc-body">
                    <div className="ecs-acc-ai">
                        {AI.map(({ name, Mark, at: t }) => (
                            <div key={name} className="ecs-acc-tile" style={{ "--in": `${t}s` }}>
                                <Mark size={22} />
                                <p>
                                    {name}
                                    <span className="ecs-acc-state">
                                        <T tag="small" at={0} out={t}>
                                            Sign in
                                        </T>
                                        <T tag="small" at={t} className="is-on">
                                            Connected
                                        </T>
                                    </span>
                                </p>
                                <T tag="span" at={t + 0.1} className="ecs-acc-badge">
                                    <Check />
                                </T>
                            </div>
                        ))}
                    </div>
                    <div className="ecs-acc-apps">
                        {APPS.map(({ name, Mark, at: t }) => (
                            <div key={name} className="ecs-acc-tile" style={{ "--in": `${t}s` }}>
                                <Mark size={22} />
                                <p>{name}</p>
                                <T tag="span" at={t + 0.1} className="ecs-acc-badge">
                                    <Check />
                                </T>
                            </div>
                        ))}
                    </div>
                    <T at={4.3} className="ecs-acc-key">
                        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                            <circle cx="5" cy="8" r="3" />
                            <path d="M8 8h6.5M12 8v2.5M14.5 8v2" />
                        </svg>
                        API key
                        <s>sk-ant-api03-••••••••••</s>
                        <b>Not needed</b>
                    </T>
                </div>
            </div>
        </div>
    );
}
