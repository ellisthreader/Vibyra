import React from "react";
import { Brand, Icon } from "./shared.jsx";
import { OrbitApp } from "./OrbitApp.jsx";

export default function PhoneDemo({ compact = false, screen = 0 }) {
    return (
        <div
            className={`phone-device ${compact ? "phone-device-compact" : ""}`}
            aria-label="Illustrative Vibyra phone app preview"
        >
            <div className="phone-status">
                <span>9:41</span>
                <div className="phone-island" />
                <span className="phone-signal">
                    ▮▮▮ <span>▰</span>
                </span>
            </div>
            <div className="phone-app-heading">
                <Brand />
                <span className="phone-account">J</span>
            </div>
            <div className="phone-screen" key={screen}>
                {screen === 0 && (
                    <div className="phone-chat">
                        <p className="phone-eyebrow">YOUR NEXT IDEA</p>
                        <p className="phone-title">
                            Good ideas
                            <br />
                            go places.
                        </p>
                        <div className="phone-user-message">
                            I have an idea for a calm little habit tracker.
                        </div>
                        <div className="phone-ai-message">
                            <span className="phone-ai-mark">
                                <Icon name="spark" size={14} />
                                Vibyra
                            </span>
                            <p>Let’s give it a little shape.</p>
                            <p>
                                A daily view, a few meaningful habits, and a gentle way to see your progress.
                            </p>
                            <div className="phone-plan">
                                <span>
                                    <i>1</i>Make room for the idea
                                </span>
                                <span>
                                    <i>2</i>Build the first version
                                </span>
                                <span>
                                    <i>3</i>Try it. Make it yours.
                                </span>
                            </div>
                        </div>
                        <div className="phone-composer">
                            <span>Your next thought…</span>
                            <span className="phone-send">↑</span>
                        </div>
                    </div>
                )}
                {screen === 1 && (
                    <div className="phone-preview-screen">
                        <div className="phone-preview-label">
                            <span className="status-dot" />
                            Generated app preview
                        </div>
                        <OrbitApp small />
                    </div>
                )}
                {screen === 2 && (
                    <div className="phone-explore">
                        <p className="phone-eyebrow">THE COMMUNITY</p>
                        <p className="phone-title">
                            A little
                            <br />
                            inspiration.
                        </p>
                        <p>See what people are building.</p>
                        <div className="explore-art explore-orbit">
                            <i>o</i>
                            <span>orbit</span>
                            <small>A gentler daily routine.</small>
                        </div>
                        <strong>Orbit · Habit tracker</strong>
                        <div className="explore-art explore-notes">
                            <span>
                                little
                                <br />
                                <em>notes.</em>
                            </span>
                        </div>
                        <strong>Little Notes · Your ideas, collected</strong>
                    </div>
                )}
            </div>
            <div className="phone-bottom-nav" aria-hidden="true">
                <span className={screen === 0 ? "active" : ""}>
                    <Icon name="spark" size={17} />
                    Chat
                </span>
                <span className={screen === 1 ? "active" : ""}>
                    <Icon name="grid" size={17} />
                    Projects
                </span>
                <span className={screen === 2 ? "active" : ""}>
                    <Icon name="globe" size={17} />
                    Explore
                </span>
            </div>
            <div className="phone-home-indicator" />
        </div>
    );
}
