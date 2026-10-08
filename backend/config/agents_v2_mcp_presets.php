<?php

/*
 * One-tap remote MCP services (`GET /api/agents/v2/catalogue` -> `mcpPresets`). Each entry is a vendor's own
 * Streamable HTTP MCP endpoint that signs a person in with the vendor's own OAuth and lets Vibyra register itself
 * (Dynamic Client Registration, or a Client ID Metadata Document), so nobody has to create an OAuth app.
 *
 * Verified 2026-10-07 against the live servers, per entry:
 *   - an unauthenticated `initialize` POST answers 401 (with `resource_metadata`, or the well-known document);
 *   - protected-resource and authorization-server metadata exist, the issuer matches, PKCE S256 is offered, and the
 *     server offers a registration endpoint or CIMD (Atlassian, whose server speaks the 2025-03-26 flow, publishes only
 *     the authorization-server document at its origin: Discovery falls back to that);
 *   - Vibyra's own McpServers::add() registered and produced an authorize URL the vendor accepted for client
 *     "Vibyra Agents" and the production callback (a consent page, or a redirect to the vendor's login).
 * Not verifiable without a human sign-in: a real token exchange and tools/list, so tool counts are unknown.
 *
 * Left out on purpose (checked the same day): Slack, GitHub, HubSpot, PagerDuty, Box, Render, DocuSign (need a pre-registered
 * app); Vercel, Figma, Canva, Intercom, monday.com, Dropbox (registration or redirect URI allow-list for named clients
 * only); Zendesk (needs a per-account address); Asana, Square, Plaid (legacy /sse transport or a pre-registered app).
 * PayPal's sandbox is https://mcp.sandbox.paypal.com/mcp; the live endpoint is listed.
 *
 * Order is by usefulness to developers: Payments, then development and infrastructure, productivity, design.
 * `native` is the built-in connector slug an entry overlaps (clients prefer the native connector), else null.
 */
return [
    'presets' => [
        ['id' => 'paypal', 'name' => 'PayPal', 'url' => 'https://mcp.paypal.com/mcp', 'category' => 'Payments',
            'tagline' => 'Invoices, orders, subscriptions and disputes', 'native' => null],
        ['id' => 'stripe', 'name' => 'Stripe', 'url' => 'https://mcp.stripe.com', 'category' => 'Payments',
            'tagline' => 'Customers, payments, subscriptions and invoices', 'native' => 'stripe'],
        ['id' => 'sentry', 'name' => 'Sentry', 'url' => 'https://mcp.sentry.dev/mcp', 'category' => 'Development',
            'tagline' => 'Issues, errors and releases', 'native' => null],
        ['id' => 'atlassian', 'name' => 'Atlassian', 'url' => 'https://mcp.atlassian.com/v1/mcp', 'category' => 'Development',
            'tagline' => 'Jira and Confluence', 'native' => null],
        ['id' => 'supabase', 'name' => 'Supabase', 'url' => 'https://mcp.supabase.com/mcp', 'category' => 'Infrastructure',
            'tagline' => 'Databases, migrations and edge functions', 'native' => null],
        ['id' => 'cloudflare', 'name' => 'Cloudflare', 'url' => 'https://mcp.cloudflare.com/mcp', 'category' => 'Infrastructure',
            'tagline' => 'Workers, DNS and your Cloudflare account', 'native' => null],
        ['id' => 'netlify', 'name' => 'Netlify', 'url' => 'https://netlify-mcp.netlify.app/mcp', 'category' => 'Infrastructure',
            'tagline' => 'Sites, deploys and environment variables', 'native' => null],
        ['id' => 'neon', 'name' => 'Neon', 'url' => 'https://mcp.neon.tech/mcp', 'category' => 'Infrastructure',
            'tagline' => 'Postgres projects, branches and queries', 'native' => null],
        ['id' => 'datadog', 'name' => 'Datadog', 'url' => 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp', 'category' => 'Infrastructure',
            'tagline' => 'Logs, metrics and monitors (US1 site only)', 'native' => null],
        ['id' => 'gitlab', 'name' => 'GitLab', 'url' => 'https://gitlab.com/api/v4/mcp', 'category' => 'Development',
            'tagline' => 'Projects, issues and merge requests on gitlab.com', 'native' => null],
        ['id' => 'postman', 'name' => 'Postman', 'url' => 'https://mcp.postman.com/mcp', 'category' => 'Development',
            'tagline' => 'Collections, workspaces and API specs', 'native' => null],
        ['id' => 'mongodb', 'name' => 'MongoDB', 'url' => 'https://mcp.mongodb.com/mcp', 'category' => 'Infrastructure',
            'tagline' => 'MongoDB Atlas clusters and data', 'native' => null],
        ['id' => 'notion', 'name' => 'Notion', 'url' => 'https://mcp.notion.com/mcp', 'category' => 'Productivity',
            'tagline' => 'Search and edit pages and databases', 'native' => 'notion'],
        ['id' => 'linear', 'name' => 'Linear', 'url' => 'https://mcp.linear.app/mcp', 'category' => 'Productivity',
            'tagline' => 'Issues, projects and cycles', 'native' => 'linear'],
        ['id' => 'airtable', 'name' => 'Airtable', 'url' => 'https://mcp.airtable.com/mcp', 'category' => 'Productivity',
            'tagline' => 'Bases, tables and records', 'native' => null],
        ['id' => 'clickup', 'name' => 'ClickUp', 'url' => 'https://mcp.clickup.com/mcp', 'category' => 'Productivity',
            'tagline' => 'Tasks, lists and docs', 'native' => null],
        ['id' => 'webflow', 'name' => 'Webflow', 'url' => 'https://mcp.webflow.com/mcp', 'category' => 'Design',
            'tagline' => 'Sites, CMS collections and pages', 'native' => null],
    ],
];
