import type { Integration } from './types';
import { integration } from './catalogueEntry';

export const publicMcpIntegrations: Integration[] = [integration({
  id: 'deepwiki',
  name: 'DeepWiki',
  tagline: 'Public GitHub repository documentation.',
  blurb: 'Read documentation topics and ask focused questions about public GitHub repositories through DeepWiki.',
  category: 'Development',
  abilities: ['List documentation topics', 'Read bounded documentation text', 'Ask a focused repository question'],
  reads: 'Public GitHub repository documentation and DeepWiki answers. It does not open your private repositories or GitHub account.',
  credential: {
    kind: 'public', label: 'No account needed', placeholder: '',
    help: 'Public documentation is ready when the MCP service is available. Give each teammate access separately.',
    url: 'https://mcp.deepwiki.com/',
  },
}), integration({
  id: 'hackernews',
  name: 'Hacker News',
  tagline: 'Public technology stories and discussions.',
  blurb: 'Read current top stories, individual items and public user profiles through a scoped Composio session.',
  category: 'Research',
  abilities: ['List top-story IDs', 'Read a public story or comment', 'Read a public user profile'],
  reads: 'Public Hacker News stories, comments and profiles. No account access.',
  credential: {
    kind: 'public', label: 'No account needed', placeholder: '',
    help: 'Public data is ready when the Composio bridge is enabled. Give each teammate access separately.',
    url: 'https://news.ycombinator.com/',
  },
})];
