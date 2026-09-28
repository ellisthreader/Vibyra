import React, { useState } from "react";
import { agents } from "../../agents.js";
import { companies } from "./NewTerminal.jsx";

/** Empty-project launcher, using the same company/model choices as the picker. */
export default function TerminalLauncher({ project, onStart }) {
    const [model, setModel] = useState("Claude Opus 5.5");
    const [count, setCount] = useState(1);
    const [effort, setEffort] = useState("High");
    const [safe, setSafe] = useState(true);
    const company = companies.find(c => c.models.includes(model));
    const agentId = company?.agent ?? "terminal";
    const efforts = agentId === "claude" ? ["Low", "Medium", "High", "X-high", "Max", "Ultra code"] : agentId === "codex" ? ["Low", "Medium", "High", "X-high", "Max", ...(model === "GPT-6 Luna" ? [] : ["Ultra"])] : [];
    const launch = () => {
        for (let index = 0; index < count; index++) onStart({ ...(agents.find(a => a.id === agentId) ?? { id: agentId, name: "Terminal" }), model: company ? model : undefined, effort: efforts.length ? effort : null, safe: safe && Boolean(project.branch) });
    };
    return <div className="vdev-empty"><section className="vdev-launch-card" aria-label="New terminal">
        <header><h2>New terminal</h2><p>{project.name} · sample workspace</p></header>
        <label className="vdev-launch-model">Model<select value={model} onChange={event => { setModel(event.target.value); setEffort("High"); }}>{companies.map(c => <optgroup key={c.name} label={c.name}>{c.models.map(m => <option key={m}>{m}</option>)}</optgroup>)}<option>Terminal</option></select></label>
        <div className="vdev-launch-row"><span>Terminals</span><div className="vdev-launch-stepper"><button type="button" disabled={count <= 1} onClick={() => setCount(count - 1)} aria-label="Fewer terminals">−</button><span>{count}</span><button type="button" disabled={count >= 12} onClick={() => setCount(count + 1)} aria-label="More terminals">+</button></div></div>
        {efforts.length > 0 && <label className="vdev-launch-row">Effort<select value={effort} onChange={event => setEffort(event.target.value)}>{efforts.map(value => <option key={value}>{value}</option>)}</select></label>}
        <footer><label title={project.branch ? "Own branch per terminal" : "Needs a Git repository"}><input type="checkbox" checked={safe && Boolean(project.branch)} disabled={!project.branch} onChange={event => setSafe(event.target.checked)} /> Safe mode</label><button type="button" className="vdev-launch-go" onClick={launch}>Launch {count > 1 ? `${count} terminals` : "terminal"}</button></footer>
    </section></div>;
}
