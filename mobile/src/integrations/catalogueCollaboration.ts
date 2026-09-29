import { integration } from './catalogueEntry';

export const collaborationIntegrations = [
  integration({
    id: 'slack', name: 'Slack',
    tagline: 'Workspace channels and approved posts.',
    blurb: 'List channels the installed bot can see, read recent messages and post one approved message as the bot.',
    category: 'Communication',
    abilities: ['List up to one hundred channels', 'Read up to twenty recent channel messages', 'Post one approved bot message'],
    reads: 'Channel names and recent messages available to the installed bot. Private channels require bot membership.',
    writes: 'Posts one message as the Vibyra bot to the exact approved channel.',
    credential: {kind: 'oauth', label: 'Sign in with Slack', placeholder: '',
      help: 'Continue to Slack to install the bot in your workspace. You will return to Vibyra when connected.',
      url: 'https://slack.com/signin'},
  }),
  integration({
    id: 'notion', name: 'Notion',
    tagline: 'Shared pages and notes.',
    blurb: 'Search pages you share with the Notion connection and read their top-level blocks.',
    category: 'Productivity',
    abilities: ['Search up to twenty shared pages', 'Read the first one hundred top-level blocks of a page'],
    reads: 'Titles and top-level blocks of pages explicitly shared with the Notion connection.',
    credential: {kind: 'oauth', label: 'Sign in with Notion', placeholder: '',
      help: 'Continue to Notion and choose which pages to share. You will return to Vibyra when connected.',
      url: 'https://www.notion.so/login'},
  }),
  integration({
    id: 'linear', name: 'Linear',
    tagline: 'Teams and issues.',
    blurb: 'Find teams and issues, read issue details and create one approved issue in a selected team.',
    category: 'Productivity',
    abilities: ['List up to fifty teams', 'Search and read issues', 'Create one approved issue'],
    reads: 'Team names, issue titles, descriptions, states and links available to your Linear account.',
    writes: 'Creates one issue in the exact approved team with the exact approved title and description.',
    credential: {kind: 'oauth', label: 'Sign in with Linear', placeholder: '',
      help: 'Continue to Linear and approve issue access. You will return to Vibyra when connected.',
      url: 'https://linear.app/login'},
  }),
];
