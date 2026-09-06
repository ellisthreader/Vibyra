import React, { useState } from "react";
import { Icon, SectionLabel, TabKeys } from "./shared.jsx";
import PhoneDemo from "./PhoneDemo.jsx";

const screens = [
    {
        label: "Think it through",
        icon: "spark",
        text: "Turn a passing thought into a plan. Keep project-aware AI conversations in your pocket.",
    },
    {
        label: "See what’s possible",
        icon: "phone",
        text: "Open generated app previews and explore the little details on a screen that fits your hand.",
    },
    {
        label: "Find your next spark",
        icon: "globe",
        text: "Explore community projects, discover ideas, and share what you’re making.",
    },
];

export default function Mobile() {
    const [screen, setScreen] = useState(0);
    return (
        <section className="mobile-section" id="mobile" aria-labelledby="mobile-title">
            <div className="page-width mobile-layout">
                <div className="mobile-copy">
                    <SectionLabel number="02" light>
                        MEET VIBYRA MOBILE
                    </SectionLabel>
                    <h2 id="mobile-title">
                        Ideas don’t wait
                        <br />
                        for you to
                        <br />
                        <span>get to your desk.</span>
                    </h2>
                    <p className="mobile-description">
                        A companion for the in-between moments.
                        <br />
                        The train ride. The coffee break.
                        <br />
                        The idea you don’t want to forget.
                    </p>
                    <span className="coming-soon">
                        <span className="status-dot" />
                        PHONE APP · COMING SOON
                    </span>
                    <div
                        className="phone-feature-tabs"
                        role="tablist"
                        aria-orientation="vertical"
                        aria-label="Explore the phone app"
                        onKeyDown={(event) => TabKeys(event, screens, screen, setScreen, "phone-tab")}
                    >
                        {screens.map((item, index) => (
                            <button
                                key={item.label}
                                role="tab"
                                id={`phone-tab-${index}`}
                                aria-controls="phone-demo-panel"
                                aria-selected={screen === index}
                                tabIndex={screen === index ? 0 : -1}
                                onClick={() => setScreen(index)}
                            >
                                <Icon name={item.icon} size={20} />
                                <span>{item.label}</span>
                                <Icon size={17} />
                            </button>
                        ))}
                    </div>
                    <p className="phone-feature-description" aria-live="polite">
                        {screens[screen].text}
                    </p>
                    <a
                        className="text-link"
                        href="#phone-availability"
                        onClick={() => {
                            document.getElementById("phone-availability").open = true;
                        }}
                    >
                        A note on phone availability
                        <Icon size={15} />
                    </a>
                </div>
                <div
                    className="mobile-visual"
                    role="tabpanel"
                    id="phone-demo-panel"
                    aria-labelledby={`phone-tab-${screen}`}
                    tabIndex={0}
                >
                    <div className="mobile-orbit mobile-orbit-one" aria-hidden="true" />
                    <div className="mobile-orbit mobile-orbit-two" aria-hidden="true" />
                    <div className="mobile-note note-top">
                        <span>THE BEST IDEAS</span>Rarely happen
                        <br />
                        <em>at your desk.</em>
                        <svg viewBox="0 0 80 55" fill="none" aria-hidden="true">
                            <path
                                d="M3 3c-4 31 30 43 65 30m-16-3 17 3-6 15"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            />
                        </svg>
                    </div>
                    <div className="mobile-phone-wrap">
                        <PhoneDemo screen={screen} />
                    </div>
                    <div className="mobile-floating-label">
                        <Icon name="spark" size={18} />
                        <span>
                            A little idea.
                            <br />
                            <strong>A whole lot of possibility.</strong>
                        </span>
                    </div>
                    <p className="mobile-demo-note">ILLUSTRATIVE APP WALKTHROUGH</p>
                </div>
            </div>
        </section>
    );
}
