import React from "react";
import useReveal from "../useReveal.jsx";
import { Icon } from "./shared.jsx";
import { HABITS, SESSIONS, TERMINALS, WEEK } from "./workbenchData.js";

/* A cutaway of the Vibyra Desktop window: the shell keeps the sockets its panes
 * sit in, and the panes themselves are lifted out of them. Scrolling into view
 * plays the lift once, then the agents finish the task they were given. */

/* Each pane rests lifted out of its socket, and the lift itself lives in CSS, so
 * the cutaway is already correct before a single frame runs. The reveal only
 * plays the delta — the pane rising out of the socket it belongs in — and
 * useReveal marks the figure visible straight away when the visitor asks for
 * reduced motion, which the page's global rule then renders without motion. */

function Chrome() {
    return (
        <div className="wbx-chrome">
            <span className="wbx-mark">V</span>
            <span className="wbx-brand">Vibyra</span>
            <span className="wbx-modes">
                <i>Agent</i>
                <i className="is-on">Code</i>
                <i>Chat</i>
            </span>
            <span className="wbx-search">
                Search or run a command
                <b>Ctrl K</b>
            </span>
            <span className="wbx-window">
                <i />
                <i />
                <i />
            </span>
        </div>
    );
}

function Rail() {
    return (
        <div className="wbx-rail">
            <p className="wbx-rail-head">
                Terminals
                <span>+</span>
            </p>
            {SESSIONS.map((session) => (
                <p className={`wbx-session ${session.state === "running" ? "is-on" : ""}`} key={session.name}>
                    <i className="wbx-dot" />
                    {session.name}
                    {session.badge && <b>{session.badge}</b>}
                </p>
            ))}
            <p className="wbx-rail-foot">
                <Icon name="shield" size={12} />
                Safe workspace
            </p>
        </div>
    );
}

function Terminal({ term, index }) {
    return (
        <div className="wbx-term">
            <p className="wbx-term-bar">
                <span className={`wbx-agent-mark wbx-agent-${term.tone}`}>{term.mark}</span>
                {term.agent}
                <i className="wbx-dot" />
            </p>
            <div className="wbx-screen">
                <p className="wbx-cwd">{term.cwd}</p>
                <p className="wbx-cmd">
                    <span>›</span>
                    {term.cmd}
                </p>
                <p className="wbx-said">{term.prompt}</p>
                {term.lines.map((line, row) => (
                    <p
                        className={`wbx-out wbx-out-${line.tone}`}
                        key={line.text}
                        style={{ "--d": `${1.05 + index * 0.35 + row * 0.34}s`, "--ch": line.text.length }}
                    >
                        <span className="wbx-type">{line.text}</span>
                        {line.meta && <b>{line.meta}</b>}
                    </p>
                ))}
                <p className="wbx-caret" style={{ "--d": `${2.4 + index * 0.35}s` }}>
                    <span>›</span>
                    <i />
                </p>
            </div>
        </div>
    );
}

function Dock() {
    return (
        <>
            <p className="wbx-dock-tabs">
                <i className="is-on">Preview</i>
                <i>Review</i>
                <i>Notes</i>
            </p>
            <div className="wbx-preview">
                <p className="wbx-url">
                    orbit.localhost
                    <b>Desktop</b>
                </p>
                <div className="wbx-orbit">
                    <p className="wbx-orbit-title">
                        Small steps.
                        <br />
                        <span>Good things.</span>
                    </p>
                    <p className="wbx-week">
                        {WEEK.map((height, day) => (
                            <i key={day} style={{ "--h": `${height}%` }} className={day === 4 ? "is-on" : ""} />
                        ))}
                    </p>
                    {HABITS.map((habit) => (
                        <p className="wbx-habit" key={habit.name}>
                            <span className={`wbx-habit-mark wbx-habit-${habit.tone}`}>{habit.mark}</span>
                            <span className="wbx-habit-copy">
                                <strong>{habit.name}</strong>
                                <span>{habit.note}</span>
                            </span>
                            <span className={habit.done ? "wbx-check is-on" : "wbx-check"}>
                                {habit.done && <Icon name="check" size={9} />}
                            </span>
                        </p>
                    ))}
                    <p className="wbx-orbit-new">Weekly summary added</p>
                </div>
            </div>
        </>
    );
}

export default function Workbench() {
    const ref = useReveal();
    return (
        <figure className="wbx" ref={ref}>
            <div className="wbx-stage">
                <div className="wbx-scene" aria-hidden="true">
                    <div className="wbx-slab wbx-shell">
                        <div className="wbx-lift">
                            <Chrome />
                            <div className="wbx-body">
                                <Rail />
                                <div className="wbx-sockets">
                                    <span className="wbx-socket wbx-socket-terminals" />
                                    <span className="wbx-socket wbx-socket-dock" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="wbx-slab wbx-pane-terminals">
                        <div className="wbx-lift wbx-pane">
                            {TERMINALS.map((term, index) => (
                                <Terminal term={term} index={index} key={term.agent} />
                            ))}
                        </div>
                    </div>

                    <div className="wbx-slab wbx-pane-dock">
                        <div className="wbx-lift wbx-pane">
                            <Dock />
                        </div>
                    </div>
                </div>

                {/* Flipped where the label sits left of the part it names, so the
                    leader always leaves the end nearest the artwork. */}
                <p className="wbx-tags">
                    <span className="wbx-tag wbx-tag-shell">Projects, sessions, and modes</span>
                    <span className="wbx-tag wbx-tag-flip wbx-tag-terminals">Up to 12 terminal panes</span>
                    <span className="wbx-tag wbx-tag-flip wbx-tag-dock">Preview, review, and notes</span>
                </p>
            </div>
            <figcaption>The Vibyra Desktop window, opened up.</figcaption>
        </figure>
    );
}
