import type { ChatSkill } from "../../../utils/appApi";
import { mergeChatSkills } from "../../../utils/chatSkills";

export function isKnownAiSkillCommand(prompt: string, skills: ChatSkill[]) {
  const match = prompt.trim().match(/^\/(\w+)(?:\s+[\s\S]*)?$/);
  if (!match) return false;
  const id = match[1].toLowerCase();
  return mergeChatSkills(skills).some((skill) => skill.id === id);
}

export function isProjectFilesQuestion(prompt: string) {
  const text = prompt.toLowerCase();
  const asks = /\b(?:what|which|list|show|tell\s+me|see|exist|inside|contents?)\b/.test(text);
  return asks
    && /\b(?:files?|folder|directory|dir|inside)\b/.test(text)
    && !/\b(?:build|create|change|fix|update|edit|refactor|implement|make|design|write|generate|remove|delete)\b/.test(text);
}
