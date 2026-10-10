import type { ChangelogEntry } from './changelog.ts';

export const RELEASE_0828: ChangelogEntry = {
  version: '0.8.28', date: '2026-10-09', image: '/releases/0.8.28.svg',
  summary: 'Run separate jobs together and bring your teammates into one reviewed workflow.',
  sections: [
    { heading: 'Keep work moving', body: 'Send separate tasks while other jobs run. See each job’s progress and result, and cancel one without stopping the others. Your connected Claude account can run up to three jobs at a time.' },
    { heading: 'Bring teammates together', body: 'Create a named group, choose a coordinator, mention the teammates you need, and select exactly what context to share. Private conversation history and memory stay out of group tasks.' },
    { heading: 'Review the plan before it starts', body: 'Check the teammates, tasks, dependencies, success criteria and AI account before accepting a proposed workflow. Independent tasks run together; dependent tasks wait for their required results.' },
    { heading: 'Finish with evidence', body: 'The coordinator combines the completed tasks into one answer. Open the linked results and confirm the final criteria before marking the workflow complete.' },
    { heading: 'Protect simultaneous changes', body: 'Each external write keeps its exact approval. Conflicting or uncertain changes stop for review so one job cannot silently overwrite another job’s work.' },
  ],
};
