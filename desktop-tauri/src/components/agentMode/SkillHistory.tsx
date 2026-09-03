import { useEffect, useState } from "react";

import type { Skill } from "../../agentTypes";
import { rollBackSkill, skillHistory } from "../../ipc/agentConfig";
import { useAgentWorkStore } from "../../state/agentWorkStore";

/**
 * Every version this skill has had, and the way back to one.
 *
 * Rolling back makes a *new* version rather than deleting the current one.
 * The history is what lets an audit record naming version 3 still be read
 * after version 4 exists, and rewriting it to tidy away a mistake would break
 * exactly that.
 */
export function SkillHistory({ skill }: { skill: Skill }) {
  const load = useAgentWorkStore((state) => state.loadSkills);
  const [versions, setVersions] = useState<Skill[]>([]);

  useEffect(() => {
    void skillHistory(skill.id).then(setVersions).catch(() => setVersions([]));
  }, [skill.id, skill.version]);

  const earlier = versions.filter((entry) => entry.version < skill.version);
  if (earlier.length === 0) return null;

  return (
    <details className="skill-history">
      <summary>{earlier.length} earlier version{earlier.length === 1 ? "" : "s"}</summary>
      <ul>
        {earlier.map((entry) => (
          <li key={entry.version}>
            <span className="skill-history__version">v{entry.version}</span>
            <span className="skill-history__text">{entry.procedure.split("\n")[0]}</span>
            <button
              className="btn btn--sm btn--secondary"
              onClick={async () => {
                await rollBackSkill(skill.id, entry.version).catch(() => {});
                await load();
              }}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
