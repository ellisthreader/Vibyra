import React, { useEffect, useRef, useState } from "react";

export default function AgentSkills({ agent }) {
    const [editing, setEditing] = useState(null);
    const [fields, setFields] = useState({ name: "", instructions: "", teammateIds: [] });
    const dialog = useRef(null);
    useEffect(() => { dialog.current?.focus(); }, []);
    const change = (key, value) => setFields((current) => ({ ...current, [key]: value }));
    const edit = (skill) => { setEditing(skill?.id ?? "new"); setFields(skill ?? { name: "", instructions: "", teammateIds: [] }); };
    const save = (event) => {
        event.preventDefault();
        const skill = { ...fields, id: editing === "new" ? `skill-${Date.now()}` : editing };
        agent.saveSkill(skill);
        setEditing(null);
    };
    return <div className="vdev-skills-backdrop" onClick={() => agent.setSkillsOpen(false)}>
        <section className="vdev-skills" role="dialog" aria-modal="true" aria-label="Skills" tabIndex={-1} ref={dialog}
            onKeyDown={(event) => { if (event.key === "Escape") agent.setSkillsOpen(false); }}
            onClick={(event) => event.stopPropagation()}>
            <header><h2>Skills</h2><button type="button" onClick={() => agent.setSkillsOpen(false)}>Done</button></header>
            {editing ? <form onSubmit={save}>
                <label>Name<input required maxLength={80} value={fields.name} onChange={(event) => change("name", event.target.value)} /></label>
                <label>Instructions<textarea required maxLength={4000} value={fields.instructions} onChange={(event) => change("instructions", event.target.value)} /></label>
                <p>Assign to teammates</p>{agent.allTeammates.filter((item) => !item.archived).map((item) =>
                    <label className="vdev-skill-check" key={item.id}><input type="checkbox" checked={fields.teammateIds.includes(item.id)}
                        onChange={(event) => change("teammateIds", event.target.checked ? [...fields.teammateIds, item.id] :
                            fields.teammateIds.filter((id) => id !== item.id))} />{item.name}</label>)}
                <small>Instructions do not grant tool access.</small>
                <div className="vdev-skills-actions"><button type="submit" className="vdev-profile-primary">Save skill</button>
                    <button type="button" onClick={() => setEditing(null)}>Back</button></div>
            </form> : <div className="vdev-skills-list">{agent.skills.map((skill) =>
                <button type="button" key={skill.id} onClick={() => edit(skill)}>{skill.name}</button>)}
                <button type="button" className="vdev-profile-primary" onClick={() => edit(null)}>New skill</button></div>}
        </section>
    </div>;
}
