<?php

return [
    'enabled' => env('AGENTS_ENABLED', true),
    'max_teammates' => 50,
    'max_steps' => 8,
    // Released only after the native Mac grant and runner pass end-to-end acceptance.
    'local_runner_enabled' => env('AGENTS_LOCAL_RUNNER_ENABLED', false),
    // Reviewed specialist policy; availability, funding and effort are checked live.
    'models' => [
        'default' => 'anthropic/claude-sonnet-5',
        'complex' => 'anthropic/claude-opus-5',
        'fast' => 'google/gemini-3.8-flash',
    ],
    // These workers use structured connector tools. They do not host a desktop.
    'cloud_computer' => false,
];
