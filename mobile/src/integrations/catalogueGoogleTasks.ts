import type { Integration } from './types';
import { integration } from './catalogueEntry';

export const googleTasksIntegrations: Integration[] = [
  integration({
    id: 'google_tasks',
    name: 'Google Tasks',
    tagline: 'Task lists and approved new tasks.',
    blurb: 'Review task lists and their tasks, then create one task after approving its exact list and contents.',
    category: 'Productivity',
    abilities: ['List task lists', 'Read up to fifty tasks per page', 'Create one approved task'],
    reads: 'Task list names, task titles, bounded notes, status and due dates in your Google Tasks account.',
    writes: 'Creates one task only after you approve its list, title, notes and due date. It cannot edit, complete or delete tasks.',
    credential: {
      kind: 'oauth', label: 'Sign in with Google', placeholder: '',
      help: 'Google asks to manage tasks; Vibyra limits changes to one approved task at a time.',
      url: 'https://accounts.google.com/',
    },
  }),
];
