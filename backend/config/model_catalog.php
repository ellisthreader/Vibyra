<?php

return [
    // Ship consumers before enabling publication. Discovery alone changes no menus.
    'enabled' => env('MODEL_CATALOG_ENABLED', false),
    'publish' => env('MODEL_CATALOG_PUBLISH', false),
    'validate' => env('MODEL_CATALOG_VALIDATE', false),
    'artwork' => env('MODEL_CATALOG_ARTWORK', false),
    'source_url' => 'https://openrouter.ai/api/v1/models',
    'key_id' => env('MODEL_CATALOG_KEY_ID', 'catalog-1'),
    'signing_key' => env('MODEL_CATALOG_SIGNING_KEY'),
    'probe_key' => env('MODEL_CATALOG_PROBE_KEY'),
    'image_key' => env('MODEL_CATALOG_IMAGE_KEY'),
    'image_model' => env('MODEL_CATALOG_IMAGE_MODEL'),
    'image_reserve_micro' => (int) env('MODEL_CATALOG_IMAGE_RESERVE_MICRO', 250000),
    'probe_daily_micro' => (int) env('MODEL_CATALOG_PROBE_DAILY_MICRO', 5000000),
    'artwork_daily_micro' => (int) env('MODEL_CATALOG_ARTWORK_DAILY_MICRO', 2000000),
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
