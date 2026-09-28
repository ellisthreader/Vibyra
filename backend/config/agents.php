<?php

return [
    'enabled' => env('AGENTS_ENABLED', true),
    'max_teammates' => 50,
    'max_steps' => 8,
    // Released only after the native Mac grant and runner pass end-to-end acceptance.
    'local_runner_enabled' => env('AGENTS_LOCAL_RUNNER_ENABLED', false),
    // Separate opt-in for approved, worktree-only Linux VM shell tests.
    'vm_tests_enabled' => env('AGENTS_VM_TESTS_ENABLED', false),
    // PR creation needs branch-publication and native approval acceptance first.
    'github_pr_enabled' => env('AGENTS_GITHUB_PR_ENABLED', false),
    // Server-side Git data writes stay off until the exact Mac/UI path is accepted.
    'git_publish_enabled' => env('AGENTS_GIT_PUBLISH_ENABLED', false),
    // Reviewed specialist policy; availability, funding and effort are checked live.
    'models' => [
        'default' => 'anthropic/claude-sonnet-5',
        'complex' => 'anthropic/claude-opus-5',
        'fast' => 'google/gemini-3.8-flash',
    ],
    // These workers use structured connector tools. They do not host a desktop.
    'cloud_computer' => false,
];
