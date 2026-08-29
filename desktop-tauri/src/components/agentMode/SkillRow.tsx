import type { Skill } from "../../agentTypes";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { SkillHistory } from "./SkillHistory";

/** One skill, folded down to its trigger until opened. */
export function SkillRow({ skill, onEdit }: { skill: Skill; onEdit: () => void }) {
  const setStatus = useAgentWorkStore((state) => state.setSkillStatus);
  const proposed = skill.status === "proposed";

  return (
    <li className="skill-row">
      <details>
        <summary>
          <span className="skill-row__name">{skill.name}</span>
          <span className="skill-row__version">v{skill.version}</span>
          <span className="skill-row__trigger">{skill.trigger}</span>
        </summary>
        <div className="skill-row__body">
          <p className="section-label">Procedure</p>
          <pre>{skill.procedure}</pre>
          {skill.verification && (
            <>
              <p className="section-label">How to know it worked</p>
              <p>{skill.verification}</p>
            </>
          )}
          {skill.boundary && (
            <>
              <p className="section-label">Stop and ask before</p>
              <p>{skill.boundary}</p>
            </>
          )}
          <SkillHistory skill={skill} />
        </div>
      </details>
      <div className="skill-row__actions">
        {proposed ? (
          <>
            <button className="btn-primary" onClick={() => void setStatus(skill.id, "installed")}>
              Install
            </button>
            <button className="btn-ghost" onClick={() => void setStatus(skill.id, "retired")}>
              Discard
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={onEdit}>
              Edit
            </button>
            <button className="btn-ghost" onClick={() => void setStatus(skill.id, "retired")}>
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}
