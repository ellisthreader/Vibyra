import type { Avatar, TeammateFields } from '../types';

export const specialties = ['Personal assistant', 'Coding', 'Research', 'Ops'] as const;
const presets: {
  label: string;
  name: string;
  role: string;
  boundary: string;
  routine: string;
  avatar: Avatar;
  match: RegExp;
}[] = [
  {
    label: 'Design review',
    name: 'Design reviewer',
    avatar: 'qa',
    match: /figma|design|accessibility/i,
    role: 'Review designs for clarity, consistency, and accessibility.',
    boundary: 'Explain suggested changes before editing design files.',
    routine: 'Every week, review the designs I share and list the most useful improvements.',
  },
  {
    label: 'Writing partner',
    name: 'Writing partner',
    avatar: 'sprout',
    match: /writ(e|ing)|drafts|edit my/i,
    role: 'Improve drafts while preserving my voice.',
    boundary: 'Flag unsupported claims and ask before publishing.',
    routine: 'Every week, review my drafts and suggest the next edits.',
  },
  {
    label: 'Learning coach',
    name: 'Learning coach',
    avatar: 'lead',
    match: /learn|study|practice sessions/i,
    role: 'Plan focused practice around my level and available time.',
    boundary: 'Check understanding before moving to harder material.',
    routine: 'Every week, review what I learned and suggest the next practice session.',
  },
  {
    label: 'Meeting prep',
    name: 'Meeting helper',
    avatar: 'assistant',
    match: /meeting|agenda|customer.*follow.up/i,
    role: 'Prepare agendas and follow-up drafts from my notes.',
    boundary: 'Use the notes I supply; ask before contacting anyone.',
    routine: 'Before a planned meeting, prepare an agenda from my supplied notes.',
  },
  {
    label: 'Inbox helper',
    name: 'Inbox helper',
    avatar: 'assistant',
    match: /inbox|triage messages|email/i,
    role: 'Sort messages by importance and prepare replies.',
    boundary: 'Ask before sending, archiving, or deleting messages.',
    routine: 'Every weekday morning, prepare a digest of messages that need my reply.',
  },
  {
    label: 'Bug triage',
    name: 'Bug investigator',
    avatar: 'bugs',
    match: /bug|reproduc/i,
    role: 'Turn bug reports into clear reproduction steps.',
    boundary: 'Keep investigations within the approved project and test data.',
    routine: 'Every week, review open bug reports and highlight missing reproduction details.',
  },
  {
    label: 'Personal assistant',
    name: 'Personal assistant',
    avatar: 'assistant',
    match: /personal assistant|inbox|calendar|organis|organiz/i,
    role: 'Organize priorities and prepare useful reminders.',
    boundary: 'Ask before sending messages or changing plans.',
    routine: 'Every weekday morning, prepare my priorities and upcoming commitments.',
  },
  {
    label: 'Coding',
    name: 'Code reviewer',
    avatar: 'review',
    match: /cod(e|ing)|software|developer|program|repository/i,
    role: 'Review code, explain bugs, and prepare focused improvements.',
    boundary: 'Ask before publishing changes; stay within the assigned project.',
    routine: 'Every weekday morning, review open pull requests and summarize what needs attention.',
  },
  {
    label: 'Research',
    name: 'Research helper',
    avatar: 'site',
    match: /research|sources|report|study/i,
    role: 'Investigate questions and prepare concise, source-backed findings.',
    boundary: 'Separate evidence from uncertainty; do not invent sources.',
    routine:
      'Every weekday morning, prepare a short research brief on my chosen topic with sources.',
  },
  {
    label: 'Ops',
    name: 'Ops helper',
    avatar: 'oncall',
    match: /\bops\b|operations|incident|on.call|monitor/i,
    role: 'Review operational updates and help prioritize issues.',
    boundary: 'Ask before changing systems or contacting people.',
    routine: 'Every morning, summarize incidents, open issues, and the next checks to make.',
  },
];
export function specialistDraft(job: string): { fields: TeammateFields; routine: string } {
  const preset = presets.find((p) => p.match.test(job));
  const role = preset?.role ?? 'Help with this specific job and prepare reviewable results.';
  const boundary =
    preset?.boundary ?? 'Stay within this job and ask before taking actions outside it.';
  return {
    fields: {
      name: preset?.name ?? 'Specialist',
      avatar: preset?.avatar ?? 'sprout',
      brief: specialties.some((s) => s.toLowerCase() === job.toLowerCase())
        ? `${role} ${boundary}`
        : `${job.trim()}\n${boundary}`,
      memory: '',
      budget: 5,
      integrations: [],
    },
    routine:
      preset?.routine ?? 'Every week, review progress on this job and prepare the next priorities.',
  };
}
