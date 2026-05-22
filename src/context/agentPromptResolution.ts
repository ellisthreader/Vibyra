import type { ChatSkill } from "../utils/appApi";
import type { AgentStartOptions } from "../types/chatTools";
import { applyLocalSkillPrompt, mergeChatSkills } from "../utils/chatSkills";
import { fileAttachmentsToProjectFiles, imageAttachmentsToApi } from "../utils/chatFileAttachments";

export function resolveAgentPrompt(trimmed: string, options: AgentStartOptions, chatSkills: ChatSkill[]) {
  const skillMatch = options.skillId ? null : trimmed.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  const allSkills = mergeChatSkills(chatSkills);
  const requestedSkill = options.skillId?.trim().toLowerCase();
  const skill = requestedSkill
    ? allSkills.find((item) => item.id === requestedSkill) ?? fallbackSkill(requestedSkill)
    : skillMatch ? allSkills.find((item) => item.id === skillMatch[1].toLowerCase()) : undefined;
  const skillId = requestedSkill || skill?.id;
  const userText = skill && skillMatch ? (skillMatch?.[2] ?? "").trim() : trimmed;
  const displayPrompt = options.displayPrompt?.trim();
  const fileAttachments = fileAttachmentsToProjectFiles(options.fileAttachments ?? []);
  const imageAttachments = imageAttachmentsToApi(options.imageAttachments ?? []);
  const messageAttachments = {
    ...(options.fileAttachments?.length ? { fileAttachments: options.fileAttachments } : {}),
    ...(options.imageAttachments?.length ? { imageAttachments: options.imageAttachments } : {})
  };
  const visibleText = skill
    ? (displayPrompt || (skillMatch ? (userText ? `${skill.slash} ${userText}` : skill.slash) : trimmed))
    : (displayPrompt || trimmed);
  const intentText = displayPrompt || (skill ? userText : trimmed);
  const promptBody = skill && !requestedSkill
    ? ("promptPrefix" in skill ? applyLocalSkillPrompt(skill, userText) : (userText || skill.label))
    : trimmed;

  return {
    displayPrompt,
    fileAttachments,
    imageAttachments,
    intentText,
    messageAttachments,
    promptBody,
    skill,
    skillId,
    visibleText
  };
}

function fallbackSkill(id: string): ChatSkill {
  return {
    category: "tool",
    description: "",
    id,
    label: id,
    mode: "chat",
    slash: `/${id}`
  };
}
