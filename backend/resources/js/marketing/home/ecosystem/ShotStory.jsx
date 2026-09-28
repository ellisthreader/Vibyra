import React from "react";
import { T, Type, Key, Pointer, Check, Bar, Skel, at } from "./storyParts.jsx";
import { ClaudeMark } from "./brandMarks.jsx";

/* Screenshot to prompt. A little site with one card knocked out of line.
 * F9 dims it, you drag round the cards and circle the broken one; the
 * capture shrinks into Claude Code as [Image #1], "fix the spacing here"
 * types, and the card drops back into line. Styles: home-eco-shot.css. */
export default function ShotStory() {
    return (
        <div className="ecs ecs-shot">
            <div className="ecs-win ecs-shot-site">
                <Bar>
                    <span className="ecs-url">localhost:3000</span>
                </Bar>
                <div className="ecs-site">
                    <p className="ecs-site-nav">
                        <i />
                        orbit
                        <Skel w={26} />
                        <Skel w={22} />
                        <Skel w={30} />
                        <b>Join</b>
                    </p>
                    <p className="ecs-site-h">
                        Small steps. <span>Good things.</span>
                    </p>
                    <div className="ecs-site-cards">
                        {["Streaks", "Reminders", "Insights"].map((name, i) => (
                            <p key={name} className={i === 1 ? "is-off" : ""}>
                                <i />
                                {name}
                                <Skel w="82%" />
                                <Skel w="56%" />
                            </p>
                        ))}
                    </div>
                </div>
                <T at={0.8} out={3.3} className="ecs-sel" />
                <T at={1.9} out={3.3} className="ecs-ink">
                    <svg viewBox="0 0 148 92" width="148" height="92" aria-hidden="true">
                        <path d="M84 6C44 2 7 15 6 44s33 43 72 42 64-15 63-42S114 2 62 7" pathLength="1" style={at(2)} />
                    </svg>
                </T>
            </div>
            <Key at={0.3} className="ecs-shot-key">
                F9
            </Key>
            <Pointer className="ecs-shot-pointer" />
            <i className="ecs-shot-fly" />
            <div className="ecs-win ecs-term ecs-shot-term">
                <Bar dots={false}>
                    <ClaudeMark size={14} />
                    Claude Code
                    <em>~/orbit</em>
                </Bar>
                <div className="ecs-term-body">
                    <p className="ecs-prompt">
                        <b>›</b>
                        <T tag="span" at={3.85} className="ecs-image-chip">
                            <span className="ecs-thumb">
                                <i />
                                <i />
                                <i />
                            </span>
                            [Image #1]
                        </T>
                        <Type at={4.05} text="fix the spacing here" dur={1.1} />
                        <T tag="span" at={5.3} className="ecs-sent">
                            ↵
                        </T>
                    </p>
                    <T at={5.9} className="ecs-reply">
                        <Check />
                        Fixed the gap in <code>Features.tsx</code>
                    </T>
                </div>
            </div>
        </div>
    );
}
