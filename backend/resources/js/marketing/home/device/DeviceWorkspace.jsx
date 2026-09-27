import React, { useEffect, useRef, useState } from "react";
import DeviceIcon from "./DeviceIcon.jsx";
import CliBanner from "./CliBanner.jsx";
import { providers, quickAgents } from "./demoData.js";
import { logoPath, agents } from "../agents.js";

const markFor = (id) => agents.find((agent) => agent.id === id);

// Matches desktop-tauri/src/lib/terminalGridColumns.ts.
function gridLayout(count, width, height) {
    if (!count) return { rows: 0, tracks: 1, cells: [] };
    let columns = 1;
    let bestScore = Infinity;
    for (let candidate = 1; candidate <= count; candidate += 1) {
        const rows = Math.ceil(count / candidate);
        const paneWidth = Math.max(1, (width - 8 * (candidate - 1)) / candidate);
        const paneHeight = Math.max(1, (height - 8 * (rows - 1)) / rows - 34);
        const score = Math.abs(Math.log(paneWidth / paneHeight / 1.65)) + ((candidate * rows - count) / count) * 1.4;
        if (score < bestScore) { columns = candidate; bestScore = score; }
    }
    const rows = Math.ceil(count / columns);
    const small = Math.floor(count / rows);
    const extra = count % rows;
    const tracks = Math.max(1, extra ? small * (small + 1) : small);
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
        const size = small + (row < extra ? 1 : 0);
        for (let column = 0; column < size; column += 1) {
            const span = tracks / size;
            cells.push({ gridColumn: `${column * span + 1} / span ${span}`, gridRow: row + 1 });
        }
    }
    return { rows, tracks, cells };
}

function useStageSize(ref) {
    const [size, setSize] = useState({ width: 740, height: 520 });
    useEffect(() => {
        if (!ref.current) return undefined;
        const observer = new ResizeObserver(([entry]) => setSize(entry.contentRect));
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [ref]);
    return size;
}

function Terminal({ agent, lines, history, live, onCommand, anchorBottom }) {
    const [command, setCommand] = useState("");
    return <div className="vdev-term"><div className={`vdev-term-content${anchorBottom ? "" : " vdev-term-content-top"}`}>
            <CliBanner agent={agent} />
            {lines.map(([tone, line], index) => <div key={index} className={tone ? `vdev-term-${tone}` : ""}>{line || " "}</div>)}
            {history.map(([tone, line], index) => <div key={`history-${index}`} className={tone ? `vdev-term-${tone}` : ""}>{line}</div>)}
            <form className="vdev-term-input" onSubmit={(event) => { event.preventDefault(); onCommand(command); setCommand(""); }}>
                <span className="vdev-term-prompt">› </span>
                <input value={command} aria-label="Terminal input" spellCheck="false" onChange={(event) => setCommand(event.target.value)} placeholder={live ? "" : "Type help"} />
                {live && !command && <span className="vdev-caret" aria-hidden="true" />}
            </form>
        </div>
    </div>;
}

function Pane({ session, focused, zoomed, paused, history, onCommand, onFocus, onZoom, onPause, onClose, style }) {
    const mark = markFor(session.agent);
    const status = session.state === "attention" ? "Needs input" : session.state === "working" ? "Working" : "Ready";
    return <section className={`vdev-pane${focused ? " vdev-pane-focused" : ""}${session.state === "attention" ? " vdev-pane-attention" : ""}`} style={style} onClick={onFocus} aria-label={`${session.label} terminal`}>
        <header className="vdev-pane-head">
            <span className="vdev-pane-mark">{mark ? <img className={mark.mono ? "agent-mono" : ""} src={logoPath(mark)} alt="" width="18" height="18" /> : <DeviceIcon name="terminal" size={17} />}</span>
            <button type="button" className="vdev-pane-title" onClick={onFocus} title={session.label}><strong>{session.label}</strong><small>#{session.id.replace("s", "")}</small></button>
            <span className={`vdev-pane-state${session.state === "attention" ? " vdev-pane-state-attention" : ""}`}>{paused ? "View paused" : status}</span>
            <span className="vdev-pane-actions">
                <button type="button" className="vdev-icon-btn" aria-label={paused ? "Show terminal" : "Pause terminal rendering"} title={paused ? "Show terminal" : "Pause view — the agent keeps running"} onClick={(event) => { event.stopPropagation(); onPause(); }}><DeviceIcon name="moon" size={14} /></button>
                {!paused && <button type="button" className="vdev-icon-btn" aria-label={zoomed ? "Restore grid" : "Expand terminal"} onClick={(event) => { event.stopPropagation(); onZoom(); }}><DeviceIcon name="expand" size={14} /></button>}
                <button type="button" className="vdev-icon-btn vdev-icon-btn-danger" aria-label="Close terminal" onClick={(event) => { event.stopPropagation(); onClose(); }}><DeviceIcon name="close" size={14} /></button>
            </span>
        </header>
        <div className="vdev-pane-body">{paused ? <button type="button" className="vdev-pane-sleeping" onClick={onPause}><DeviceIcon name="moon" size={24} /><strong>View paused</strong><small>Your agent is still running. Click to show the terminal.</small></button> : <Terminal agent={session.agent} lines={session.lines} history={history} live={focused} anchorBottom={session.agent !== "terminal"} onCommand={onCommand} />}</div>
    </section>;
}

function LaunchCard({ project, onStart }) {
    const [agentId, setAgentId] = useState("claude");
    const [count, setCount] = useState(1);
    const [effort, setEffort] = useState("Medium");
    const [safe, setSafe] = useState(true);
    const launch = () => { for (let index = 0; index < count; index += 1) onStart(markFor(agentId) ?? { id: agentId, name: providers[agentId].name }); };
    return <div className="vdev-empty"><section className="vdev-launch-card" aria-label="New terminal">
        <header><h2>New terminal</h2><p>{project.name} · sample workspace</p></header>
        <label className="vdev-launch-model">Model<select value={agentId} onChange={(event) => setAgentId(event.target.value)}>{quickAgents.map((id) => <option key={id} value={id}>{providers[id].name}</option>)}</select></label>
        <div className="vdev-launch-row"><span>Terminals</span><div className="vdev-launch-stepper"><button type="button" onClick={() => setCount(Math.max(1, count - 1))} aria-label="Fewer terminals">−</button><span>{count}</span><button type="button" onClick={() => setCount(Math.min(4, count + 1))} aria-label="More terminals">+</button></div></div>
        <label className="vdev-launch-row">Effort<select value={effort} onChange={(event) => setEffort(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <footer><label><input type="checkbox" checked={safe} onChange={(event) => setSafe(event.target.checked)} /> Safe mode</label><button type="button" className="vdev-launch-go" onClick={launch}>Launch {count > 1 ? `${count} terminals` : "terminal"}</button></footer>
    </section></div>;
}

export default function DeviceWorkspace({ demo, children }) {
    const { project, sessionId, setSessionId, closeSession, startAgent, zoomedId, toggleZoom, pausedIds, togglePause, terminalHistory, runTerminalCommand } = demo;
    const sessions = project.sessions;
    const stage = useRef(null);
    const size = useStageSize(stage);
    const layout = gridLayout(sessions.length, size.width, size.height);
    const visible = zoomedId ? sessions.filter((session) => session.id === zoomedId) : sessions;
    return <main className="vdev-workspace">
        <div className="vdev-stage" ref={stage}>
            {sessions.length ? <>
                {zoomedId && <div className="vdev-max-tabs" aria-label="Switch expanded terminal">{sessions.map((session) => <button key={session.id} type="button" aria-pressed={session.id === zoomedId} onClick={() => { setSessionId(session.id); if (session.id !== zoomedId) toggleZoom(session.id); }}>{session.label}</button>)}</div>}
                <div className="vdev-grid" style={{ gridTemplateColumns: zoomedId ? "minmax(0,1fr)" : `repeat(${layout.tracks}, minmax(0, 1fr))`, gridTemplateRows: zoomedId ? "minmax(0,1fr)" : `repeat(${layout.rows}, minmax(0, 1fr))` }}>
                    {visible.map((session) => <Pane key={session.id} session={session} focused={session.id === sessionId} zoomed={session.id === zoomedId} paused={pausedIds.includes(session.id)} history={terminalHistory[session.id] ?? []} onCommand={(command) => runTerminalCommand(session.id, command)} style={zoomedId ? undefined : layout.cells[sessions.indexOf(session)]} onFocus={() => setSessionId(session.id)} onZoom={() => toggleZoom(session.id)} onPause={() => togglePause(session.id)} onClose={() => closeSession(session.id)} />)}
                </div>
            </> : <LaunchCard project={project} onStart={startAgent} />}
        </div>
        {children}
    </main>;
}
