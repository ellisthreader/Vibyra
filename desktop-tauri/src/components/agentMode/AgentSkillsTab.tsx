import { useEffect, useRef, useState } from "react";

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
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const locks = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoaded(false); setMine([]); setPending([]); setError(null); locks.current.clear();
    void load();
    void assignedSkills(agent.id)
      .then((found) => { if (generation.current === current) { setMine(found.map(skill => skill.id)); setLoaded(true); } })
      .catch(failure => { if (generation.current === current) setError(String(failure)); });
    return () => { generation.current++; };
  }, [agent.id, load, retry]);

  const installed = skills.filter((skill) => skill.status === "installed");

  const toggle = async (skillId: string) => {
    if (!loaded || locks.current.has(skillId)) return;
    locks.current.add(skillId);
    const current = generation.current;
    const on = !mine.includes(skillId);
    setPending(items => [...items, skillId]); setError(null);
    try {
      await assign(agent.id, skillId, on);
      if (generation.current === current) setMine(items => on ? [...new Set([...items, skillId])] : items.filter(id => id !== skillId));
    } catch (failure) {
      if (generation.current === current) setError(String(failure));
    } finally {
      if (generation.current === current) { locks.current.delete(skillId); setPending(items => items.filter(id => id !== skillId)); }
    }
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
        {error && <p className="composer__error" role="alert">{error}</p>}
        {!loaded && error && <button className="btn btn--sm" onClick={() => setRetry(value => value + 1)}>Retry loading skills</button>}
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
                      disabled={!loaded || pending.includes(skill.id)}
                      aria-busy={pending.includes(skill.id)}
                      onChange={() => void toggle(skill.id)}
                    />
                    <span className="row__text">
                      <span className="row__title">
                        <span>{skill.name}{pending.includes(skill.id) ? " — Saving…" : ""}</span>
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
