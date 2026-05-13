import type { ChatSkill } from "./appApi";

export type LocalChatSkill = ChatSkill & {
  promptPrefix: string;
};

export const localChatSkills: LocalChatSkill[] = [
  {
    id: "plan",
    slash: "/plan",
    label: "Plan",
    description: "Make an implementation plan before editing",
    category: "Workflow",
    mode: "chat",
    promptPrefix: "Make a concise implementation plan for this request. Do not edit files or apply changes yet. Explain the key steps, risks, and verification path."
  },
  {
    id: "debug",
    slash: "/debug",
    label: "Debug",
    description: "Find the root cause and propose or apply a fix",
    category: "Workflow",
    mode: "chat",
    promptPrefix: "Debug this issue like a senior engineer. Identify the root cause first, then make the smallest correct fix if enough context is available. Include what you verified."
  },
  {
    id: "review",
    slash: "/review",
    label: "Review",
    description: "Review code for bugs and risky changes",
    category: "Workflow",
    mode: "chat",
    promptPrefix: "Review this code/change set. Prioritize bugs, regressions, security or data-loss risks, and missing tests. Put findings first with concrete file references when possible."
  },
  {
    id: "design",
    slash: "/design",
    label: "Design",
    description: "Improve UI layout, spacing, and polish",
    category: "Workflow",
    mode: "build",
    promptPrefix: "Improve the frontend design for this request. Focus on layout, spacing, hierarchy, typography, and interaction polish while respecting the existing design system."
  },
  {
    id: "ship",
    slash: "/ship",
    label: "Ship",
    description: "Polish, verify, and summarize the change",
    category: "Workflow",
    mode: "chat",
    promptPrefix: "Prepare this work to ship. Check for obvious polish issues, run relevant verification, and summarize the final state and any remaining risks."
  },
  {
    id: "publish",
    slash: "/publish",
    label: "Publish",
    description: "Open publish settings for this project",
    category: "Workflow",
    mode: "chat",
    promptPrefix: "Open publish settings for this project."
  },
  {
    id: "explain",
    slash: "/explain",
    label: "Explain",
    description: "Explain the selected code or project area",
    category: "Workflow",
    mode: "chat",
    promptPrefix: "Explain how this code or project area works. Be concrete, reference the current context, and avoid making code changes."
  }
];

export function mergeChatSkills(remoteSkills: ChatSkill[]): Array<ChatSkill | LocalChatSkill> {
  const seen = new Set(localChatSkills.map((skill) => skill.id));
  return [
    ...localChatSkills,
    ...remoteSkills.filter((skill) => !seen.has(skill.id))
  ];
}

export function applyLocalSkillPrompt(skill: ChatSkill | LocalChatSkill, text: string) {
  if (!("promptPrefix" in skill)) return text;
  return text
    ? `${skill.promptPrefix}\n\nUser request: ${text}`
    : skill.promptPrefix;
}
