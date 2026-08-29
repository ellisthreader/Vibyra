import { useEffect, useState } from "react";

import type { AgentProfile } from "../../agentTypes";
import { assignedSkills } from "../../ipc/agentConfig";
import { useAgentWorkStore } from "../../state/agentWorkStore";

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
      <header className="panel__head">
        <h2>{agent.name}&rsquo;s skills</h2>
        <p>
          Each one it has is offered as a single line in every turn; the full procedure is only
          expanded when its trigger matches what you asked.
        </p>
      </header>
      {installed.length === 0 ? (
        <p className="panel__quiet">
          No skills in the library yet. Write one from the Skills panel in the rail.
        </p>
      ) : (
        <ul className="assign-list">
          {installed.map((skill) => (
            <li key={skill.id}>
              <label>
                <input
                  type="checkbox"
                  checked={mine.includes(skill.id)}
                  onChange={() => void toggle(skill.id)}
                />
                <span className="assign-list__name">{skill.name}</span>
                <span className="assign-list__trigger">{skill.trigger}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
