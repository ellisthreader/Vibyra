import React, { useState } from "react";
import { Icon } from "../shared.jsx";
import { validateConfig, checkProject } from "./projectState.js";

export function FilesPanel({ workspace }) {
    const { project, update, setNotice, run } = workspace;
    const [file, setFile] = useState("app.json");
    const draft = project.drafts?.[file] ?? project.files[file];
    const setDraft = (value) => update({ type: "patch", patch: { drafts: { ...project.drafts, [file]: value } } });
    const [error, setError] = useState("");
    return <div className="pg-files">
        <div className="pg-file-tabs">{Object.keys(project.files).map((name) => <button key={name} aria-pressed={file === name} onClick={() => { setFile(name); setError(""); }}><Icon name="file" size={14} />{name}</button>)}</div>
        <div className="pg-panel-heading"><div><h3>Edit your project</h3><p>{file === "app.json" ? "Change the title, theme, or habits. Save to update the preview." : "Write a readme for your sample project."}</p></div></div>
        <label className="pg-sr-only" htmlFor="pg-editor">Contents of {file}</label>
        <textarea className="pg-editor" id="pg-editor" value={draft} spellCheck={false} maxLength={12000} disabled={!!run} onChange={(event) => setDraft(event.target.value)} />
        <div className="pg-editor-footer"><span role="status">{error || (draft !== project.files[file] ? "Unsaved edits" : "Saved in this demo")}</span>
            <button className="pg-primary" disabled={!!run || draft === project.files[file]} onClick={() => {
                const invalid = file === "app.json" ? validateConfig(draft) : null;
                setError(invalid || "");
                if (!invalid) { update({ type: "file", name: file, value: draft }); setNotice(`${file} saved. Preview updated.`); }
            }}>Save file</button></div>
        <p className="pg-fineprint">Drafts stay with this project. Save valid app configuration to update the preview.</p>
    </div>;
}

export function ChangesPanel({ workspace }) {
    const { project, update, setNotice, run } = workspace;
    const changed = Object.keys(project.files).filter((name) => project.files[name] !== project.baseline[name]);
    const [selected, setSelected] = useState("app.json");
    const file = changed.includes(selected) ? selected : changed[0];
    return <div className="pg-changes">
        <div className="pg-panel-heading"><div><span className="pg-kicker">YOUR CODE. YOUR CALL.</span><h3>{changed.length ? `${changed.length} changed ${changed.length === 1 ? "file" : "files"}` : "All changes reviewed."}</h3><p>{changed.length ? "Compare the saved version with your working copy." : "Make a change in Agents, Files, or Preview to see it here."}</p></div><Icon name="branch" size={28} /></div>
        {file ? <><div className="pg-file-tabs">{changed.map((name) => <button key={name} aria-pressed={file === name} onClick={() => setSelected(name)}><Icon name="file" size={14} />{name}</button>)}</div>
            <div className="pg-diff"><div><h4>Saved version</h4><pre tabIndex={0} aria-label="Saved file contents">{project.baseline[file]}</pre></div><div><h4>Working copy</h4><pre tabIndex={0} aria-label="Changed file contents">{project.files[file]}</pre></div></div>
            <div className="pg-change-actions"><button className="pg-secondary" disabled={!!run} onClick={() => { update({ type: "discard" }); setNotice("Changes discarded. Preview restored to the saved version."); }}>Discard changes</button>
                <button className="pg-primary" disabled={!!run} onClick={() => { update({ type: "keep" }); setNotice("Changes kept in this sample project."); }}>Keep changes <Icon name="check" size={15} /></button></div></>
            : <div className="pg-empty"><Icon name="check" size={38} /><strong>A clean slate.</strong><p>{project.commits} saved {project.commits === 1 ? "revision" : "revisions"} in this sample project.</p><button className="pg-secondary" onClick={() => workspace.setView("agents")}>Make something new <Icon name="arrow" size={15} /></button></div>}
    </div>;
}

export function TerminalPanel({ workspace }) {
    const { project, update } = workspace;
    const [command, setCommand] = useState("");
    const execute = () => {
        const value = command.trim(); if (!value) return;
        if (value === "clear") update({ type: "patch", patch: { logs: [] } });
        else {
            const outputs = { help: "Available sample commands:\n  ls              List project files\n  cat app.json    Read app configuration\n  cat README.md   Read the project readme\n  npm test        Check the actual sample data\n  clear           Clear this terminal",
                ls: Object.keys(project.files).join("\n"), "cat app.json": project.files["app.json"], "cat README.md": project.files["README.md"], "npm test": checkProject(project) };
            update({ type: "log", text: `$ ${value}\n${outputs[value] || 'This sample terminal supports a small command set. Type "help". Use Vibyra Desktop for a real shell.'}` });
        }
        setCommand("");
    };
    return <div className="pg-terminal"><div className="pg-panel-heading"><div><h3>Project terminal</h3><p>Sample commands. Checks run against your current demo data.</p></div><Icon name="terminal" size={24} /></div>
        <div className="pg-terminal-output" role="log" tabIndex={0} aria-label="Sample terminal output">{project.logs.map((log, index) => <pre key={index}>{log}</pre>)}</div>
        <form onSubmit={(event) => { event.preventDefault(); execute(); }}><span aria-hidden="true">›</span><label className="pg-sr-only" htmlFor="pg-command">Sample terminal command</label><input id="pg-command" value={command} maxLength={200} autoComplete="off" placeholder="Type help or npm test" onChange={(event) => setCommand(event.target.value)} /><button type="submit" className="pg-secondary" disabled={!command.trim()}>Run</button></form>
    </div>;
}
