<?php

/*
 * Integrations let a chat reach a service the person already uses. The catalogue
 * is a menu and is readable by anyone, the way the model catalogue is; connecting
 * an account and running an integration tool are what this flag gates.
 *
 * `credential` describes what the person must paste and where to get it, so the
 * install page can be written from this file rather than from hardcoded copy.
 *
 * `writes` is the honest half of the pair. An integration that only reads leaves
 * it null; one that can change something in the person's account says so here, in
 * the same words the app puts under "Changes".
 */
return [

    'enabled' => env('CHAT_CONNECTORS_ENABLED', false),

    // A connected account is never called more slowly than this allows, and one
    // integration call may never hold a turn open longer than the job's own timeout.
    'timeout_seconds' => (int) env('CHAT_CONNECTORS_TIMEOUT_SECONDS', 12),

    // At most this many integration tools may be attached to a single turn. Every
    // tool schema is sent with the prompt and is therefore paid for by the person.
    'max_per_turn' => 3,

    'catalogue' => [

        'github' => [
            'name' => 'GitHub',
            'tagline' => 'Repositories, issues and pull requests.',
            'blurb' => 'Ask about your repositories, search issues and pull requests, read recent commits, and open an issue without leaving the chat.',
            'category' => 'Development',
            'abilities' => [
                'List the repositories your token can see',
                'Search issues and pull requests',
                'Read the most recent commits on a branch',
                'Open a new issue on a repository',
            ],
            'reads' => 'Repository names, issues, pull requests and commit messages your token can already read.',
            'writes' => 'Opens issues you ask for. It never closes, edits or comments on one, and it touches no code, branch or pull request.',
            'credential' => [
                'label' => 'Personal access token',
                'placeholder' => 'github_pat_…',
                // Issues has to be readable even for a token that never writes: without
                // it, searching skips every issue in a private repository.
                'help' => 'Create a fine-grained token, choose the repositories it can see, and give it read access to Contents, Issues and Pull requests. Set Issues to read and write if you want to open issues from a chat. One token reaches one owner: your own account or one organization.',
                'url' => 'https://github.com/settings/personal-access-tokens/new',
            ],
        ],

        'stripe' => [
            'name' => 'Stripe',
            'tagline' => 'Payments, balance and customers.',
            'blurb' => 'Ask what came in today, look up a customer by email, read your balance, and add a customer without opening the dashboard.',
            'category' => 'Payments',
            'abilities' => [
                'Read your available and pending balance',
                'List recent payments',
                'Find a customer by email address',
                'Create a customer record, which moves no money',
            ],
            'reads' => 'Your balance, recent charges and customer records.',
            'writes' => 'Creates customer records you ask for. It cannot charge, refund, pay out, or start a subscription, and it will not make a second customer for an email that already has one.',
            'credential' => [
                'label' => 'Restricted API key',
                'placeholder' => 'rk_live_…',
                'help' => 'Create a restricted key with read access to Balance and Charges, and write access to Customers. A full secret key is not needed.',
                'url' => 'https://dashboard.stripe.com/apikeys',
            ],
        ],

    ],

];
