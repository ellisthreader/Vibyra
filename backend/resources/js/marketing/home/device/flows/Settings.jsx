import React, { useState } from "react";
import DeviceIcon from "../DeviceIcon.jsx";
import { Row, Toggle, Group, Segments } from "./FlowControls.jsx";
import PhoneSettings from "./PhoneSettings.jsx";
import { agents, logoPath } from "../../agents.js";
const sections = [
    ["General", "gear", "#6b7280", "theme appearance text font performance privacy"],
    ["Accounts", "sparkles", "#5b7cfa", "claude codex gemini anthropic openai google integrations github obsidian"],
    ["Notifications", "bell", "#e0553f", "sound alerts events"],
    ["Phone", "phone", "#2f9e6b", "remote connection typing"],
    ["Shortcuts", "terminal", "#8b5cf6", "keyboard voice screenshot keys"],
    ["Account", "home", "#2a8bd6", "membership profile"],
    ["Advanced", "gauge", "#3f4756", "terminal font shell voice files runtimes"],
];
export default function Settings({ demo, initialSection = "General" }) {
    const [section, setSection] = useState(initialSection);
    const [query, setQuery] = useState("");
    const { preferences: p, updatePreferences: update } = demo;
    const toggle = (key, label) => <Toggle label={label} value={p[key]} onChange={value => update({ [key]: value })} />;
    const found = sections.filter(([name, , , keywords]) => `${name} ${keywords}`.toLowerCase().includes(query.toLowerCase()));
    return <div className="vdev-settings-layout">
        <aside><input aria-label="Find a setting" placeholder="Find a setting" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }} />
            <nav aria-label="Settings sections">{found.map(([name, icon, color]) => <button type="button" key={name} aria-current={section === name ? "page" : undefined} onClick={() => { setSection(name); setQuery(""); }}><i style={{ background: color }}><DeviceIcon name={icon} size={14} /></i>{name}</button>)}{!found.length && <p>No matching settings.</p>}</nav>
        </aside>
        <div className="vdev-settings-content"><header><h3>{section}</h3><span>Saved in demo</span></header>
            {section === "General" && <>
                <Group title="Appearance"><Row label="Theme"><Segments label="Theme" value={p.theme} options={["Auto", "Dark", "Light"]} onChange={theme => update({ theme })} /></Row><Row label="Terminal text size"><div className="vdev-stepper"><button aria-label="Smaller terminal text" disabled={p.fontSize <= 9} onClick={() => update({ fontSize: p.fontSize - 1 })}>−</button><span>{p.fontSize} px</span><button aria-label="Larger terminal text" disabled={p.fontSize >= 24} onClick={() => update({ fontSize: p.fontSize + 1 })}>+</button></div></Row></Group>
                <Group title="Performance"><Row label="Performance" hint="Reduce motion in the sample workspace."><select aria-label="Performance" value={p.performance} onChange={event => update({ performance: event.target.value })}>{["Full", "Balanced", "Best performance"].map(value => <option key={value}>{value}</option>)}</select></Row></Group>
                <Group title="Privacy"><Row label="Send project context to the assistant" hint="Sample preference only; this demo sends no project data.">{toggle("context", "Send project context to the assistant")}</Row><Row label="Restore terminal output">{toggle("restore", "Restore terminal output")}</Row></Group>
            </>}
            {section === "Accounts" && <><Group title="Terminal accounts">{[["OpenAI", "codex"], ["Anthropic", "claude"], ["Google", "gemini"]].map(([company, id]) => { const agent = agents.find(a => a.id === id); return <div key={id} className="vdev-account-row"><img src={logoPath(agent)} alt="" width="29" height="29" /><span><strong>{company}</strong><small>{agent.name} · your own subscription</small></span><em>Sample account</em></div>; })}</Group><Group title="Integrations"><Row label="GitHub" hint="Repositories and pull requests"><span className="vdev-setting-status">In the desktop app</span></Row><Row label="Obsidian" hint="Your memory vault"><span className="vdev-setting-status">In the desktop app</span></Row></Group><p className="vdev-flow-note">Real sign-in happens in Vibyra Desktop. No credentials are used here.</p></>}
            {section === "Phone" && <PhoneSettings demo={demo} />}
            {section === "Notifications" && <><Group title="Notifications"><Row label="Show notifications">{toggle("notifications", "Show notifications")}</Row><Row label="Notification sounds">{toggle("sounds", "Notification sounds")}</Row></Group><Group title="Events"><Row label="Agent needs you">{toggle("attention", "Agent needs you")}</Row><Row label="Agent finished">{toggle("finished", "Agent finished")}</Row></Group><p className="vdev-flow-note">These sample preferences do not enable browser notifications or play sound.</p></>}
            {section === "Shortcuts" && <><Group title="System-wide">{[["Voice typing", "F8"], ["Talk to Vibyra", "F10"], ["Screenshot", "F9"]].map(([label, key]) => <Row key={label} label={label}><kbd>{key}</kbd></Row>)}</Group><Group title="Workspace">{[["Go home", "⌘ ⇧ H"], ["Settings", "⌘ ,"]].map(([label, key]) => <Row key={label} label={label}><kbd>{key}</kbd></Row>)}</Group><p className="vdev-flow-note">Shortcut reference for the desktop app. Your browser shortcuts remain unchanged.</p></>}
            {section === "Account" && <><div className="vdev-sample-profile"><span>Y</span><h4>Your Vibyra account</h4><p>Membership, tokens and connected devices live here in the desktop app.</p></div><Group title="Account"><Row label="Profile"><span className="vdev-setting-status">Sample workspace</span></Row><Row label="Membership"><span className="vdev-setting-status">No account connected</span></Row></Group></>}
            {section === "Advanced" && <><Group title="Terminal"><Row label="Font family"><select aria-label="Terminal font family" value={p.font} onChange={event => update({ font: event.target.value })}><option>JetBrains Mono</option><option>System Mono</option></select></Row><Row label="Default shell"><span className="vdev-setting-status">/bin/zsh</span></Row></Group><Group title="Files and screenshots"><Row label="Default project folder"><code>~/projects</code></Row><Row label="Screenshot folder"><code>~/Pictures/Vibyra</code></Row></Group><p className="vdev-flow-note">Folders shown are examples. This demo has no access to your files.</p></>}
        </div>
    </div>;
}
