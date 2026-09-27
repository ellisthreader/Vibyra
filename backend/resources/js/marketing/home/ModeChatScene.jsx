import React from "react";
import { Icon } from "./shared.jsx";
import { Scene, at, Words } from "./ModeStoryFrame.jsx";

/* Project Chat: two turns. Yours are cobalt bubbles on the right;
 * Vibyra answers on the left beside its mark, streamed a word at a time. */
function Turn({ you, from, children }) {
    return (
        <div className={`mf-turn${you ? " mf-turn-you" : ""}`} style={at(from)}>
            {!you && (
                <span className="mf-face">
                    <img
                        src="/vibyra-cobalt.png"
                        alt=""
                        width="32"
                        height="24"
                    />
                </span>
            )}
            <div className="mf-bubble">{children}</div>
        </div>
    );
}

export function ChatScene() {
    return (
        <Scene className="mf-chatmode">
            <div className="mf-chat">
                <p className="mf-chat-head">
                    <span>Vibyra AI</span>
                    <em>Orbit</em>
                </p>
                <div className="mf-thread">
                    <Turn you from={0.3}>
                        <Words
                            text="We shipped the habit tracker to a few friends. What should I look at first?"
                            from={0.3}
                        />
                    </Turn>
                    <p
                        className="mf-typing"
                        style={{ ...at(1.6), "--gone": "2.4s" }}
                    >
                        <i />
                        <i />
                        <i />
                    </p>
                    <Turn from={2.4}>
                        <Words
                            text="Open it the way a new person would, and write down every moment you had to stop and think."
                            from={2.5}
                        />
                    </Turn>
                    <Turn you from={5.4}>
                        <Words text="Give me three things to try." from={5.4} />
                    </Turn>
                    <p
                        className="mf-typing"
                        style={{ ...at(6.4), "--gone": "7.2s" }}
                    >
                        <i />
                        <i />
                        <i />
                    </p>
                    <Turn from={7.2}>
                        <ol className="mf-steps">
                            <li style={at(7.3)}>
                                Hand it to someone who hasn’t seen it.
                            </li>
                            <li style={at(7.9)}>Watch, don’t help.</li>
                            <li style={at(8.5)}>
                                Fix the first thing they got stuck on.
                            </li>
                        </ol>
                    </Turn>
                </div>
                <div className="mf-composer">
                    <span className="mf-attach">
                        <Icon name="plus" size={14} />
                    </span>
                    <span>Ask anything</span>
                    <span className="mf-send">
                        <Icon name="arrow" size={14} />
                    </span>
                </div>
            </div>
        </Scene>
    );
}
