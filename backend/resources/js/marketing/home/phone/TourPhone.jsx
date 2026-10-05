import React, { useId, useLayoutEffect, useRef } from "react";
import { Icon } from "../shared.jsx";
import PIcon from "./PhoneIcons.jsx";
import PocketIcon from "./PocketIcons.jsx";
import { SPEED } from "./tourStory.js";

/* Read-only phone for the "See preview" tour. Screens follow the native app
 * (FocusDrawer, the keyboard-only terminal mirroring a Claude Code session,
 * Continue in Cloud, the iOS lock screen) with sample work. The active screen
 * is remounted per run so its CSS timeline starts from zero; `--at` on an item
 * is its moment, in ms from the start of the chapter. */

const VMark = ({ className }) => <svg viewBox="0 0 24 20" className={className} aria-hidden="true"><path fill="currentColor" d="M0 2h6l6 10 6-10h6L12 22Z" /></svg>;

const Glyph = ({ d, className = "" }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

const at = ms => ({ "--at": `${ms}ms` });

/* Vibyra Cloud's mark, as mobile/src/cloud/CloudMark draws it at 40pt. */
const CLOUD_OUTLINE = "M46 120A20 20 0 1 1 47.07 80.03A27 27 0 0 1 74.65 55.01A38 38 0 0 1 145.64 44.32A30 30 0 0 1 179.93 76A22 22 0 1 1 180 120Z";
const PUFFS = [[46, 100, 20], [74, 82, 27], [112, 62, 38], [150, 74, 30], [180, 98, 22]];
function CloudMark({ className = "" }) {
    const id = useId().replace(/:/g, "");
    return <svg className={`tp-cloudmark ${className}`} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
            <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B1124" /><stop offset="1" stopColor="#141C38" /></linearGradient>
            <radialGradient id={`${id}g`} cx="50%" cy="60%" r="55%"><stop offset="0" stopColor="#7C9BFF" stopOpacity=".45" /><stop offset="1" stopColor="#7C9BFF" stopOpacity="0" /></radialGradient>
            <linearGradient id={`${id}b`} x1="0" y1="24" x2="0" y2="120" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#E9EDF7" /><stop offset="1" stopColor="#A9B4D2" /></linearGradient>
            <radialGradient id={`${id}p`} cx="38%" cy="30%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
            <clipPath id={`${id}c`}><path d={CLOUD_OUTLINE} /></clipPath>
            <clipPath id={`${id}t`}><rect width="40" height="40" rx="11" /></clipPath>
        </defs>
        <g clipPath={`url(#${id}t)`}>
            <rect width="40" height="40" fill={`url(#${id}s)`} />
            <rect width="40" height="40" fill={`url(#${id}g)`} />
            {[[8, 8, 1], [31.2, 6.4, .8], [24.8, 12, .6], [4.8, 19.2, .6]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#E8EEFF" opacity=".8" />)}
            <g transform="translate(5.2 11.62) scale(.1345)">
                <path d={CLOUD_OUTLINE} fill={`url(#${id}b)`} />
                <g clipPath={`url(#${id}c)`}>{PUFFS.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill={`url(#${id}p)`} />)}</g>
            </g>
        </g>
    </svg>;
}

/* Clawd, Claude Code's header mascot, from its block characters: each terminal
 * cell is two quadrants wide and two tall. */
const CLAWD = [" ▐▛███▜▌", "▝▜█████▛▘", "  ▘▘ ▝▝"];
const QUADRANTS = { "█": [0, 1, 2, 3], "▐": [1, 3], "▌": [0, 2], "▛": [0, 1, 2], "▜": [0, 1, 3], "▝": [1], "▘": [0] };
const clawdCells = CLAWD.flatMap((row, y) => [...row].flatMap((char, x) => (QUADRANTS[char] ?? []).map(q => [x * 2 + (q % 2), y * 2 + (q > 1 ? 1 : 0)])));
const Clawd = () => <svg className="tp-clawd" viewBox="0 0 18 6" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
    {clawdCells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.04" height="1.04" />)}
</svg>;

function ClaudeHeader() {
    return <div className="tp-cc-head">
        <Clawd />
        <div><p><b>Claude Code</b> <span className="tp-cc-dim">v2.1.4</span></p><p className="tp-cc-dim">Opus 5.5 · Claude Max</p><p className="tp-cc-dim">~/Projects/Orbit</p></div>
    </div>;
}

/* One transcript block that grows in at its moment. */
const Show = ({ ms, className = "", children }) => <div className={`tp-show${ms ? "" : " is-still"} ${className}`} style={at(ms)}><div>{children}</div></div>;

/* The first exchange: chapter 2 plays it, chapter 3 opens on it scrolled up. */
function FirstExchange({ live }) {
    const t = ms => live ? ms : 0;
    return <>
        <Show ms={t(2950)} className="tp-cc-gap"><p className="tp-cc-user"><span>&gt;</span>make “Good things.” green</p></Show>
        <Show ms={t(3700)} className="tp-cc-gap"><p className="tp-cc-call"><i className="tp-dot is-ok" /><b>Read</b>(src/hero.css)</p></Show>
        <Show ms={t(4000)}><p className="tp-cc-result"><i className="tp-elbow" />Read <b>48</b> lines</p></Show>
        <Show ms={t(4500)} className="tp-cc-gap"><p className="tp-cc-call"><i className="tp-dot is-ok" /><b>Update</b>(src/hero.css)</p></Show>
        <Show ms={t(4800)}><p className="tp-cc-result"><i className="tp-elbow" />Updated <b>src/hero.css</b> with <b>1</b></p><p className="tp-cc-result">addition and <b>1</b> removal</p></Show>
        <Show ms={t(5150)}><div className="tp-diff"><p className="is-del"><span>12</span><i>-</i>  color: var(--<mark>ink</mark>);</p><p className="is-add"><span>12</span><i>+</i>  color: var(--<mark>sage</mark>);</p></div></Show>
        <Show ms={t(6100)} className="tp-cc-gap"><p className="tp-cc-call"><i className="tp-dot" />“Good things.” is green now.</p></Show>
    </>;
}

const Prompt = ({ text, n, from, gone, placeholder }) => <div className="tp-cc-prompt">
    <p className="tp-cc-input">
        <span>&gt; </span>
        {placeholder && <span className="tp-cc-placeholder">Try “refactor hero.css”</span>}
        {text && <span className="tp-cc-typing" style={{ "--n": n, "--from": `${from}ms`, "--gone": `${gone}ms` }}>{text}</span>}
        <i className="tp-cc-cursor" />
    </p>
    <p className="tp-cc-hint">  ? for shortcuts</p>
</div>;

function TermHead({ cloud }) {
    return <div className="tp-term-head">
        <Glyph d={<path d="M4 7h16M4 12h16M4 17h16" />} />
        <div>
            <strong>Build the landing page <PIcon name="down" /></strong>
            <span className="tp-place">
                <small className="tp-place-mac"><i />Ellis’s MacBook</small>
                {cloud && <small className="tp-place-cloud"><PocketIcon name="cloud" />Vibyra Cloud<i /></small>}
            </span>
        </div>
        <PIcon name="more" />
    </div>;
}

const keys = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const Keyboard = () => <div className="tp-kb">
    <div className="tp-kb-row">{[...keys[0]].map(k => <i key={k}>{k}</i>)}</div>
    <div className="tp-kb-row tp-kb-inset">{[...keys[1]].map(k => <i key={k}>{k}</i>)}</div>
    <div className="tp-kb-row"><b className="tp-kb-wide">⇧</b>{[...keys[2]].map(k => <i key={k}>{k}</i>)}<b className="tp-kb-wide">⌫</b></div>
    <div className="tp-kb-row"><b className="tp-kb-wide">123</b><i className="tp-kb-space">space</i><b className="tp-kb-return">return<span className="tp-touch" /></b></div>
</div>;

const sessions = [
    ["Build the landing page", "working"],
    ["Review the latest changes", "ready"],
    ["Fix the mobile navigation", "waiting"],
    ["Development server", "working"],
];

function ProjectsScreen() {
    return <div className="tp-drawer">
        <div className="tp-drawer-head tp-rise" style={{ "--i": 0 }}>
            <VMark className="tp-mark" /><strong>Vibyra</strong><PIcon name="plus" /><Icon name="close" />
        </div>
        <div className="tp-label tp-rise" style={{ "--i": 1 }}>Projects</div>
        <div className="tp-project is-open tp-rise" style={{ "--i": 2 }}><PIcon name="down" /><span>Orbit</span><small>4</small><PIcon name="more" /></div>
        <div className="tp-sessions">
            {sessions.map(([title, state], index) => <div key={title} className={`tp-session tp-rise${index === 0 ? " is-target" : ""}`} style={{ "--i": 3 + index }}>
                <i className={`is-${state}`} /><span>{title}</span>{index === 0 && <span className="tp-touch" />}
            </div>)}
            <div className="tp-new tp-rise" style={{ "--i": 7 }}><PIcon name="plus" /><span>New terminal</span></div>
        </div>
        <div className="tp-project tp-rise" style={{ "--i": 8 }}><Icon name="chevron" /><span>Website</span><small>2</small><PIcon name="more" /></div>
        <div className="tp-project tp-rise" style={{ "--i": 9 }}><Icon name="chevron" /><span>Weekend project</span><small>1</small><PIcon name="more" /></div>
        <div className="tp-drawer-foot tp-rise" style={{ "--i": 10 }}>
            <div className="tp-computer"><PIcon name="computer" /><span>Ellis’s MacBook</span><small><i />Connected</small><Icon name="chevron" /></div>
        </div>
    </div>;
}

/* 2. The Mac's Claude Code session, typed into from the iOS keyboard. */
function TerminalScreen() {
    return <div className="tp-terminal">
        <TermHead />
        <div className="tp-cc">
            <ClaudeHeader />
            <FirstExchange live />
            <div className="tp-spinner"><div><p className="tp-cc-call"><i className="tp-spin-glyph" /><span className="tp-shimmer">Brewing…</span><span className="tp-cc-dim">{"\u00a0"}(esc to interrupt)</span></p></div></div>
            <Prompt placeholder text="make “Good things.” green" n={25} from={1000} gone={2900} />
            <span className="tp-touch" />
        </div>
        <Keyboard />
    </div>;
}

/* 3. The lid closes; the same conversation carries on in Vibyra Cloud. */
function CloudScreen() {
    return <div className="tp-terminal tp-cloud">
        <TermHead cloud />
        <div className="tp-cc">
            <ClaudeHeader />
            <FirstExchange />
            <Show ms={3550} className="tp-cc-gap"><p className="tp-moved"><span><PocketIcon name="cloud" />Continued in Vibyra Cloud</span></p></Show>
            <Show ms={5150} className="tp-cc-gap"><p className="tp-cc-user"><span>&gt;</span>run the tests</p></Show>
            <Show ms={5600} className="tp-cc-gap"><p className="tp-cc-call"><i className="tp-dot is-ok" /><b>Bash</b>(npm test)</p></Show>
            <Show ms={6050}><p className="tp-cc-result"><i className="tp-elbow" />Test Files  <em>2 passed</em> (2)</p><p className="tp-cc-result">     Tests  <em>12 passed</em> (12)</p></Show>
            <Show ms={6700} className="tp-cc-gap"><p className="tp-cc-call"><i className="tp-dot" />All 12 tests pass.</p></Show>
            <Prompt text="run the tests" n={13} from={4200} gone={5150} />
        </div>
        <div className="tp-handoff">
            <div className="tp-ho-layer tp-ho-offline">
                <div className="tp-ho-row"><span className="tp-ho-mac"><PIcon name="computer" /></span><div><b>Ellis’s MacBook is offline</b><small>Your Mac went to sleep.</small></div></div>
                <span className="tp-ho-button">Continue in Cloud<span className="tp-touch" /></span>
            </div>
            <div className="tp-ho-layer tp-ho-moving">
                <div className="tp-ho-row"><CloudMark /><div><b>Moving to Vibyra Cloud</b><small>Same terminal, same conversation</small></div></div>
                <span className="tp-ho-bar"><i /></span>
            </div>
            <div className="tp-ho-layer tp-ho-done">
                <div className="tp-ho-row"><CloudMark /><div><b>Running in Vibyra Cloud</b><small>Switch back to your Mac any time.</small></div>
                    <Glyph className="tp-ho-tick" d={<path d="m5 12.5 4.5 4.5L19 7.5" />} /></div>
            </div>
        </div>
    </div>;
}

function AwayScreen() {
    return <div className="tp-away">
        <div className="tp-lock">
            <Glyph className="tp-lock-icon" d={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>} />
            <p className="tp-lock-date">Saturday 4 October</p>
            <p className="tp-lock-time">9:41</p>
        </div>
        <div className="tp-notice">
            <span className="tp-notice-icon"><VMark /></span>
            <div>
                <p><b>Vibyra</b><small>now</small></p>
                <strong>Build the landing page</strong>
                <span>Finished in Vibyra Cloud. All 12 tests pass.</span>
            </div>
            <span className="tp-touch" />
        </div>
        <div className="tp-faceid">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <g className="tp-face">
                    <path d="M6 15V10a4 4 0 0 1 4-4h5M33 6h5a4 4 0 0 1 4 4v5M42 33v5a4 4 0 0 1-4 4h-5M15 42h-5a4 4 0 0 1-4-4v-5" />
                    <path d="M17 18v3M31 18v3M24 18v9h-2M18 32c3.5 3 8.5 3 12 0" />
                </g>
                <path className="tp-face-check" d="m14 25 7 7 13-15" />
            </svg>
            <span>Face ID</span>
        </div>
    </div>;
}

const screens = { projects: ProjectsScreen, terminal: TerminalScreen, cloud: CloudScreen, away: AwayScreen };

export default function TourPhone({ chapter, run }) {
    const glass = useRef(null);
    // The chapter beats are CSS delays written at 1×; playbackRate scales delays too.
    useLayoutEffect(() => {
        glass.current?.querySelector(".tp-screen.is-on")?.getAnimations({ subtree: true }).forEach(animation => { animation.playbackRate = SPEED; });
    }, [chapter, run]);
    return <div className="tp-handset">
        <i className="tp-key tp-key-action" /><i className="tp-key tp-key-up" /><i className="tp-key tp-key-down" /><i className="tp-key tp-key-power" />
        <div className="tp-glass" ref={glass} data-chapter={chapter}>
            <div className="tp-status">
                <span>9:41</span>
                <i className="tp-island" />
                <span className="tp-status-right"><span className="tp-bars"><i /><i /><i /><i /></span><PocketIcon name="wifi" /><i className="tp-battery" /></span>
            </div>
            {Object.entries(screens).map(([id, Screen]) => <div key={id === chapter ? `${id}-${run}` : id}
                className={`tp-screen tp-screen-${id}${id === chapter ? " is-on" : ""}`}><Screen /></div>)}
            <i className="tp-home" />
        </div>
    </div>;
}
