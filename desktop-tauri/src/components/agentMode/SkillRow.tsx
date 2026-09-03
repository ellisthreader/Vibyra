import type { Skill } from "../../agentTypes";
import { ChevronDownIcon } from "../common/Icons";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { SkillHistory } from "./SkillHistory";

/**
 * One skill, folded down to its trigger until opened.
 *
 * `open` is controlled so an Applied pill in a transcript can land here with
 * the right procedure already expanded — tracing an answer back to the
 * standing instruction that shaped it is the whole point of that pill.
 *
 * The actions live in the opened body rather than on the folded row, for a
 * proposal on purpose: installing a standing instruction a teammate wrote for
 * itself should take reading it first, and one click on a closed row is
 * exactly the gesture that skips that.
 */
export function SkillRow({
  skill,
  open,
  onToggle,
  onEdit,
}: {
  skill: Skill;
  open: boolean;
  onToggle: (open: boolean) => void;
  onEdit: () => void;
}) {
  const setStatus = useAgentWorkStore((state) => state.setSkillStatus);
  const proposed = skill.status === "proposed";

  return (
    <li className="skill-row">
      <details open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
        <summary className="row">
          <span className="row__text">
            <span className="row__title">
              <span>{skill.name}</span>
              <span className="skill-row__version">v{skill.version}</span>
            </span>
            <span className="row__meta">{skill.trigger}</span>
          </span>
          <span className="row__side">
            {proposed && <span className="panel__count panel__count--ask">Proposed</span>}
            <span className="skill-row__chevron" aria-hidden="true">
              <ChevronDownIcon size={13} />
            </span>
          </span>
        </summary>
        <div className="skill-row__body">
          {skill.summary && <p className="skill-row__summary">{skill.summary}</p>}
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
          <div className="skill-row__actions">
            {proposed ? (
              <>
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={() => void setStatus(skill.id, "retired")}
                >
                  Discard
                </button>
                <button
                  className="btn btn--sm btn--primary"
                  onClick={() => void setStatus(skill.id, "installed")}
                >
                  Install
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={() => void setStatus(skill.id, "retired")}
                >
                  Remove
                </button>
                <button className="btn btn--sm" onClick={onEdit}>
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}
