import React, { useRef } from "react";
import { TabKeys } from "./shared.jsx";
import PhoneShell, { PHONE_WIDTH } from "./phone/PhoneShell.jsx";
import MacPanel from "./phone/MacPanel.jsx";
import usePhoneStory, { usePhoneScale } from "./phone/usePhoneStory.js";
import { phases, scenes } from "./phone/phoneStory.js";

/* The stage is drawn at page width and scaled down with it, so the phone,
 * the Mac behind it and the signal between them always keep their places. */
const STAGE_WIDTH = 1240;
const LINK = "M 736 340 C 650 300, 470 300, 395 390";

export default function Mobile() {
    const stageRef = useRef(null);
    const sceneRef = useRef(null);
    const wrapRef = useRef(null);
    const { story, still, jump, paused, togglePause } = usePhoneStory(stageRef);
    usePhoneScale(sceneRef, STAGE_WIDTH, "--s");
    usePhoneScale(wrapRef, PHONE_WIDTH);
    const scene = story.scene;
    const reached = phases.slice(0, phases.findIndex((p) => p.key === story.phase) + 1).map((p) => p.key);

    return (
        <section className="mobile-section" id="mobile" aria-labelledby="mobile-title">
            <div className="page-width mobile-head home-section-heading">
                <p className="mobile-availability">Vibyra Mobile · In development</p>
                <h2 id="mobile-title">
                    Your desk,
                    <br />
                    in your pocket.
                </h2>
            </div>

            <div
                className={`page-width mobile-visual ${still ? "is-still is-shown" : ""} ${paused ? "is-paused" : ""}`}
                ref={stageRef}
                role="tabpanel"
                id="phone-demo-panel"
                aria-labelledby={`phone-tab-${scene}`}
                tabIndex={0}
                data-phase={story.phase}
                data-scene={scene}
            >
                <div className="mobile-stage" ref={sceneRef}>
                    <div className="mobile-scene">
                        <div className="mobile-light" aria-hidden="true" />
                        <div className="mobile-floor" aria-hidden="true" />
                        <svg className="mobile-link" viewBox={`0 0 ${STAGE_WIDTH} 840`} aria-hidden="true">
                            <path d={LINK} />
                        </svg>
                        <i className="mobile-signal is-out" style={{ offsetPath: `path("${LINK}")` }} aria-hidden="true" />
                        <i className="mobile-signal is-back" style={{ offsetPath: `path("${LINK}")` }} aria-hidden="true" />
                        <i className="mobile-signal is-back is-late" style={{ offsetPath: `path("${LINK}")` }} aria-hidden="true" />
                        <i className="mobile-signal is-done" style={{ offsetPath: `path("${LINK}")` }} aria-hidden="true" />
                        <MacPanel story={story} reached={reached} />
                        <div className="mobile-phone-wrap" ref={wrapRef}>
                            <div className="mobile-phone-scale">
                                <PhoneShell story={story} />
                            </div>
                        </div>
                    </div>
                </div>
                <div
                    className="mobile-steps"
                    role="tablist"
                    aria-label="Chapters"
                    onKeyDown={(event) => TabKeys(event, scenes, scene, jump, "phone-tab")}
                >
                    {scenes.map((item, index) => (
                        <button
                            key={item.id}
                            role="tab"
                            id={`phone-tab-${index}`}
                            className={`mobile-step ${index < scene ? "is-done" : ""}`}
                            aria-controls="phone-demo-panel"
                            aria-selected={scene === index}
                            tabIndex={scene === index ? 0 : -1}
                            onClick={() => jump(index)}
                        >
                            <i className="mobile-step-bar" aria-hidden="true" />
                            <span className="mobile-step-title">
                                <small>0{index + 1}</small>
                                {item.title}
                            </span>
                            <span className="mobile-step-text">{item.text}</span>
                        </button>
                    ))}
                </div>
                <div className="mobile-controls">
                    {!still && <button className="mobile-playback" onClick={togglePause} aria-pressed={paused}>
                        <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
                        {paused ? "Play story" : "Pause story"}
                    </button>}
                    <p className="mobile-demo-note">ILLUSTRATIVE PREVIEW</p>
                </div>
            </div>
        </section>
    );
}
