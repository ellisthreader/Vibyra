import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../shared.jsx";
import { agents, logoPath } from "../agents.js";

const suggestions = ["Add a reading habit", "Switch to dark theme", "Add a weekly summary", 'Rename the title to "Make time for you"'];
export default function AgentPanel({ workspace }) {
    const { project, update, send, run, cancel, setView } = workspace;
    const [prompt, setPrompt] = useState("");
    const history = useRef(null);
    const agent = agents.find((item) => item.id === project.provider) || agents[0];
    useEffect(() => { history.current?.scrollTo({ top: history.current.scrollHeight, behavior: "instant" }); }, [project.messages, run]);
    return (
        <div className="pg-agent-panel">
            <div className="pg-agent-toolbar">
                <img className={agent.mono ? "agent-mono" : ""} src={logoPath(agent)} width="25" height="25" alt="" />
                <label className="pg-sr-only" htmlFor="pg-provider">Demo agent or model</label>
                <select id="pg-provider" value={project.provider} disabled={!!run} onChange={(event) => update({ type: "patch", patch: { provider: event.target.value } })}>
                    {["Coding agent", "Model family"].map((kind) => <optgroup label={kind === "Coding agent" ? "Coding agents" : "Models via compatible tools"} key={kind}>
                        {agents.filter((item) => item.kind === kind).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                    </optgroup>)}
                </select><span className="pg-tag">Simulated session</span>
            </div>
            <div className="pg-chat-history" ref={history} tabIndex={0} role="region" aria-label="Demo conversation">
                <div className="pg-chat-welcome"><span className="pg-kicker">A LITTLE ROOM FOR A BIG IDEA</span>
                    <h3>What will you make today?</h3><p>Try a change to {project.name}. Watch the preview take shape.</p></div>
                {project.messages.map((message, index) => <div className={`pg-message pg-message-${message.role}`} key={index}>
                    <span>{message.role === "you" ? "You" : "Demo assistant"}</span><p>{message.text}</p>
                </div>)}
                {run && <div className="pg-working" role="status"><i />{run}</div>}
            </div>
            <div className="pg-compose-area">
                <div className="pg-suggestions">{suggestions.map((suggestion) => <button key={suggestion} disabled={!!run} onClick={() => send(suggestion)}>{suggestion}<Icon name="plus" size={12} /></button>)}</div>
                <form className="pg-composer" onSubmit={(event) => { event.preventDefault(); send(prompt); setPrompt(""); }}>
                    <label className="pg-sr-only" htmlFor="pg-prompt">Your demo prompt</label>
                    <textarea id="pg-prompt" value={prompt} disabled={!!run} maxLength={500} rows={2} placeholder='Try: Add a habit called "Go for a walk"'
                        onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (prompt.trim() && !run) { send(prompt); setPrompt(""); } }
                        }} />
                    <div><small>{agent.kind === "Model family" ? "Model access in desktop depends on your tool and provider." : "Demo prompts change sample files. No AI account needed."}</small>
                        {run ? <button type="button" onClick={cancel} className="pg-primary">Stop run</button>
                            : <button className="pg-primary" disabled={!prompt.trim()} type="submit" aria-label="Send demo prompt"><Icon name="arrow" size={18} /></button>}</div>
                </form>
                <button className="pg-text-button" onClick={() => setView("changes")}>Review your changes <Icon name="arrow" size={13} /></button>
            </div>
        </div>
    );
}
