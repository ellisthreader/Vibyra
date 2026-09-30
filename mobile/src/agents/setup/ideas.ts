/** Original Vibyra starters informed by docs/grok-bot-setup-patterns.md. Plans do not grant capabilities. */
export const setupIdeas = [
  ['Inbox helper', 'Help me triage messages from customers and draft replies for review.'],
  ['Meeting prep', 'Prepare a short agenda from the meeting notes I provide.'],
  ['Code review', 'Review one GitHub repository and explain risky changes with file references.'],
  ['Bug triage', 'Turn bug reports into clear reproduction steps and proposed fixes.'],
  [
    'Research brief',
    'Research one topic at a time and separate sourced findings from open questions.',
  ],
  [
    'Learning coach',
    'Help me plan practice sessions around my current level and available study time.',
  ],
  ['Operations', 'Summarize operational issues and recommend which ones need attention.'],
  ['Design review', 'Review my Figma designs for clarity, consistency, and accessibility.'],
  [
    'Customer follow-up',
    'Turn my customer meeting notes into follow-up drafts without sending them.',
  ],
  ['Weekly priorities', 'Help me review unfinished work and choose a realistic set of priorities.'],
  [
    'Quiet notifications',
    'Help me define which updates deserve an alert and which belong in a digest.',
  ],
  ['Writing partner', 'Edit my drafts while preserving my voice and flagging unsupported claims.'],
] as const;
