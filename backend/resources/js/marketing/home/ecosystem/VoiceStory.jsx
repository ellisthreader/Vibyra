import React from "react";
import { T, Type, Words, Key, Check, Bar, Skel } from "./storyParts.jsx";
import { ClaudeMark } from "./brandMarks.jsx";

/* Voice to prompt. F8 opens the listening pill; while the waveform moves,
 * the spoken words land in Claude Code one by one, then it gets to work.
 * Styles: home-eco-voice.css. */

const WAVE = [0.35, 0.6, 0.9, 0.55, 1, 0.7, 0.4, 0.8, 0.95, 0.5, 0.75, 1, 0.6, 0.85, 0.45, 0.7, 0.95, 0.55, 0.8, 0.4, 0.65, 0.9, 0.5, 0.3];

export default function VoiceStory() {
    return (
        <div className="ecs ecs-voice">
            <div className="ecs-win ecs-term ecs-voice-term">
                <Bar dots={false}>
                    <ClaudeMark size={14} />
                    Claude Code
                    <em>~/orbit</em>
                </Bar>
                <div className="ecs-term-body">
                    <p className="ecs-prompt ecs-past">
                        <b>›</b>
                        <Skel w={150} />
                    </p>
                    <p className="ecs-prompt ecs-past">
                        <b>⏺</b>
                        <Skel w={250} />
                    </p>
                    <p className="ecs-prompt ecs-said">
                        <b>›</b>
                        <span>
                            <Words at={1} text="make the header sticky and add a dark mode toggle" />
                        </span>
                    </p>
                    <T at={5} className="ecs-reply ecs-working">
                        <b>⏺</b>
                        <Type at={5.1} text="Adding a sticky header and a theme toggle" dur={1.3} />
                    </T>
                    <T at={6.7} className="ecs-reply">
                        <Check />
                        Done · 2 files changed
                    </T>
                </div>
            </div>
            <T at={0.2} className="ecs-voice-pill">
                <Key at={0.35}>F8</Key>
                <span className="ecs-mic" />
                <span className="ecs-wave">
                    {WAVE.map((h, i) => (
                        <i key={i} style={{ "--h": `${Math.round(h * 26)}px`, "--d": `${(i % 6) * 0.07}s` }} />
                    ))}
                </span>
                <span className="ecs-voice-label">
                    <T tag="span" at={0.4} out={4.7}>
                        Listening
                    </T>
                    <T tag="span" at={4.8} className="is-sent">
                        <Check />
                        Sent
                    </T>
                </span>
            </T>
        </div>
    );
}
