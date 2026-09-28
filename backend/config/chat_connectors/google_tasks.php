<?php

return [
    'google_tasks' => [
        'name' => 'Google Tasks',
        'tagline' => 'Task lists and approved new tasks.',
        'blurb' => 'Review task lists and their tasks, then create one task after approving its exact list and contents.',
        'category' => 'Productivity',
        'abilities' => ['List task lists', 'Read up to fifty tasks per page', 'Create one approved task'],
        'reads' => 'Task list names, task titles, bounded notes, status and due dates in your Google Tasks account.',
        'writes' => 'Creates one task only after you approve its list, title, notes and due date. It cannot edit, complete or delete tasks.',
        'credential' => [
            'label' => 'Sign in with Google', 'placeholder' => '',
            'help' => 'Google asks to manage tasks; Vibyra limits changes to one approved task at a time.',
            'url' => 'https://accounts.google.com/',
        ],
        'oauth' => [
            'authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token_url' => 'https://oauth2.googleapis.com/token',
            'refresh_url' => 'https://oauth2.googleapis.com/token',
            'scope' => 'openid email https://www.googleapis.com/auth/tasks',
            'client_id' => env('CHAT_CONNECTORS_GOOGLE_TASKS_ENABLED', false)
                ? env('CHAT_CONNECTORS_GOOGLE_CLIENT_ID') : null,
            'client_secret' => env('CHAT_CONNECTORS_GOOGLE_TASKS_ENABLED', false)
                ? env('CHAT_CONNECTORS_GOOGLE_CLIENT_SECRET') : null,
            'pkce' => true, 'access_type' => 'offline', 'prompt' => 'consent',
            'refresh_fields' => ['refresh_token', 'grant_type', 'client_id', 'client_secret'],
        ],
    ],
];
