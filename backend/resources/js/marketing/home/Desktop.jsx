import React from "react";
import ModeStories from "./ModeStories.jsx";

/* Code, teammates and project chat as three stories beside the hero demo. */
export default function Desktop() {
    return (
        <section className="workspace-section section-space" id="desktop" aria-labelledby="desktop-title">
            <div className="page-width">
                <div className="section-heading home-section-heading">
                    <h2 id="desktop-title">Three ways to work.</h2>
                </div>
                <ModeStories />
                <p className="mf-foot">Illustrated scenes. Code and Agents share one workspace; Chat sits beside your project.</p>
            </div>
        </section>
    );
}
