import type { ChangelogEntry } from './changelog.ts';

export const RELEASE_0826: ChangelogEntry = {
  version: '0.8.26', date: '2026-10-08', image: '/releases/0.8.26.svg',
  summary: 'Keep ongoing Agent work together, with a clear review before anything starts.',
  sections: [
    { heading: 'Goals and follow-ups', body: 'Review a milestone plan or an exact follow-up condition in Work. Track the linked tasks, pause future work, cancel unfinished tasks, and review the evidence before confirming a goal is finished.' },
    { heading: 'Turn chat suggestions into saved work', body: 'Teammates can draft skills and routines for you to review and edit. Saving uses the exact version and chosen AI account; a suggestion alone never starts work or grants access.' },
    { heading: 'Useful updates on your terms', body: 'Choose decisions and blockers, a daily summary with decisions, or progress updates. Quiet hours defer useful alerts, and summaries open the exact tasks they describe.' },
    { heading: 'Watch a project with purpose', body: 'Choose a GitHub repository using existing read access and optionally link it to a goal. Verified pull-request changes appear beside its current milestone criteria for your review; repository changes never mark a goal complete.' },
    { heading: 'A useful first task', body: 'Choose your interests to see starters matched to the teammate’s available read access. Preparing a starter fills a draft for you to review and send.' },
  ],
};
