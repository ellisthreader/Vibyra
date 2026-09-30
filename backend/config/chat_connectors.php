<?php

/*
 * Integrations let a chat reach a service the person already uses. The catalogue
 * is a menu and is readable by anyone, the way the model catalogue is; connecting
 * an account and running an integration tool are what this flag gates.
 *
 * `credential` describes signing in on the provider website, so the
 * install page can be written from this file rather than from hardcoded copy.
 *
 * `writes` is the honest half of the pair. An integration that only reads leaves
 * it null; one that can change something in the person's account says so here, in
 * the same words the app puts under "Changes".
 */
return [

    'enabled' => env('CHAT_CONNECTORS_ENABLED', false),
    'public_mcp_enabled' => env('CHAT_CONNECTORS_PUBLIC_MCP_ENABLED', false),
    'composio_public_enabled' => env('CHAT_CONNECTORS_COMPOSIO_PUBLIC_ENABLED', false),
    'composio_api_key' => env('CHAT_CONNECTORS_COMPOSIO_API_KEY', ''),

    // A connected account is never called more slowly than this allows, and one
    // integration call may never hold a turn open longer than the job's own timeout.
    'timeout_seconds' => (int) env('CHAT_CONNECTORS_TIMEOUT_SECONDS', 12),

    // At most this many integration tools may be attached to a single turn. Every
    // tool schema is sent with the prompt and is therefore paid for by the person.
    'max_per_turn' => 10,

    'catalogue' => [

        'github' => [
            'name' => 'GitHub',
            'tagline' => 'Repositories, issues and pull requests.',
            'blurb' => 'Review pull requests, inspect code and tests, turn recent commits and merged work into updates, and open issues from chat.',
            'category' => 'Development',
            'abilities' => [
                'List the repositories you allow access to',
                'Search issues and pull requests',
                'Review PR changes, tests and CI; summarise commits and merged PRs',
                'Open a new issue on a repository',
            ],
            'reads' => 'Repositories, source and test files, pull request diffs, reviews, CI status, issues and commits you allow access to.',
            'writes' => 'Opens issues you ask for. It never closes, edits or comments on one, and it touches no code, branch or pull request.',
            'credential' => [
                'label' => 'Sign in with GitHub',
                'placeholder' => '',
                'help' => 'Continue to GitHub to sign in and approve access. You will return to Vibyra when it is connected.',
                'url' => 'https://github.com/login',
            ],
            // Signing in with GitHub, once an OAuth app is registered whose callback is
            // {APP_URL}/api/connectors/callback/github. GitHub has no OAuth scope narrower
            // than `repo` that reaches private issues, so it asks for more than the tools
            // use; the connect card says so. Both values must exist before browser sign-in is offered.
            'oauth' => [
                'authorize_url' => 'https://github.com/login/oauth/authorize',
                'token_url' => 'https://github.com/login/oauth/access_token',
                'scope' => 'repo',
                'client_id' => env('CHAT_CONNECTORS_GITHUB_CLIENT_ID'),
                'client_secret' => env('CHAT_CONNECTORS_GITHUB_CLIENT_SECRET'),
                'pkce' => true,
                'token_fields' => ['client_id', 'client_secret', 'code', 'redirect_uri', 'code_verifier'],
            ],
        ],

        'stripe' => [
            'name' => 'Stripe',
            'tagline' => 'Payments, balance and customers.',
            'blurb' => 'Ask how much your project collected this month, see refunds and balances, and look up customers. Test payments are clearly labelled.',
            'category' => 'Payments',
            'abilities' => [
                'Read your available and pending balance',
                'Report monthly payments and refunds by project',
                'Find a customer by email address',
                'Create a customer record, which moves no money',
            ],
            'reads' => 'Your account, project payment tags, dated payments and refunds, balance and customer records.',
            'writes' => 'Creates customer records you ask for. It cannot charge, refund, pay out, or start a subscription, and it will not make a second customer for an email that already has one.',
            'credential' => [
                'label' => 'Sign in with Stripe',
                'placeholder' => '',
                'help' => 'Continue to Stripe to sign in and approve access. You will return to Vibyra when it is connected.',
                'url' => 'https://dashboard.stripe.com/login',
            ],
            // Signing in with Stripe Connect: a `ca_` client id from the platform's Connect
            // settings, with {APP_URL}/api/connectors/callback/stripe as a redirect, and the
            // platform's secret key for the exchange. `read_write` is the only scope that
            // can create a customer. The token endpoint takes only these three fields.
            'oauth' => [
                'authorize_url' => 'https://connect.stripe.com/oauth/authorize',
                'token_url' => 'https://connect.stripe.com/oauth/token',
                'scope' => 'read_write',
                'client_id' => env('CHAT_CONNECTORS_STRIPE_CLIENT_ID'),
                'client_secret' => env('CHAT_CONNECTORS_STRIPE_SECRET_KEY'),
                'token_fields' => ['client_secret', 'code', 'grant_type'],
            ],
        ],

        'figma' => [
            'name' => 'Figma',
            'tagline' => 'Frames, layers and comments.',
            'blurb' => 'Ask what a screen actually says - spacing, colour, copy, the state you forgot - and read the comments left on a file.',
            'category' => 'Design',
            'abilities' => [
                'List the pages and top-level frames in a file you name',
                'Read one frame or node in full: bounds, text and fill colours',
                'Read the comment threads left on a file',
            ],
            'reads' => 'Pages, frames and layers - names, bounds, text and fill colours - and comments, in a file you name or link.',
            'writes' => null,
            'credential' => [
                'label' => 'Sign in with Figma',
                'placeholder' => '',
                'help' => 'Continue to Figma to sign in and approve access. You will return to Vibyra when it is connected.',
                'url' => 'https://www.figma.com/login',
            ],
            // Signing in with Figma, once an OAuth app is registered whose callback is
            // {APP_URL}/api/connectors/callback/figma. Figma's token endpoint identifies
            // the app over HTTP Basic auth rather than as body fields, hence token_auth.
            // Scopes are current as of the 2026 scoped-permissions model, not the retired
            // file_read; re-verify at https://developers.figma.com/docs/rest-api/scopes/
            // before relying on this if Figma has changed its scopes again.
            'oauth' => [
                'authorize_url' => 'https://www.figma.com/oauth',
                'token_url' => 'https://api.figma.com/v1/oauth/token',
                // Figma access tokens last 90 days; this trades the refresh token for the
                // next one, identifying the app over Basic auth exactly as the exchange does.
                'refresh_url' => 'https://api.figma.com/v1/oauth/refresh',
                'scope' => 'file_content:read,file_comments:read,current_user:read',
                'client_id' => env('CHAT_CONNECTORS_FIGMA_CLIENT_ID'),
                'client_secret' => env('CHAT_CONNECTORS_FIGMA_CLIENT_SECRET'),
                'pkce' => true,
                'token_auth' => 'basic',
                'token_fields' => ['code', 'redirect_uri', 'grant_type', 'code_verifier'],
            ],
        ],

        ...require __DIR__.'/chat_connectors/workspace.php',
        ...require __DIR__.'/chat_connectors/google_tasks.php',
        ...require __DIR__.'/chat_connectors/public_mcp.php',
        ...require __DIR__.'/chat_connectors/collaboration.php',

    ],

];
