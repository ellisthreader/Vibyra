import React from "react";
import PIcon from "./PhoneIcons.jsx";
import { instruction, reply, rows } from "./phoneStory.js";

/* The MacBook the phone is mirroring. Its screen shows the same app at
 * desk size — the same list of open work down the side, the same
 * conversation in the workspace — and it follows the same clock, so when the
 * phone streams a reply the Mac is streaming it too. */
export default function MacPanel({ story, reached }) {
    const has = (key) => reached.includes(key);
    const words = reply.split(" ");
    const ticked = (id) => has("done") && (id === "nav" || id === "tests");
    return (
        <div className="mobile-mac" aria-label="The same workspace on the Mac, illustrative">
            <div className="mobile-mac-lid">
                <div className="mobile-mac-screen">
                    <aside className="mobile-mac-rail">
                        <div className="mobile-mac-project">
                            Orbit
                            <PIcon name="down" />
                        </div>
                        <div className="mobile-mac-new">
                            <PIcon name="plus" />
                            New terminal
                        </div>
                        <div className="mobile-mac-open">
                            Open<span>6</span>
                        </div>
                        {rows.map((row, index) => (
                            <div key={row.id} className={`mobile-mac-row ${index === 0 ? "is-selected" : ""}`} data-state={ticked(row.id) ? "done" : row.state}>
                                <PIcon name="chat" />
                                <span>{row.title}</span>
                                <i />
                            </div>
                        ))}
                        <div className="mobile-mac-row" data-state="running">
                            <PIcon name="terminal" />
                            <span>Development server</span>
                            <i />
                        </div>
                        <div className="mobile-mac-computer">
                            <PIcon name="computer" />
                            Ellis’s MacBook
                            <i />
                        </div>
                    </aside>
                    <section className="mobile-mac-work">
                        <div className="mobile-mac-tabs">
                            <PIcon name="spark" />
                            Simplify the navigation
                            <em>{has("done") ? "Ready" : has("sent") ? "Working" : "Ready"}</em>
                        </div>
                        <div className="mobile-mac-thread">
                            <p className={`mobile-mac-user ${has("sent") ? "is-on" : ""}`}>› {instruction}</p>
                            <p className={`mobile-mac-line ${has("thinking") ? "is-on" : ""}`}>
                                {words.map((word, index) => (
                                    <span key={index} className={index < story.streamed ? "is-in" : ""}>
                                        {word}{" "}
                                    </span>
                                ))}
                            </p>
                            <p className={`mobile-mac-diff ${has("card") ? "is-on" : ""}`}>
                                Navigation.tsx <b>+42</b> <s>−86</s>
                            </p>
                            <p className={`mobile-mac-ok ${has("done") ? "is-on" : ""}`}>✓ Checks passed</p>
                        </div>
                        <div className="mobile-mac-input">
                            <span>›</span>
                            {has("sent") ? "Give the agent an instruction…" : instruction.slice(0, story.typed) || "Give the agent an instruction…"}
                        </div>
                    </section>
                </div>
            </div>
            <div className="mobile-mac-base" />
            <p className="mobile-mac-caption">
                <i />
                Your Mac · in sync with your phone
            </p>
        </div>
    );
}
