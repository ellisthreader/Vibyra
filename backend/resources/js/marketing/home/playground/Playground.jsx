import React, { useLayoutEffect, useRef, useState } from "react";
import { Brand, Icon, DOWNLOAD_URL } from "../shared.jsx";
import { usePlayground } from "./usePlayground.js";
import AgentPanel from "./AgentPanel.jsx";
import PreviewPanel from "./PreviewPanel.jsx";
import { FilesPanel, ChangesPanel, TerminalPanel } from "./FilePanels.jsx";
import { MemoryPanel, SettingsPanel, ProjectCreator } from "./UtilityPanels.jsx";

const views = [["agents", "Agents", "spark"], ["files", "Files", "file"], ["preview", "Preview", "monitor"], ["changes", "Changes", "branch"], ["terminal", "Terminal", "terminal"], ["memory", "Memory", "notes"], ["settings", "Settings", "grid"]];
export default function Playground({ open, onClose }) {
    const dialog = useRef(null);
    const workspace = usePlayground(open);
    const [creating, setCreating] = useState(false);
    const [settings, setSettings] = useState({ font: "normal", preview: true });
    const { project, view, setView, projects, notice, run } = workspace;
    const changed = Object.keys(project.files).filter((name) => project.files[name] !== project.baseline[name]).length;
    useLayoutEffect(() => {
        if (!open) return;
        const opener = document.activeElement;
        const overflow = document.body.style.overflow;
        dialog.current.showModal();
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = overflow; opener?.focus({ preventScroll: true }); };
    }, [!!open]);
    if (!open) return null;
    const navigate = (next) => { setCreating(false); setView(next); };
    return <dialog ref={dialog} className="pg-dialog" aria-labelledby="pg-title" onClose={() => { setCreating(false); onClose(); }}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close(); }}
        onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const elements = [...dialog.current.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
            const first = elements[0], last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="pg-shell" data-font={settings.font}>
            <header className="pg-header"><Brand /><span id="pg-title">Interactive workspace</span><span className="pg-demo-badge">DEMO</span>
                <a href={DOWNLOAD_URL} className="pg-download">Get the desktop app <Icon name="download" size={14} /></a>
                <button autoFocus className="pg-close" aria-label="Close interactive workspace" onClick={() => dialog.current.close()}><Icon name="close" size={19} /></button></header>
            <div className="pg-body">
                <aside className="pg-sidebar"><div className="pg-project-label"><span>YOUR PROJECTS</span><button onClick={() => setCreating(!creating)} aria-label="New sample project" aria-expanded={creating}><Icon name="plus" size={16} /></button></div>
                    <label className="pg-sr-only" htmlFor="pg-project-picker">Current project</label><select id="pg-project-picker" value={project.id} onChange={(event) => { workspace.switchProject(event.target.value); setCreating(false); }}>{projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
                    <nav aria-label="Sample workspace tools">{views.map(([id, label, icon]) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}><Icon name={icon} size={17} /><span>{label}</span>{id === "changes" && changed > 0 && <b>{changed}</b>}</button>)}</nav>
                    <div className="pg-sidebar-bottom"><Icon name="branch" size={14} /><span>demo/{project.id}</span></div>
                </aside>
                <div className="pg-main">
                    <div className="pg-breadcrumb"><span>{project.name}<Icon name="chevron" size={12} /><strong>{views.find(([id]) => id === view)?.[1]}</strong></span><span><i />{run ? "Demo running" : "Ready to explore"}</span></div>
                    {creating ? <ProjectCreator workspace={workspace} onClose={() => setCreating(false)} /> : <div className={`pg-view pg-view-${view}`} key={`${project.id}-${view}`}>
                        {view === "agents" && <div className={`pg-build ${settings.preview ? "" : "pg-build-solo"}`}><AgentPanel workspace={workspace} />{settings.preview && <PreviewPanel workspace={workspace} compact />}</div>}
                        {view === "files" && <FilesPanel workspace={workspace} />}
                        {view === "preview" && <PreviewPanel workspace={workspace} />}
                        {view === "changes" && <ChangesPanel workspace={workspace} />}
                        {view === "terminal" && <TerminalPanel workspace={workspace} />}
                        {view === "memory" && <MemoryPanel workspace={workspace} />}
                        {view === "settings" && <SettingsPanel workspace={workspace} settings={settings} setSettings={setSettings} />}
                    </div>}
                    <div className="pg-notice" role="status">{notice || "Try a prompt, click a habit, or explore the tools. This is your space to play."}</div>
                </div>
            </div>
            <footer className="pg-footer"><span><i /> Interactive sample · Simulated agents</span><span>Changes stay until you refresh this page.</span></footer>
        </div>
    </dialog>;
}
