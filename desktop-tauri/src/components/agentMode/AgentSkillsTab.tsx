import { useEffect, useState } from "react";

import type { AgentProfile } from "../../agentTypes";
import { BookIcon } from "../common/AgentIcons";
import { assignedSkills } from "../../ipc/agentConfig";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { EmptyState } from "./EmptyState";
import { PanelHead } from "./PanelHead";

/**
 * Which of the library's skills this teammate has.
 *
 * A checklist rather than a second library: skills are written once and given
 * to whoever needs them, and duplicating the editor here would let two copies
 * of the same procedure drift apart.
 */
export function AgentSkillsTab({ agent }: { agent: AgentProfile }) {
  const skills = useAgentWorkStore((state) => state.skills);
  const load = useAgentWorkStore((state) => state.loadSkills);
  const assign = useAgentWorkStore((state) => state.assignSkill);
  const openPanel = useAgentModeStore((state) => state.openPanel);
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    void load();
    void assignedSkills(agent.id)
      .then((found) => setMine(found.map((skill) => skill.id)))
      .catch(() => setMine([]));
  }, [agent.id, load]);

  const installed = skills.filter((skill) => skill.status === "installed");

  const toggle = async (skillId: string) => {
    const on = !mine.includes(skillId);
    setMine((current) => (on ? [...current, skillId] : current.filter((id) => id !== skillId)));
    await assign(agent.id, skillId, on);
  };

  return (
    <div className="panel">
      <div className="panel__inner">
        <PanelHead
          title={`${agent.name}’s skills`}
          blurb="Each one it has is offered as a single line in every turn; the full procedure is only expanded when its trigger matches what you asked."
          actions={
            <button className="btn btn--sm" onClick={() => openPanel("skills")}>
              <BookIcon size={13} /> Open the library
            </button>
          }
        />
        {installed.length === 0 ? (
          <EmptyState
            icon={<BookIcon size={18} />}
            title="Nothing in the library yet"
            body="Write a skill once in the Skills panel and it can be given to any teammate from here."
            action={
              <button className="btn btn--primary" onClick={() => openPanel("skills")}>
                Write a skill
              </button>
            }
          />
        ) : (
          <section className="panel__section">
            <div className="panel__section-head">
              <span className="section-label">Given to {agent.name}</span>
              <span className="panel__count">
                {mine.length} of {installed.length}
              </span>
            </div>
            <ul className="rows">
              {installed.map((skill) => (
                <li key={skill.id}>
                  <label className="row row--check">
                    <input
                      type="checkbox"
                      checked={mine.includes(skill.id)}
                      onChange={() => void toggle(skill.id)}
                    />
                    <span className="row__text">
                      <span className="row__title">
                        <span>{skill.name}</span>
                      </span>
                      <span className="row__meta">{skill.trigger}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
