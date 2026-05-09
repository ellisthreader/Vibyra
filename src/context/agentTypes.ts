import { Agent, BuildState, CodeChange, FileEntry, LogEvent, PreviewState } from "../types/domain";

export type AgentStartResult = {
  agent: Agent;
  changes: CodeChange[];
  files: FileEntry[];
  reply: string;
  events: LogEvent[];
  preview: { state: PreviewState; url?: string | null; title?: string | null };
  buildState: BuildState;
};

export function calculatePromptMoney(prompt: string) {
  const length = prompt.trim().length;

  if (length <= 80) return 0.1;
  if (length <= 220) {
    const ratio = (length - 81) / 139;
    return roundMoney(0.5 + ratio * 0.5);
  }

  const ratio = Math.min(1, (length - 221) / 479);
  return roundMoney(1 + ratio);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
