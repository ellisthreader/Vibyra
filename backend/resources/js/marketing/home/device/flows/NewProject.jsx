import React, { useState } from "react";
import DeviceIcon from "../DeviceIcon.jsx";
import { Row, Toggle } from "./FlowControls.jsx";

const kinds = ["Website", "Web app", "Mobile app", "Desktop app", "Game", "Backend or API", "Library or CLI", "AI app", "Empty project"];
const stacks = {
    Website: [["Next.js", "React with routing, server rendering and Tailwind"], ["React (Vite)", "A fast React app with TypeScript"], ["Astro", "Content-first sites with less JavaScript"]],
    "Web app": [["Next.js", "React with routing, server rendering and Tailwind"], ["React (Vite)", "A fast React app with TypeScript"]],
    "Mobile app": [["Expo (React Native)", "iOS and Android from one codebase"], ["React Native CLI", "Native mobile with React"]],
    "Desktop app": [["Tauri", "A native window with a web frontend"]],
    Game: [["Phaser (Vite)", "A 2D game for the browser"]],
    "Backend or API": [["FastAPI", "A Python API"]],
    "Library or CLI": [["Empty project", "Start with a clean folder"]],
    "AI app": [["Empty project", "Start with a clean folder"]],
};
const titles = { start: "Start a project", kind: "What are you making?", stack: "Which stack?", name: "Name your project", setup: "How should it be set up?", done: "Your workspace is ready", folder: "Open a sample folder" };
export default function NewProject({ demo, onClose }) {
    const [step, setStep] = useState("start");
    const [history, setHistory] = useState([]);
    const [kind, setKind] = useState("Website");
    const [stack, setStack] = useState("Next.js");
    const [name, setName] = useState("my-project");
    const [options, setOptions] = useState({ install: true, git: true, terminal: true });
    const go = next => { setHistory([...history, step]); setStep(next); };
    const choose = next => { setKind(next); setStack(stacks[next]?.[0][0] ?? "Empty project"); go(next === "Empty project" ? "name" : "stack"); };
    const valid = name.trim() && !/[\\/]/.test(name);
    const build = () => { if (demo.newProject(name, { ...options, stack })) setStep("done"); };
    return <div className="vdev-project-flow">
        <div className="vdev-flow-meta">{history.length > 0 && step !== "done" && <button type="button" aria-label="Back" onClick={() => { setStep(history.at(-1)); setHistory(history.slice(0, -1)); }}>←</button>}<span>NEW PROJECT</span><span className="vdev-step-dots" role="img" aria-label={titles[step]}>{["kind", "stack", "name", "setup"].map((s, index, all) => <i key={s} className={all.indexOf(step) >= index ? "is-on" : ""} />)}</span></div>
        <h3>{titles[step]}</h3>
        {step === "start" && <div className="vdev-start-choices">
            <button type="button" onClick={() => go("kind")}><DeviceIcon name="plus" size={28} /><span><strong>Start something new</strong><small>Pick what you are making and Vibyra sets it up for you.</small></span><b>›</b></button>
            <button type="button" onClick={() => go("folder")}><DeviceIcon name="folder" size={28} /><span><strong>Open a folder I have</strong><small>Try one of the sample projects already in this workspace.</small></span><b>›</b></button>
        </div>}
        {step === "folder" && <div className="vdev-stack-list">{demo.projects.map(project => <button key={project.id} type="button" onClick={() => { demo.openProject(project.id); onClose(); }}><span><strong>{project.name}</strong><small>~/projects/{project.name.toLowerCase().replace(/\s+/g, "-")}</small></span><b>›</b></button>)}</div>}
        {step === "kind" && <><div className="vdev-kind-grid">{kinds.map((item, index) => <button type="button" key={item} onClick={() => choose(item)}><DeviceIcon name={["monitor", "terminal", "phone", "monitor", "bot", "terminal", "book", "sparkles", "folder"][index]} size={27} /><span>{item}</span></button>)}</div><button className="vdev-quiet" type="button" onClick={() => choose("Empty project")}>Skip — just make a folder</button></>}
        {step === "stack" && <><div className="vdev-stack-list">{stacks[kind].map(([title, detail], index) => <button type="button" key={title} aria-pressed={stack === title} onClick={() => setStack(title)}><span><strong>{title}{index === 0 && <em>Recommended</em>}</strong><small>{detail}</small></span><b>{stack === title ? "✓" : ""}</b></button>)}</div><footer><button className="vdev-flow-primary" onClick={() => go("name")}>Continue</button><button className="vdev-quiet" onClick={() => { setStack("Empty project"); go("name"); }}>Skip — just make a folder</button></footer></>}
        {step === "name" && <form onSubmit={event => { event.preventDefault(); if (valid) go("setup"); }}><span className="vdev-stack-chip">{stack}</span><label>Project name<input className="vdev-project-name-input" autoFocus maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label><p>~/projects/<strong>{name.trim() || "my-project"}</strong> · sample folder</p>{!valid && <small>Use a name without slashes.</small>}<footer><button type="submit" className="vdev-flow-primary" disabled={!valid}>Continue</button></footer></form>}
        {step === "setup" && <><p className="vdev-flow-summary">{name} <span>· {stack}</span></p>{[["install", "Install dependencies"], ["git", "Start a git repository"], ["terminal", "Open a terminal when it is done"]].filter(([key]) => key !== "install" || stack !== "Empty project").map(([key, label]) => <Row key={key} label={label}><Toggle label={label} value={options[key]} onChange={value => setOptions({ ...options, [key]: value })} /></Row>)}<p className="vdev-flow-note">This walkthrough creates a sample workspace in your browser. No folders or packages are installed.</p><footer><button className="vdev-flow-primary" type="button" onClick={build}>Start building</button></footer></>}
        {step === "done" && <div className="vdev-project-done"><span>✓</span><strong>{name}</strong><p>Your sample project is in the sidebar.{options.terminal ? " A terminal is ready to use." : " Choose a model to launch your first terminal."}</p><button className="vdev-flow-primary" type="button" onClick={onClose}>Open project</button></div>}
    </div>;
}
