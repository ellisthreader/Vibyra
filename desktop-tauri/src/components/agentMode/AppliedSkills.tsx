import { useAgentModeStore } from "../../state/agentModeStore";
import { BookIcon } from "../common/AgentIcons";

/**
 * The skills that shaped this turn, named at the version that ran.
 *
 * This is not decoration. Trigger matching is word overlap deliberately biased
 * toward expanding — a false positive costs one procedure in the prompt, a
 * false negative costs the skill entirely — and the only way to tune that bias
 * is to watch it fire.
 *
 * It is also the security property. A skill is a standing instruction injected
 * into every matching turn, which is precisely the shape prompt injection is
 * trying to create. A skill firing where it should not is worth seeing on the
 * turn it happened rather than discovering later from an answer that read
 * oddly.
 *
 * Each one is a link into the library at the version that ran, which is what
 * makes an answer arguable: you can read the standing instruction that shaped
 * it instead of guessing at one.
 */
export function AppliedSkills({
  applied,
}: {
  applied: { skillId: string; name: string; version: number }[];
}) {
  const openPanel = useAgentModeStore((state) => state.openPanel);
  const openSkill = useAgentModeStore((state) => state.openSkill);

  return (
    <div className="applied">
      {applied.map((skill) => (
        <button
          key={skill.skillId}
          type="button"
          className="applied__pill"
          title="Read the procedure that ran"
          onClick={() => {
            openPanel("skills");
            openSkill(skill.skillId);
          }}
        >
          <BookIcon size={11} />
          <span>Applied “{skill.name}”</span>
          <span className="applied__ver">v{skill.version}</span>
        </button>
      ))}
    </div>
  );
}
