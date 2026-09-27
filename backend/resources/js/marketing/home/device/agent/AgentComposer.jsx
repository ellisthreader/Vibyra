import React, { useLayoutEffect, useRef, useState } from "react";
import DeviceIcon from "../DeviceIcon.jsx";

export default function AgentComposer({ agent }) {
    const [draft, setDraft] = useState("");
    const [files, setFiles] = useState([]);
    const [options, setOptions] = useState(false);
    const [review, setReview] = useState(false);
    const [model, setModel] = useState("default");
    const [hint, setHint] = useState("");
    const input = useRef(null);
    useLayoutEffect(() => {
        if (!input.current) return;
        input.current.style.height = "auto";
        input.current.style.height = `${Math.min(150, Math.max(28, input.current.scrollHeight))}px`;
    }, [draft]);
    const submit = (event) => {
        event.preventDefault();
        if (!draft.trim() || agent.typing || agent.teammate.archived) return;
        if (!review) { setReview(true); return; }
        agent.send(draft, files);
        setDraft(""); setFiles([]); setReview(false);
    };
    const busy = agent.typing || agent.teammate.archived;
    return <div className="vdev-compose-area">
        {agent.teammate.archived && <p className="vdev-compose-notice">This teammate is archived. Restore it in details to start a new task.</p>}
        {review && <div className="vdev-compose-review" role="status"><span>Sample message preview<small>No Vibes are charged by this website.</small></span>
            <button type="button" onClick={() => setReview(false)}>Cancel</button>
            <button type="button" className="vdev-decide-primary" onClick={submit}>Send message</button></div>}
        <form className="vdev-compose" onSubmit={submit}>
            {files.length > 0 && <div className="vdev-compose-files">{files.map((file, index) =>
                <button key={`${file.name}-${index}`} type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove ${file.name}`}>{file.name}<span aria-hidden="true">×</span></button>)}</div>}
            <div className="vdev-compose-line"><label className="vdev-compose-add" title="Attach a file"><DeviceIcon name="plus" size={18} />
                <input type="file" aria-label="Attach file" disabled={busy} onChange={(event) => {
                    if (event.target.files?.[0]) setFiles((current) => [...current, event.target.files[0]]);
                    event.target.value = "";
                }} /></label>
                <textarea ref={input} rows={1} maxLength={4000} value={draft} disabled={busy}
                    placeholder={agent.teammate.archived ? "This conversation is archived" : `Message ${agent.teammate.name}…`}
                    aria-label={`Message ${agent.teammate.name}`} onChange={(event) => { setDraft(event.target.value); setReview(false); }}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault(); submit(event);
                    } }} />
                <button type="button" className="vdev-compose-options" aria-label="Message options" aria-expanded={options}
                    title="Model and thinking effort" onClick={() => setOptions((value) => !value)}>☷</button>
                {agent.typing ? <button type="button" className="vdev-compose-stop" onClick={() => agent.stop()}><span>■</span> Stop</button> :
                    draft.trim() ? <button type="submit" className="vdev-compose-go" disabled={busy} aria-label="Prepare message"
                        title="Review message cost"><DeviceIcon name="arrowUp" size={18} /></button> :
                    <button type="button" className="vdev-compose-mic" aria-label="Dictate message"
                        onClick={() => setHint("Voice dictation is available in the Mac app.")}><DeviceIcon name="mic" size={18} /></button>}
            </div>
            {options && <div className="vdev-compose-settings"><label>Model<select aria-label="AI model" value={model}
                onChange={(event) => setModel(event.target.value)}><option value="default">Teammate default</option>
                    <option value="claude">Claude Code</option><option value="codex">Codex</option></select></label>
                <span>{draft.length}/4000</span></div>}
        </form>
        <p className="vdev-compose-hint" role={hint || agent.notice ? "status" : undefined}>{hint || agent.notice || "Enter to review cost · Shift + Enter for a new line"}</p>
    </div>;
}
