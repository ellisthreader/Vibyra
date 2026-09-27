import type { AgentSkill } from './types';

export function parseSavedSkill(value: string): AgentSkill {
  const saved: unknown = JSON.parse(value);
  if (!saved || typeof saved !== 'object') throw new Error('Invalid saved skill');
  const skill = saved as Record<string, unknown>;
  if (
    typeof skill.id !== 'string' ||
    typeof skill.revision !== 'number' ||
    !Number.isInteger(skill.revision) ||
    typeof skill.name !== 'string' ||
    typeof skill.instructions !== 'string' ||
    !Array.isArray(skill.teammateIds) ||
    !skill.teammateIds.every((id) => typeof id === 'string')
  )
    throw new Error('Invalid saved skill');
  return skill as unknown as AgentSkill;
}
