<?php

return [
    // Retired: updates use CLI account discovery and local vector icons.
    // Old environment flags must never restart paid catalogue jobs.
    'enabled' => false,
    'publish' => false,
    'validate' => false,
    'artwork' => false,
    'source_url' => 'https://openrouter.ai/api/v1/models',
    'key_id' => env('MODEL_CATALOG_KEY_ID', 'catalog-1'),
    'signing_key' => env('MODEL_CATALOG_SIGNING_KEY'),
    'probe_key' => null,
    'image_key' => null,
    'image_model' => null,
    'image_reserve_micro' => 0,
    'probe_daily_micro' => 0,
    'artwork_daily_micro' => 0,
    'asset_origin' => env('MODEL_CATALOG_ASSET_ORIGIN', env('APP_URL', 'https://vibyra.app')),
    'proof_hours' => 24,
    'max_models' => 2000,
    'quarantined' => array_filter(explode(',', (string) env('MODEL_CATALOG_QUARANTINED', ''))),
    // Stable family policy, not a list of version numbers. Unknown families are
    // discovered but cannot enter the curated terminal menu without a policy.
    'families' => [
        'openai' => '/^gpt-[0-9]/', 'anthropic' => '/^claude-(opus|sonnet|fable|haiku)-/',
        'google' => '/^gemini-[0-9]/', 'x-ai' => '/^grok-[0-9]/',
        'deepseek' => '/^deepseek-/', 'qwen' => '/^qwen[0-9]/',
        'moonshotai' => '/^kimi-/', 'z-ai' => '/^glm-/', 'minimax' => '/^minimax-m[0-9]/',
        'mistralai' => '/^(mistral-(medium|small)|devstral)-/', 'bytedance-seed' => '/^seed-/',
    ],
];
