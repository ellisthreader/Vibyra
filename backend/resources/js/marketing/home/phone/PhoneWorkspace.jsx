import React from "react";
import PIcon from "./PhoneIcons.jsx";
import { instruction, reply, site } from "./phoneStory.js";

/* The selected work, as the concept draws it on the phone: a Code / Agent
 * switch in the top bar, an overline and a big title, then the conversation
 * over a composer. The clock decides how much of the instruction has been
 * typed and how many words of the reply have streamed in. */
export default function PhoneWorkspace({ typed, streamed }) {
    const words = reply.split(" ");
    return (
        <section className="ph-work">
            <div className="ph-top">
                <i className="ph-iconbtn">
                    <PIcon name="panel" />
                </i>
                <div className="ph-modes">
                    <span className="is-on">Code</span>
                    <span>Agent</span>
                </div>
                <i className="ph-iconbtn">
                    <PIcon name="plus" />
                </i>
            </div>
            <div className="ph-content">
                <span className="ph-overline">YOUR WORKSPACE</span>
                <h3 className="ph-title">Simplify the navigation</h3>
                <p className="ph-subtitle">A little less friction. A little more flow.</p>
                <div className="ph-thread">
                    <div className="ph-user">{instruction}</div>
                    <div className="ph-reply">
                        <div className="ph-reply-brand">
                            <PIcon name="spark" />
                            Vibyra
                            <span className="ph-thinking" aria-hidden="true">
                                <i />
                                <i />
                                <i />
                            </span>
                        </div>
                        <p className="ph-reply-text" aria-live="off">
                            {words.map((word, index) => (
                                <span key={index} className={index < streamed ? "is-in" : ""}>
                                    {word}{" "}
                                </span>
                            ))}
                        </p>
                        <div className="ph-file">
                            <PIcon name="file" />
                            <span>Navigation.tsx</span>
                            <b>+42</b>
                            <em>−86</em>
                        </div>
                        <div className="ph-done">
                            <PIcon name="check" />
                            Checks passed <i>·</i> ready for your next instruction
                        </div>
                        <div className="ph-live">
                            <i className="ph-live-glyph">
                                <PIcon name="globe" />
                                <b />
                            </i>
                            <span className="ph-live-copy">
                                <strong>Live preview</strong>
                                <small>{site.address} is running on your Mac</small>
                            </span>
                            <PIcon name="open" />
                            <span className="ph-finger ph-finger-live" aria-hidden="true" />
                        </div>
                    </div>
                </div>
            </div>
            <div className="ph-composer">
                <div className="ph-composer-text">
                    <span className="ph-placeholder">Continue the conversation…</span>
                    <span className="ph-typed">
                        {instruction.slice(0, typed)}
                        <i className="ph-caret" />
                    </span>
                </div>
                <div className="ph-tools">
                    <PIcon name="plus" />
                    <span>Auto</span>
                    <PIcon name="down" />
                    <i className="ph-send">
                        <PIcon name="arrow" />
                    </i>
                </div>
                <span className="ph-finger ph-finger-send" aria-hidden="true" />
            </div>
        </section>
    );
}
