import { useEffect, useState } from "react";

import { BookIcon } from "../common/AgentIcons";
import { PlusIcon } from "../common/Icons";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { EmptyState } from "./EmptyState";
import { PanelHead } from "./PanelHead";
import { SkillEditor } from "./SkillEditor";
import { SkillRow } from "./SkillRow";

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
  const row = (skill: (typeof skills)[number]) => (
    <SkillRow
      key={skill.id}
      skill={skill}
      open={skill.id === expanded}
      onToggle={(next) => setExpanded(next ? skill.id : null)}
      onEdit={() => setEditing(skill.id)}
    />
  );

  return (
    <div className="panel">
      <div className="panel__inner">
        <PanelHead
          title="Skills"
          blurb="A procedure a teammate can be taught once and reuse. Each one names when it applies, what to do, how to check it worked, and where to stop and ask."
          actions={
            <button className="btn btn--sm btn--primary" onClick={() => setEditing("new")}>
              <PlusIcon size={13} /> Write a skill
            </button>
          }
        />
        {editing && (
          <SkillEditor
            skillId={editing === "new" ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}

        {proposed.length > 0 && (
          <section className="panel__section">
            <div className="panel__section-head">
              <span className="section-label">Proposed by a teammate</span>
              <span className="panel__count panel__count--ask">{proposed.length}</span>
            </div>
            <p className="panel__quiet">
              Written after repeating the same work. Read it before installing — once installed
              it is injected into every matching turn.
            </p>
            <ul className="rows">{proposed.map(row)}</ul>
          </section>
        )}

        <section className="panel__section">
          <div className="panel__section-head">
            <span className="section-label">Installed</span>
            {installed.length > 0 && <span className="panel__count">{installed.length}</span>}
          </div>
          {installed.length === 0 ? (
            <EmptyState
              icon={<BookIcon size={18} />}
              title="No skills yet"
              body="Write the procedure once and give it to whichever teammates need it. Each one is offered as a single line in every turn, and expanded only when its trigger matches."
              action={
                <button className="btn btn--primary" onClick={() => setEditing("new")}>
                  <PlusIcon size={13} /> Write a skill
                </button>
              }
            />
          ) : (
            <ul className="rows">{installed.map(row)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
