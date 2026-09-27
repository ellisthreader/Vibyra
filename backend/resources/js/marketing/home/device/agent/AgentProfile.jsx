import React, { useState } from "react";
import AgentAvatar from "./AgentAvatar.jsx";

const faces = ["oncall", "lead", "review", "bugs", "assistant", "db", "site", "qa", "sprout"];
const tabs = ["Profile", "Skills", "Memory", "Access"];

export default function AgentProfile({ agent }) {
    const existing = agent.profile === "new" || agent.profile === "settings" ? null :
        agent.allTeammates.find((item) => item.id === agent.profile);
    const [tab, setTab] = useState("Profile");
    const [fields, setFields] = useState({
        name: existing?.name ?? "", brief: existing?.brief ?? existing?.reply ?? "", face: existing?.face ?? "sprout",
        engine: existing?.engine ?? "claude", memory: existing?.memory ?? "",
        budget: existing?.budget ?? 10, skillIds: existing?.skillIds ?? [],
    });
    const update = (key, value) => setFields((current) => ({ ...current, [key]: value }));
    if (agent.profile === "settings") return (
        <section className="vdev-profile vdev-settings-sample" aria-label="Settings">
            <header><h2>Settings</h2><button type="button" onClick={() => agent.setProfile(null)}>Back to teammates</button></header>
            <div className="vdev-profile-scroll"><h3>General</h3><p>The desktop app keeps your account, AI accounts, appearance, and device preferences here.</p>
                <p>This website uses a local sample workspace. Open Vibyra on your Mac to change its settings.</p></div>
        </section>
    );
    return (
        <form className="vdev-profile" aria-label={existing ? "Teammate details" : "New teammate"}
            onSubmit={(event) => { event.preventDefault(); agent.saveProfile(fields); }}>
            <header><h2>{existing ? "Edit teammate" : "New teammate"}</h2>
                <button type="button" onClick={() => agent.setProfile(null)}>Back to teammates</button></header>
            <nav className="vdev-profile-tabs" aria-label="Teammate settings">
                {tabs.map((name) => <button key={name} type="button" aria-current={tab === name ? "page" : undefined}
                    onClick={() => setTab(name)}>{name}{name === "Skills" && fields.skillIds.length > 0 && <small>{fields.skillIds.length}</small>}</button>)}
            </nav>
            <div className="vdev-profile-scroll">
                {tab === "Profile" && <div className="vdev-profile-overview">
                    <div className="vdev-profile-identity"><div className="vdev-profile-name">
                        <AgentAvatar face={fields.face} size={48} />
                        <label>Name<input required maxLength={80} value={fields.name} placeholder="e.g. Website reviewer"
                            onChange={(event) => update("name", event.target.value)} /></label></div>
                        <div className="vdev-profile-faces" aria-label="Appearance">{faces.map((face) =>
                            <button key={face} type="button" aria-label={`Choose ${face} avatar`} aria-pressed={fields.face === face}
                                onClick={() => update("face", face)}><AgentAvatar face={face} size={35} /></button>)}</div>
                    </div>
                    <div className="vdev-profile-grid"><div><h3>Brief</h3><p>The job you want this teammate to do.</p>
                        <textarea required maxLength={4000} aria-label="Brief" value={fields.brief}
                            placeholder="Describe the goal, the steps to follow, and a useful result…"
                            onChange={(event) => update("brief", event.target.value)} /></div>
                        <div><h3>AI provider</h3><p>Choose how this teammate approaches tasks.</p>
                            <div className="vdev-profile-engines">{[["claude", "Claude Code"], ["codex", "Codex"]].map(([id, label]) =>
                                <button key={id} type="button" aria-pressed={fields.engine === id}
                                    onClick={() => update("engine", id)}>{label}<span>{fields.engine === id ? "✓" : ""}</span></button>)}</div></div>
                    </div>
                </div>}
                {tab === "Skills" && <div className="vdev-profile-section"><h3>Skills</h3><p>Extra instructions this teammate can use in the sample conversation.</p>
                    {agent.skills.map((skill) => <label className="vdev-profile-choice" key={skill.id}><input type="checkbox"
                        checked={fields.skillIds.includes(skill.id)} onChange={(event) => update("skillIds", event.target.checked ?
                            [...fields.skillIds, skill.id] : fields.skillIds.filter((id) => id !== skill.id))} />{skill.name}</label>)}
                    {!agent.skills.length && <p>No skills yet. Add one from the Skills button in the list.</p>}</div>}
                {tab === "Memory" && <div className="vdev-profile-section"><h3>Memory</h3><p>Preferences and context to include with every task.</p>
                    <label>Saved context<textarea maxLength={4000} value={fields.memory} placeholder="Your preferences, project context and important facts…"
                        onChange={(event) => update("memory", event.target.value)} /></label></div>}
                {tab === "Access" && <div className="vdev-profile-grid"><div><h3>Tools</h3><p>Desktop integrations and folder grants are managed in the Mac app.</p></div>
                    <div><h3>Task budget</h3><p>Maximum Vibes per task. Unused Vibes return to your balance.</p>
                        <div className="vdev-profile-budgets">{[5, 10, 20].map((value) => <button key={value} type="button"
                            aria-pressed={fields.budget === value} onClick={() => update("budget", value)}>{value} Vibes</button>)}</div>
                        <label>Custom budget<input type="number" min="1" max="50" value={fields.budget}
                            onChange={(event) => update("budget", Number(event.target.value))} /></label></div></div>}
            </div>
            <footer><p>Changes in this sample stay in the browser.</p>
                <button className="vdev-profile-primary" disabled={!fields.name.trim() || !fields.brief.trim() || fields.budget < 1 || fields.budget > 50}
                    type="submit">{existing ? "Save changes" : "Create teammate"}</button>
                {existing && <button type="button" onClick={agent.archiveProfile}>{existing.archived ? "Restore teammate" : "Archive teammate"}</button>}
            </footer>
        </form>
    );
}
