import React from "react";
import PIcon from "./PhoneIcons.jsx";
import { site } from "./phoneStory.js";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

/* Live preview, as the app shows it: an address bar over the site the Mac is
 * running, drawn with the hero's own Orbit sample, and the round controls
 * button floating at the side. `done` is how many habits have been ticked. */
export default function PhonePreview({ done }) {
    const total = site.habits.length;
    return (
        <section className="ph-preview" aria-hidden="true">
            <div className="ph-address">
                <span className="ph-address-pill">{site.address}</span>
                <PIcon name="refresh" />
                <i className="ph-address-load" />
            </div>
            <div className="ph-site">
                <article className="pg-orbit" data-theme="light">
                    <header className="pg-orbit-header">
                        <div className="pg-orbit-brand"><span className="pg-orbit-logo" />orbit</div>
                        <div className="pg-orbit-today">Today <span>E</span></div>
                    </header>
                    <main className="pg-orbit-content">
                        <div className="pg-orbit-intro">
                            <span className="pg-orbit-kicker">A LITTLE BETTER, EVERY DAY</span>
                            <h3>{site.title}</h3>
                        </div>
                        <section className="pg-orbit-progress">
                            <div>
                                <span>TODAY'S PROGRESS</span>
                                <strong>{done === total ? "All done for today" : "You're finding your rhythm"}</strong>
                            </div>
                            <div className="pg-progress-ring" style={{ "--progress": `${Math.round((done / total) * 100)}%` }}>
                                <b>{done}<small>/{total}</small></b>
                            </div>
                        </section>
                        <div className="pg-orbit-week">
                            {WEEK.map((day, index) => (
                                <span key={index} className={index === 3 ? "selected" : ""}>
                                    <small>{day}</small>
                                    <b>{index === 3 ? "●" : index < 3 ? "✓" : "·"}</b>
                                </span>
                            ))}
                        </div>
                        <section className="pg-orbit-habits">
                            <div className="pg-section-heading"><h4>Your habits</h4><span>{done} of {total} done</span></div>
                            <div className="pg-habits">
                                {site.habits.map((name, index) => (
                                    <div key={name} className="pg-habit" aria-pressed={index < done}>
                                        <span className="pg-habit-symbol">{["↗", "≈", "✧"][index]}</span>
                                        <span className="pg-habit-copy">
                                            <strong>{name}</strong>
                                            <small>{index < done ? "A little win. Well done." : "A moment, just for you."}</small>
                                        </span>
                                        <span className="pg-habit-check">{index < done && <PIcon name="check" />}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <div className="pg-momentum">
                            <div><span>YOUR MOMENTUM</span><strong>Look at you go.</strong></div>
                            <div className="pg-momentum-bars">
                                {[23, 36, 28, 44, 36, 58, 68, 54, 78, 66, 89, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
                            </div>
                        </div>
                    </main>
                </article>
            </div>
            <i className="ph-preview-controls"><PIcon name="settings" /></i>
            <span className="ph-finger ph-finger-habit" aria-hidden="true" />
        </section>
    );
}
