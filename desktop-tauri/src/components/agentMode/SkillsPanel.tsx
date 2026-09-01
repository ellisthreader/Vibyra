import { useEffect, useState } from "react";

import { useAgentWorkStore } from "../../state/agentWorkStore";
import { SkillEditor } from "./SkillEditor";
import { SkillRow } from "./SkillRow";
import { useAgentModeStore } from "../../state/agentModeStore";

/**
 * The skill library.
 *
 * Proposals sit at the top and are the reason this panel is not just a list.
 * An agent may write a skill after doing the same work twice; it may not
 * install one, because a skill is a standing instruction injected into every
 * matching turn — precisely what prompt injection is trying to create. The
 * approval is the boundary, not friction.
 */
export function SkillsPanel() {
  const skills = useAgentWorkStore((state) => state.skills);
  const load = useAgentWorkStore((state) => state.loadSkills);
  const [editing, setEditing] = useState<string | null>(null);
  // An Applied pill asks for one skill by id. Taken once and cleared, so
  // coming back to the library later opens it as you left it rather than
  // re-expanding whatever a transcript pointed at an hour ago.
  const requested = useAgentModeStore((state) => state.skillId);
  const clearRequested = useAgentModeStore((state) => state.openSkill);
  const [expanded, setExpanded] = useState<string | null>(requested);

  useEffect(() => {
    if (!requested) return;
    setExpanded(requested);
    clearRequested(null);
  }, [requested, clearRequested]);

  useEffect(() => {
    void load();
  }, [load]);

  const proposed = skills.filter((skill) => skill.status === "proposed");
  const installed = skills.filter((skill) => skill.status === "installed");

  return (
    <div className="panel">
      <header className="panel__head">
        <h2>Skills</h2>
        <p>
          A procedure a teammate can be taught once and reuse. Each one names when it applies,
          what to do, how to check it worked, and where to stop and ask.
        </p>
      </header>

      <button className="panel__new" onClick={() => setEditing("new")}>
        Write a skill
      </button>
      {editing && (
        <SkillEditor
          skillId={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {proposed.length > 0 && (
        <section>
          <h3 className="section-label">Proposed by an agent</h3>
          <p className="panel__quiet">
            Written by a teammate after repeating the same work. Read it before installing —
            once installed it is injected into every matching turn.
          </p>
          <ul className="skill-list">
            {proposed.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                open={skill.id === expanded}
                onToggle={(next) => setExpanded(next ? skill.id : null)}
                onEdit={() => setEditing(skill.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="section-label">Installed</h3>
        {installed.length === 0 ? (
          <p className="panel__quiet">No skills yet.</p>
        ) : (
          <ul className="skill-list">
            {installed.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                open={skill.id === expanded}
                onToggle={(next) => setExpanded(next ? skill.id : null)}
                onEdit={() => setEditing(skill.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
