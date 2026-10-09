<?php

return [
    'funded_terminals_enabled' => env('VIBYRA_FUNDED_TERMINALS_ENABLED', false),

    // Free vs Pro workspace limits (terminals at once, safe-mode worktrees, Agents).
    // Off, every plan reports them unlimited, so clients and the server can ship
    // before the switch. The server enforces Agents; nothing else here reads it yet.
    'plan_limits_enabled' => env('VIBYRA_PLAN_LIMITS_ENABLED', false),
    'enabled' => env('VIBES_ENABLED', false),
    // Whether Vibes can be tried with no account. Off by default: a guest grant
    // is real money, and `devicecheck_*` below is what keeps one device to one.
    'guests_enabled' => env('VIBES_GUESTS_ENABLED', false),
    'purchases_enabled' => env('VIBES_PURCHASES_ENABLED', false),
    'attachments_disk' => env('VIBES_ATTACHMENTS_DISK', 'local'),
    // The free trial, and the only free spend Vibyra ever funds. Three Vibes buys
    // about three replies on a cheap model, which is a taste of the product rather
    // than a usable amount of it. Every number here is read at runtime - `Wallet`,
    // `Quotes` and `Turns` keep no copy - so the trial is retuned here and nowhere
    // else, including the wording the phone renders from the wallet payload.
    //
    // What a free account can ever cost is `trial_credits` x `micro_usd_per_credit`
    // plus the OpenRouter funding fee, once, and never again: $0.03 at these
    // numbers. `vibyra:audit-vibes-economics` prints that figure from this config.
    'trial_credits' => 3,
    'trial_chats' => 2,
    'trial_chat_credits' => 3,
    'micro_usd_per_credit' => 10000,
    'daily_micro_usd_limit' => (int) env('VIBES_DAILY_MICRO_USD_LIMIT', 25000000),
    'max_output_tokens' => 2048,
    // Token-terminal models a real terminal message could not reach on 2026-10-06, so the picker
    // never offers a choice that fails. No host serves the first fourteen with project tools within
    // the listed price; OpenRouter refuses the rest for this account (agentic-harness-only free
    // tiers, audio models, provider 400s, Meta terms not accepted). Re-test before removing one.
    // The Vibyra-token terminal menu, curated by the owner on 2026-10-06: each lab's current main and
    // coding models only (no o-series, mini/nano tiers, gpt-oss, image models or older generations).
    // New launches and Auto use only these; open terminals keep their model. Add a new main model
    // here when it ships. VIBES_TERMINAL_MODELS (comma-separated) overrides it; empty offers all.
    'terminal_models' => env('VIBES_TERMINAL_MODELS') !== null
        ? array_values(array_filter(explode(',', (string) env('VIBES_TERMINAL_MODELS'))))
        : ['openai/gpt-6.1-sol', 'openai/gpt-6-astra', 'openai/gpt-6-luna', 'anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5', 'anthropic/claude-fable-5.1', 'google/gemini-3.1-pro-preview', 'google/gemini-3.8-flash', 'x-ai/grok-4.7', 'deepseek/deepseek-v4-pro-0813', 'deepseek/deepseek-v4.1-flash', 'qwen/qwen3.8-max-prime', 'qwen/qwen3.8-flash', 'z-ai/glm-5.3', 'z-ai/glm-5.3-prime', 'moonshotai/kimi-k3', 'bytedance-seed/seed-2.0-code'],
    'terminal_unavailable' => [
        'mistralai/mistral-nemo', 'meta-llama/llama-3.1-8b-instruct', 'google/gemma-4-31b-it',
        'meta-llama/llama-4-scout', 'qwen/qwen3-14b', 'xiaomi/mimo-v2.5-pro', 'deepseek/deepseek-r1-0528',
        'minimax/minimax-m1', 'sao10k/l3.1-euryale-70b', 'openai/gpt-5.2-chat', 'sakana/fugu-max',
        'amazon/nova-premier-v1', 'sakana/fugu-ultra', 'sakana/fugu-ultra-v2',
        'thinkingmachines/inkling-small:free', 'thinkingmachines/inkling:free', 'openai/gpt-audio-mini',
        'openai/gpt-audio', 'kwaipilot/kat-coder-pro-v2.5', 'meta/muse-spark-1.1', 'meta/muse-spark-1.2',
        'meta/muse-spark-1.3',
    ],
    'queue_connection' => env('VIBES_QUEUE_CONNECTION', 'database'),
    'apple_bundle_id' => env('APPLE_IAP_BUNDLE_ID', 'app.vibyra.mobile'),
    'apple_environment' => env('VIBES_APPLE_ENVIRONMENT', 'Production'),
    // Development-signed iPhones use sandbox. Only these modern account IDs may test on this server.
    'apple_sandbox_user_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('APPLE_IAP_SANDBOX_USER_IDS', ''))))),
    'apple_issuer' => env('APPLE_IAP_ISSUER_ID'),
    'apple_key_id' => env('APPLE_IAP_KEY_ID'),
    'apple_private_key' => env('APPLE_IAP_PRIVATE_KEY'),

    // Apple DeviceCheck. Two bits per physical device that Apple stores, which
    // survive deleting the app, restoring a backup and wiping everything we own.
    // bit0 means "this device has had its guest Vibes"; bit1 is untouched.
    //
    // The team id is the Apple Developer team, not the App Store Connect issuer
    // used above: DeviceCheck signs with its own key and its own `iss`.
    'devicecheck_key_id' => env('APPLE_DEVICECHECK_KEY_ID'),
    'devicecheck_private_key' => env('APPLE_DEVICECHECK_PRIVATE_KEY'),
    'devicecheck_team_id' => env('APPLE_TEAM_ID'),
    'devicecheck_environment' => env('VIBES_DEVICECHECK_ENVIRONMENT', 'production'),
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
    //
    // 'fullCatalogue' is true on every plan: the whole OpenRouter catalogue is a
    // menu, not something to buy. It stays in the entitlement set because the
    // wallet publishes it and the phone words the plan cards from it. What a plan
    // still decides is what trial credit may fund, which Catalog::resolve enforces
    // by marking every uncurated model 'trial' => false.
    //
    // 'sessionCredits' and 'weekCredits' are the two rolling usage windows, sized
    // below. They bound the *rate* Vibes leave the account, never the amount: a
    // balance is still spent in full, just not all in one afternoon.
    //
    // Builder and Pro are sold on the phone as Pro 10× and Pro 20×, and the two sizes
    // differ only in Vibes: the monthly allowance and the two windows it sizes. Every
    // other entitlement is Pro's on both, so the upgrade page can switch sizes and
    // change nothing but the figures.
    'plans' => [
        // maxTerminals counts every running terminal (agent or shell), so typing an
        // agent CLI into a plain shell is not a way round it. Legacy paid plans keep
        // Pro's workspace so nobody who paid loses anything.
        'pro_v2' => ['maxProjects' => null, 'concurrentReplies' => 3, 'fullCatalogue' => true, 'remoteAccess' => true,
            'sessionCredits' => 400, 'weekCredits' => 1000, 'maxTerminals' => null, 'safeWorktrees' => true, 'agents' => true,
            'preview' => true, 'review' => true,
            // Included cloud-computer hours per membership month; the owner sets it, 0 promises nothing.
            'cloudHours' => (float) env('CLOUD_INCLUDED_HOURS_PRO', 0)],
        // Free is one project (desktop and Vibyra AI alike); Preview and Review are Pro.
        'free' => ['maxProjects' => 1, 'concurrentReplies' => 1, 'fullCatalogue' => true, 'remoteAccess' => false,
            'sessionCredits' => 60, 'weekCredits' => 150, 'maxTerminals' => 2, 'safeWorktrees' => false, 'agents' => false,
            'preview' => false, 'review' => false, 'cloudHours' => 0],
        'starter' => ['maxProjects' => 3, 'concurrentReplies' => 1, 'fullCatalogue' => true, 'remoteAccess' => false,
            'sessionCredits' => 70, 'weekCredits' => 175, 'maxTerminals' => null, 'safeWorktrees' => true, 'agents' => true,
            'preview' => true, 'review' => true],
        'builder' => ['maxProjects' => null, 'concurrentReplies' => 3, 'fullCatalogue' => true, 'remoteAccess' => true,
            'sessionCredits' => 200, 'weekCredits' => 500, 'maxTerminals' => null, 'safeWorktrees' => true, 'agents' => true,
            'preview' => true, 'review' => true],
        'pro' => ['maxProjects' => null, 'concurrentReplies' => 3, 'fullCatalogue' => true, 'remoteAccess' => true,
            'sessionCredits' => 400, 'weekCredits' => 1000, 'maxTerminals' => null, 'safeWorktrees' => true, 'agents' => true,
            'preview' => true, 'review' => true],
    ],

    // The two rolling usage windows, in the units `UsageWindows` measures them in.
    // Rolling, not calendar: spend ages out continuously, so there is no midnight
    // everyone queues for and no reset bookkeeping to drift.
    //
    // Why they exist, given that a balance already bounds what an account can ever
    // spend and `vibyra:audit-vibes-economics` proves every offer clears its
    // contribution floor at full redemption. It is the *rate* they bound:
    //
    //  - Vibes roll over, and carryover is funded at grant time, so a subscriber
    //    who is quiet for six months holds six months of provider cost. Nothing
    //    stopped that landing in one afternoon.
    //  - `daily_micro_usd_limit` is one shared per-day budget for the whole
    //    platform. One account draining a banked balance used to be able to spend
    //    it, and every other account then met "AI is at capacity" - a refund and
    //    churn event caused by someone else's burst.
    //
    // Sizing rule, so these can be retuned without re-deriving it: the week is half
    // the plan's monthly allowance, and the session is 40% of the week. A month is
    // 4.35 weeks, so the week cap still permits ~2.2x the monthly grant per month -
    // wide enough that a normal month is never withheld and banked Vibes can be
    // burned down, tight enough that no single account can take the day's budget.
    // At these numbers hitting either window means spending half a month's Vibes in
    // a week, which is a burst, not a workday. Free is not the trial's three Vibes:
    // it is what a lapsed subscriber's paid, never-reclaimed balance drains at.
    'limits' => [
        'session_hours' => (int) env('VIBES_SESSION_WINDOW_HOURS', 5),
        'week_days' => (int) env('VIBES_WEEK_WINDOW_DAYS', 7),
    ],

    // Whether the phone may connect through Vibyra Cloud (config/remote.php).
    // Follows the relay being configured, so a deployment with a relay address
    // and secret is live; set it to false to hold remote access back on purpose,
    // in which case the phone presents it as included but not yet available.
    'remote_access_live' => (bool) env('VIBES_REMOTE_ACCESS_LIVE', env('VIBYRA_RELAY_URL') && env('VIBYRA_RELAY_SECRET')),

    // Upper bound on models returned to a full-catalogue account, so one stale
    // OpenRouter sync cannot push an unbounded list to the phone.
    'catalogue_limit' => (int) env('VIBES_CATALOGUE_LIMIT', 400),

    // What a free account may spend its trial credit on. The line is a price, not
    // a hand-set flag per model, so it cannot drift as providers repost prices:
    // a curated model at or under both ceilings is included, everything else needs
    // purchased Vibes. Uncurated catalogue models are never trial-funded whatever
    // they cost, because they carry no tier and no written blurb.
    //
    // At these ceilings every curated model is included except the four flagships:
    // Grok 4.6 ($6/M out), Sonnet 5 ($10), Opus 5 ($25) and GPT-6 Astra ($50).
    'free_tier' => [
        'input_per_million' => (float) env('VIBES_FREE_INPUT_PER_MILLION', 1.00),
        'output_per_million' => (float) env('VIBES_FREE_OUTPUT_PER_MILLION', 5.00),
    ],

    // Models included for free regardless of price or curation. Empty, and meant to
    // stay empty: it is an override, not a place to park flagships. An entry here
    // skips the price ceiling above, so one line is enough to turn the trial from a
    // taste of a cheap model into a free sample of a dear one - which is what it did
    // while it held GPT-5.5 at $30/M out, dearer than Opus 5.
    //
    // A three-Vibe trial prices the flagships out by itself: Opus 5 quotes six Vibes
    // for a single turn and Astra eleven, so neither can be sent at all. Leaving them
    // off this list is what keeps the picker honest about that, rather than showing
    // them as included and refusing them at send.
    'free_extra' => [],
    // Curated models. 'tier' and 'released' drive the phone's picker sections
    // ("Best for building", "Newest", ...) and its "New" badge; nothing else reads
    // them. Catalogue models from the live OpenRouter snapshot carry no tier and
    // the phone groups them separately.
    'models' => [
        'openai/gpt-6-sol' => ['family' => 'OpenAI', 'name' => 'GPT-6 Sol', 'trial' => false,
            'tier' => 'best', 'released' => '2026-09-22', 'blurb' => 'Coding and reasoning for complex projects.'],
        'openai/gpt-6-luna' => ['family' => 'OpenAI', 'name' => 'GPT-6 Luna', 'trial' => false,
            'tier' => 'fast', 'released' => '2026-09-22', 'blurb' => 'Fast, focused coding and everyday tasks.'],
        'anthropic/claude-opus-5.5' => ['family' => 'Claude', 'name' => 'Claude Opus 5.5', 'trial' => false,
            'tier' => 'best', 'released' => '2026-09-22', 'blurb' => 'Long-running coding and careful project changes.'],
        // Best for building.
        'openai/gpt-6-astra' => ['family' => 'OpenAI', 'name' => 'GPT-6 Astra', 'trial' => false,
            'tier' => 'best', 'released' => '2026-09-03', 'blurb' => 'Deepest reasoning for hard, multi-file work.'],
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
