<?php

/*
 * Agent V2 Composio adapter (rebuild Stage 3): long-tail services behind the same
 * broker contract, ONLY for toolkits whose connected accounts are isolated per
 * Vibyra account. Each person links their own account (Composio connected
 * account with our per-user `user_id`); the broker executes only the reviewed
 * tools listed here, on that person's connected account.
 *
 * Readiness is honest: a toolkit is `ready` only with the API key
 * (CHAT_CONNECTORS_COMPOSIO_API_KEY), the private flag, the toolkit's auth config
 * id, AND `isolation_verified`, which the owner sets only after checking with our
 * key that connected accounts are listed and executed per user_id (the 2026-09-30
 * audit saw 403 on the toolkit directory, so this is unverified).
 *
 * Tool slugs and parameters are the reviewed Composio schemas; re-check them with
 * GET /api/v3/tools/{slug} before switching a toolkit on.
 */
return [
    'private_enabled' => (bool) env('CHAT_CONNECTORS_COMPOSIO_PRIVATE_ENABLED', false),
    'isolation_verified' => (bool) env('CHAT_CONNECTORS_COMPOSIO_ISOLATION_VERIFIED', false),
    'base_url' => 'https://backend.composio.dev/api/v3',
    'toolkits' => [
        'airtable' => [
            'name' => 'Airtable', 'category' => 'Productivity',
            'auth_config' => env('CHAT_CONNECTORS_COMPOSIO_AIRTABLE_AUTH_CONFIG', ''),
            'tools' => [
                'list_bases' => ['slug' => 'AIRTABLE_LIST_BASES', 'kind' => 'read',
                    'description' => 'List the Airtable bases this account can open (id, name).', 'parameters' => []],
                'list_records' => ['slug' => 'AIRTABLE_LIST_RECORDS', 'kind' => 'read',
                    'description' => 'List records in one exact base and table, up to 100 per page; follow offset for more.',
                    'parameters' => ['baseId' => ['type' => 'string'], 'tableIdOrName' => ['type' => 'string'],
                        'pageSize' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100], 'offset' => ['type' => 'string']],
                    'required' => ['baseId', 'tableIdOrName']],
                'create_record' => ['slug' => 'AIRTABLE_CREATE_RECORD', 'kind' => 'write',
                    'description' => 'Create one record in an exact base and table after the person approves the exact fields.',
                    'parameters' => ['baseId' => ['type' => 'string'], 'tableIdOrName' => ['type' => 'string'],
                        'fields' => ['type' => 'object']], 'required' => ['baseId', 'tableIdOrName', 'fields']],
            ],
        ],
    ],
];
