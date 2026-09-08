import React, { useState } from "react";
import { Icon } from "../shared.jsx";

export function MemoryPanel({ workspace }) {
    const { project, update } = workspace;
    return <div className="pg-utility"><div className="pg-panel-heading"><div><span className="pg-kicker">A LITTLE CONTEXT GOES A LONG WAY</span><h3>Project memory</h3><p>Keep the brief, your decisions, and what comes next together.</p></div><Icon name="notes" size={27} /></div>
        <label htmlFor="pg-memory">Notes for {project.name}</label><textarea id="pg-memory" value={project.notes} maxLength={6000} rows={12} onChange={(event) => update({ type: "patch", patch: { notes: event.target.value } })} />
        <p className="pg-fineprint">Automatically kept while this page is open. Demo notes are not sent to an AI provider.</p>
    </div>;
}

export function SettingsPanel({ workspace, settings, setSettings }) {
    const [confirm, setConfirm] = useState(false);
    return <div className="pg-utility"><div className="pg-panel-heading"><div><span className="pg-kicker">MAKE YOURSELF AT HOME</span><h3>Workspace settings</h3><p>Set up this demo the way you like to work.</p></div><Icon name="grid" size={27} /></div>
        <div className="pg-setting"><div><strong>Text size</strong><p>A little extra room for your code and conversations.</p></div><select aria-label="Workspace text size" value={settings.font} onChange={(event) => setSettings({ ...settings, font: event.target.value })}><option value="normal">Default</option><option value="large">Larger</option></select></div>
        <div className="pg-setting"><div><strong>Preview alongside agents</strong><p>Keep your sample app beside the conversation on larger screens.</p></div><button className="pg-toggle" role="switch" aria-checked={settings.preview} aria-label="Preview alongside agents" onClick={() => setSettings({ ...settings, preview: !settings.preview })}><span /></button></div>
        <div className="pg-setting"><div><strong>Start fresh</strong><p>Restore the sample projects, notes, and changes.</p></div><button className="pg-secondary" onClick={() => setConfirm(true)}>Reset demo</button></div>
        {confirm && <div className="pg-reset-confirm"><p>Reset all sample workspace changes?</p><button className="pg-secondary" onClick={() => setConfirm(false)}>Cancel reset</button><button className="pg-primary" onClick={() => { setSettings({ font: "normal", preview: true }); workspace.reset(); }}>Reset everything</button></div>}
        <div className="pg-settings-note"><Icon name="shield" size={20} /><p>This interactive sample runs in your browser. Projects stay here until you refresh. Download Vibyra to connect your own coding agents, repositories, and provider accounts.</p></div>
    </div>;
}

export function ProjectCreator({ workspace, onClose }) {
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    return <form className="pg-project-create" onSubmit={(event) => { event.preventDefault(); const invalid = workspace.create(name); setError(invalid || ""); if (!invalid) onClose(); }}>
        <label htmlFor="pg-project-name">New sample project</label><input id="pg-project-name" autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your next idea" />
        {error && <p role="alert">{error}</p>}<div><button type="button" className="pg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="pg-primary" disabled={!name.trim()}>Create project</button></div>
    </form>;
}
