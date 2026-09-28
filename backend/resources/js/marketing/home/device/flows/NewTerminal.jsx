import React, { useState } from "react";
import { agents, logoPath } from "../../agents.js";
import DeviceIcon from "../DeviceIcon.jsx";

// Representative models from the desktop native account catalog; this is not a live feed.
export const companies = [
    { name: "Anthropic", agent: "claude", models: ["Claude Opus 5.5", "Claude Sonnet 5"] },
    { name: "OpenAI", agent: "codex", models: ["GPT-6 Astra", "GPT-6 Sol", "GPT-6 Luna"] },
    { name: "Google", agent: "gemini", models: ["Gemini 3.1 Pro", "Gemini 3.5 Flash"] },
];
export default function NewTerminal({ demo, onClose }) {
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState("Anthropic");
    const launch = (id, model) => {
        demo.startAgent({ ...(agents.find(agent => agent.id === id) ?? { id, name: "Terminal" }), model });
        onClose();
    };
    return <div className="vdev-terminal-picker">
        <p>Pick a company, then the model that runs in it.</p>
        <input autoFocus aria-label="Search models" placeholder="Search models…" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="vdev-company-list">
            {companies.map(company => {
                const mark = agents.find(agent => agent.id === company.agent);
                const models = company.models.filter(model => `${company.name} ${model}`.toLowerCase().includes(query.toLowerCase()));
                if (!models.length) return null;
                const open = Boolean(query) || expanded === company.name;
                return <section key={company.name}><button type="button" className="vdev-company" aria-expanded={open} onClick={() => setExpanded(open ? null : company.name)}><img src={logoPath(mark)} alt="" width="28" height="28" /><strong>{company.name}</strong><small>{models.length}</small><span>{open ? "⌄" : "›"}</span></button>
                    {open && <div className="vdev-company-models">{models.map(model => <button key={model} type="button" onClick={() => launch(company.agent, model)}><span>{model}<small>{mark.name}</small></span><span>↵</span></button>)}</div>}
                </section>;
            })}
            {query && !companies.some(c => c.models.some(m => `${c.name} ${m}`.toLowerCase().includes(query.toLowerCase()))) && <p>No sample models match “{query}”.</p>}
            {!query && <><h4>Tools</h4><button type="button" className="vdev-company" onClick={() => launch("terminal")}><DeviceIcon name="terminal" size={25} /><strong>Terminal</strong><small>zsh</small><span>↵</span></button></>}
        </div>
        <footer>Launching in <strong>{demo.project.name}</strong><span>Sample sessions</span></footer>
    </div>;
}
