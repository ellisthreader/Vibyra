import React from "react";
import TeamAtWork from "./TeamAtWork.jsx";
import { CodeScene } from "./ModeCodeScene.jsx";
import { ChatScene } from "./ModeChatScene.jsx";

const modes = [
    {
        name: "Code",
        line: "Up to 12 terminals, an agent in each.",
        Scene: CodeScene,
    },
    {
        name: "Agents",
        line: "Teammates with real jobs, on your schedule.",
        Scene: () => <TeamAtWork count={4} compact />,
    },
    {
        name: "Chat",
        line: "Ask about your project beside its terminals.",
        Scene: ChatScene,
    },
];

/* Three cards across, one per way to work: the word, its line, a small screen with
 * the scene. Same surface, same rhythm, nothing to click. */
export default function ModeStories() {
    return (
        <div className="mf">
            {modes.map(({ name, line, Scene: Picture }) => (
                <article className="mf-card" key={name}>
                    <header className="mf-head">
                        <h3>{name}</h3>
                        <p className="mf-line">{line}</p>
                    </header>
                    <div className="mf-screen">
                        <Picture />
                    </div>
                </article>
            ))}
        </div>
    );
}
