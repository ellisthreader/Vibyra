<?php

return [
    'enabled' => env('VIBES_ENABLED', false),
    'purchases_enabled' => env('VIBES_PURCHASES_ENABLED', false),
    'trial_credits' => 100,
    'trial_chats' => 2,
    'trial_chat_credits' => 50,
    'micro_usd_per_credit' => 10000,
    'daily_micro_usd_limit' => (int) env('VIBES_DAILY_MICRO_USD_LIMIT', 25000000),
    'max_output_tokens' => 2048,
    'queue_connection' => env('VIBES_QUEUE_CONNECTION', 'database'),
    'apple_bundle_id' => env('APPLE_IAP_BUNDLE_ID', 'app.vibyra.mobile'),
    'apple_environment' => env('VIBES_APPLE_ENVIRONMENT', 'Production'),
    'apple_issuer' => env('APPLE_IAP_ISSUER_ID'),
    'apple_key_id' => env('APPLE_IAP_KEY_ID'),
    'apple_private_key' => env('APPLE_IAP_PRIVATE_KEY'),
    'products' => [
        'app.vibyra.vibes.starter.monthly' => ['plan' => 'starter', 'credits' => 350, 'pence' => 2000, 'kind' => 'subscription'],
        'app.vibyra.vibes.builder.monthly' => ['plan' => 'builder', 'credits' => 1000, 'pence' => 4900, 'kind' => 'subscription'],
        'app.vibyra.vibes.pro.monthly' => ['plan' => 'pro', 'credits' => 2000, 'pence' => 9900, 'kind' => 'subscription'],
        'app.vibyra.vibes.topup.500' => ['plan' => null, 'credits' => 500, 'pence' => 2000, 'kind' => 'topup'],
    ],

    // Plan entitlements. Every value here is enforced in backend source; the
    // phone renders wording from these numbers and never invents its own.
    // 'maxProjects' => null means no limit. 'remoteAccess' only becomes a real
    // capability once 'remote_access_live' is true and a qualified relay ships.
    'plans' => [
        'free' => ['maxProjects' => 1, 'concurrentReplies' => 1, 'fullCatalogue' => false, 'remoteAccess' => false],
        'starter' => ['maxProjects' => 3, 'concurrentReplies' => 1, 'fullCatalogue' => false, 'remoteAccess' => false],
        'builder' => ['maxProjects' => 10, 'concurrentReplies' => 2, 'fullCatalogue' => false, 'remoteAccess' => false],
        'pro' => ['maxProjects' => null, 'concurrentReplies' => 3, 'fullCatalogue' => true, 'remoteAccess' => true],
    ],

    // The internet-reachable relay is not qualified yet. While this is false the
    // phone must present remote access as included but not yet available.
    'remote_access_live' => env('VIBES_REMOTE_ACCESS_LIVE', false),

    // Upper bound on models returned to a full-catalogue account, so one stale
    // OpenRouter sync cannot push an unbounded list to the phone.
    'catalogue_limit' => (int) env('VIBES_CATALOGUE_LIMIT', 400),
    // Curated models. 'tier' and 'released' drive the phone's picker sections
    // ("Best for building", "Newest", ...) and its "New" badge; nothing else reads
    // them. Catalogue models from the live OpenRouter snapshot carry no tier and
    // the phone groups them separately.
    'models' => [
        // Best for building.
        'openai/gpt-6-astra' => ['family' => 'OpenAI', 'name' => 'GPT-6 Astra', 'trial' => false,
            'tier' => 'best', 'released' => '2026-07-14', 'blurb' => 'Deepest reasoning for hard, multi-file work.'],
        'anthropic/claude-opus-5' => ['family' => 'Claude', 'name' => 'Opus 5', 'trial' => false,
            'tier' => 'best', 'released' => '2026-05-20', 'blurb' => 'Long, careful refactors and large codebases.'],
        'anthropic/claude-sonnet-5' => ['family' => 'Claude', 'name' => 'Sonnet 5', 'trial' => false,
            'tier' => 'best', 'released' => '2026-02-11', 'blurb' => 'Strong everyday coding with quick replies.'],
        'google/gemini-3.8-pro' => ['family' => 'Gemini', 'name' => 'Gemini 3.8 Pro', 'trial' => false,
            'tier' => 'best', 'released' => '2026-04-02', 'blurb' => 'Huge context for whole-project questions.'],
        'x-ai/grok-4.6' => ['family' => 'Grok', 'name' => 'Grok 4.6', 'trial' => false,
            'tier' => 'best', 'released' => '2026-03-05', 'blurb' => 'Direct answers and confident debugging.'],
        // Newest.
        'openai/gpt-5.6-luna' => ['family' => 'OpenAI', 'name' => 'GPT-5.6 Luna', 'trial' => true,
            'tier' => 'newest', 'released' => '2026-08-19', 'blurb' => 'Balanced all-rounder, included in your trial.'],
        'deepseek/deepseek-v4-pro-0813' => ['family' => 'DeepSeek', 'name' => 'DeepSeek V4 Pro', 'trial' => false,
            'tier' => 'newest', 'released' => '2026-08-13', 'blurb' => 'Deliberate planning before it writes code.'],
        'moonshotai/kimi-k2.7-code' => ['family' => 'Kimi', 'name' => 'Kimi K2.7 Code', 'trial' => false,
            'tier' => 'newest', 'released' => '2026-08-06', 'blurb' => 'Tuned for editing existing source files.'],
        'minimax/minimax-m3' => ['family' => 'MiniMax', 'name' => 'MiniMax M3', 'trial' => true,
            'tier' => 'newest', 'released' => '2026-07-28', 'blurb' => 'Fresh open model with a wide context.'],
        'z-ai/glm-5' => ['family' => 'GLM', 'name' => 'GLM-5', 'trial' => false,
            'tier' => 'newest', 'released' => '2026-06-30', 'blurb' => 'Reliable tool use on structured tasks.'],
        'mistralai/devstral-2512' => ['family' => 'Mistral', 'name' => 'Devstral', 'trial' => true,
            'tier' => 'newest', 'released' => '2026-06-11', 'blurb' => 'Built for repository-scale code changes.'],
        // Fast and light.
        'google/gemini-3.8-flash' => ['family' => 'Gemini', 'name' => 'Gemini 3.8 Flash', 'trial' => true,
            'tier' => 'fast', 'released' => '2026-04-02', 'blurb' => 'Very quick replies for small changes.'],
        'qwen/qwen3.8-flash' => ['family' => 'Qwen', 'name' => 'Qwen3.8 Flash', 'trial' => true,
            'tier' => 'fast', 'released' => '2026-05-15', 'blurb' => 'The default behind Auto: fast and cheap.'],
        'anthropic/claude-haiku-4.5' => ['family' => 'Claude', 'name' => 'Haiku 4.5', 'trial' => true,
            'tier' => 'fast', 'released' => '2025-10-01', 'blurb' => 'Snappy Claude for short, focused edits.'],
        'x-ai/grok-4.6-fast' => ['family' => 'Grok', 'name' => 'Grok 4.6 Fast', 'trial' => true,
            'tier' => 'fast', 'released' => '2026-03-05', 'blurb' => 'Grok speed for quick back-and-forth.'],
        'openai/gpt-5.6-luna-mini' => ['family' => 'OpenAI', 'name' => 'GPT-5.6 Luna Mini', 'trial' => true,
            'tier' => 'fast', 'released' => '2026-08-19', 'blurb' => 'Smaller Luna for everyday questions.'],
        // Great value.
        'meta-llama/llama-4-maverick' => ['family' => 'Llama', 'name' => 'Llama 4 Maverick', 'trial' => true,
            'tier' => 'value', 'released' => '2025-04-05', 'blurb' => 'Open weights, generous context, low cost.'],
        'deepseek/deepseek-chat-v3.1' => ['family' => 'DeepSeek', 'name' => 'DeepSeek V3.1', 'trial' => true,
            'tier' => 'value', 'released' => '2025-08-21', 'blurb' => 'Capable coding for very few Vibes.'],
        'qwen/qwen3-coder' => ['family' => 'Qwen', 'name' => 'Qwen3 Coder', 'trial' => true,
            'tier' => 'value', 'released' => '2025-07-23', 'blurb' => 'Code-first open model on a budget.'],
        'openai/gpt-oss-120b' => ['family' => 'OpenAI', 'name' => 'GPT-OSS 120B', 'trial' => true,
            'tier' => 'value', 'released' => '2025-08-05', 'blurb' => 'OpenAI open weights at open pricing.'],
        'moonshotai/kimi-k2' => ['family' => 'Kimi', 'name' => 'Kimi K2', 'trial' => true,
            'tier' => 'value', 'released' => '2025-07-11', 'blurb' => 'Large open model, small bill.'],
        'mistralai/mistral-small-3.2-24b-instruct' => ['family' => 'Mistral', 'name' => 'Mistral Small 3.2', 'trial' => true,
            'tier' => 'value', 'released' => '2025-06-20', 'blurb' => 'Light, cheap and dependable.'],
    ],
    'auto_model' => 'qwen/qwen3.8-flash',
];
