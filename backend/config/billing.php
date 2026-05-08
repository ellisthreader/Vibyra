<?php

return [
    'plans' => [
        'free' => [
            'label' => 'Free',
            'monthly_credits' => 50,
            'annual_credits' => 50,
            'monthly_price_pence' => 0,
            'annual_price_pence' => 0,
            'usd_cap_per_month' => 0.50,
            'allowed_tiers' => ['free', 'budget'],
            'daily_credit_cap' => 5,
            'rate_per_minute' => 6,
            'rate_per_hour' => 60,
            'max_concurrent_agents' => 0,
            'max_active_projects' => 1,
            'context_token_cap' => 16000,
        ],
        'starter' => [
            'label' => 'Starter',
            'monthly_credits' => 500,
            'annual_credits' => 550,
            'monthly_price_pence' => 1900,
            'annual_price_pence' => 19000,
            'usd_cap_per_month' => 5.00,
            'allowed_tiers' => ['free', 'budget', 'balanced', 'premium'],
            'daily_credit_cap' => 100,
            'rate_per_minute' => 12,
            'rate_per_hour' => 200,
            'max_concurrent_agents' => 1,
            'max_active_projects' => 1,
            'context_token_cap' => 32000,
        ],
        'builder' => [
            'label' => 'Builder',
            'monthly_credits' => 1800,
            'annual_credits' => 1980,
            'monthly_price_pence' => 4900,
            'annual_price_pence' => 49000,
            'usd_cap_per_month' => 18.00,
            'allowed_tiers' => ['free', 'budget', 'balanced', 'premium'],
            'daily_credit_cap' => 360,
            'rate_per_minute' => 20,
            'rate_per_hour' => 600,
            'max_concurrent_agents' => 2,
            'max_active_projects' => 3,
            'context_token_cap' => 100000,
        ],
        'pro' => [
            'label' => 'Pro',
            'monthly_credits' => 4500,
            'annual_credits' => 4950,
            'monthly_price_pence' => 9900,
            'annual_price_pence' => 99000,
            'usd_cap_per_month' => 45.00,
            'allowed_tiers' => ['free', 'budget', 'balanced', 'premium'],
            'daily_credit_cap' => 900,
            'rate_per_minute' => 40,
            'rate_per_hour' => 1500,
            'max_concurrent_agents' => 4,
            'max_active_projects' => 10,
            'context_token_cap' => 200000,
        ],
    ],

    // Each entry: tier, multiplier (markup applied to USD cost when computing credits),
    // and the OpenRouter slug. credits = openrouter_usd_cost * 100 * multiplier.
    'models' => [
        'auto' => ['slug' => 'openai/gpt-4o-mini', 'tier' => 'budget', 'multiplier' => 1.0],
        'gpt-5.5' => ['slug' => 'openai/gpt-4o', 'tier' => 'premium', 'multiplier' => 1.4],
        'gpt-5.4' => ['slug' => 'openai/gpt-4o', 'tier' => 'balanced', 'multiplier' => 1.15],
        'gpt-5.4-mini' => ['slug' => 'openai/gpt-4o-mini', 'tier' => 'budget', 'multiplier' => 1.0],
        'gpt-5.4-nano' => ['slug' => 'openai/gpt-4o-mini', 'tier' => 'budget', 'multiplier' => 1.0],
        'gpt-5-codex' => ['slug' => 'openai/gpt-4.1', 'tier' => 'premium', 'multiplier' => 1.4],
        'claude-opus-4' => ['slug' => 'anthropic/claude-opus-4', 'tier' => 'premium', 'multiplier' => 1.5],
        'claude-sonnet-4' => ['slug' => 'anthropic/claude-sonnet-4', 'tier' => 'balanced', 'multiplier' => 1.15],
        'claude-3-5-haiku' => ['slug' => 'anthropic/claude-3.5-haiku', 'tier' => 'budget', 'multiplier' => 1.0],
        'gemini-2.5-pro' => ['slug' => 'google/gemini-2.5-pro', 'tier' => 'premium', 'multiplier' => 1.35],
        'gemini-2.5-flash' => ['slug' => 'google/gemini-2.5-flash', 'tier' => 'budget', 'multiplier' => 1.0],
        'gemini-2.0-flash' => ['slug' => 'google/gemini-2.0-flash-001', 'tier' => 'budget', 'multiplier' => 1.0],
    ],

    // OpenRouter input/output USD per 1M tokens. Used when the API response
    // is missing usage details so we can fall back to a token-count estimate.
    // Numbers are conservative (slightly above real list) so estimates over-charge,
    // not under-charge.
    'fallback_pricing_per_million_usd' => [
        'openai/gpt-4o' => ['input' => 5.00, 'output' => 15.00],
        'openai/gpt-4o-mini' => ['input' => 0.20, 'output' => 0.80],
        'openai/gpt-4.1' => ['input' => 3.00, 'output' => 12.00],
        'anthropic/claude-opus-4' => ['input' => 15.00, 'output' => 75.00],
        'anthropic/claude-sonnet-4' => ['input' => 3.00, 'output' => 15.00],
        'anthropic/claude-3.5-haiku' => ['input' => 0.80, 'output' => 4.00],
        'google/gemini-2.5-pro' => ['input' => 3.50, 'output' => 10.50],
        'google/gemini-2.5-flash' => ['input' => 0.35, 'output' => 1.05],
        'google/gemini-2.0-flash-001' => ['input' => 0.10, 'output' => 0.40],
        'default' => ['input' => 1.00, 'output' => 3.00],
    ],

    // Surcharge multipliers stacked on top of the model multiplier.
    'surcharges' => [
        'long_context_threshold_tokens' => 100000,
        'long_context_multiplier' => 1.25,
        'agent_mode_multiplier' => 1.20,
    ],

    // Minimum credits charged per request (avoid rounding to zero on tiny calls).
    'minimum_credit_charge' => 1,

    // One-time top-up SKUs. credits granted, gbp pence price, Stripe price id env var.
    'topups' => [
        'topup_500' => [
            'credits' => 500,
            'price_pence' => 800,
            'stripe_price_env' => 'STRIPE_PRICE_TOPUP_500',
            'apple_product_id' => 'app.vibyra.topup.500',
            'google_product_id' => 'app.vibyra.topup.500',
        ],
        'topup_1500' => [
            'credits' => 1500,
            'price_pence' => 2000,
            'stripe_price_env' => 'STRIPE_PRICE_TOPUP_1500',
            'apple_product_id' => 'app.vibyra.topup.1500',
            'google_product_id' => 'app.vibyra.topup.1500',
        ],
        'topup_4000' => [
            'credits' => 4000,
            'price_pence' => 4500,
            'stripe_price_env' => 'STRIPE_PRICE_TOPUP_4000',
            'apple_product_id' => 'app.vibyra.topup.4000',
            'google_product_id' => 'app.vibyra.topup.4000',
        ],
    ],

    // Stripe price ids by plan + cycle. Read from env so live/test keys are swappable.
    'stripe_prices' => [
        'starter' => [
            'monthly' => env('STRIPE_PRICE_STARTER_MONTHLY'),
            'annual' => env('STRIPE_PRICE_STARTER_ANNUAL'),
        ],
        'builder' => [
            'monthly' => env('STRIPE_PRICE_BUILDER_MONTHLY'),
            'annual' => env('STRIPE_PRICE_BUILDER_ANNUAL'),
        ],
        'pro' => [
            'monthly' => env('STRIPE_PRICE_PRO_MONTHLY'),
            'annual' => env('STRIPE_PRICE_PRO_ANNUAL'),
        ],
    ],

    // Map IAP product ids to plan + billing cycle, so receipt validators can
    // resolve what to grant.
    'iap_products' => [
        'app.vibyra.membership.starter.monthly' => ['kind' => 'subscription', 'plan' => 'starter', 'cycle' => 'monthly'],
        'app.vibyra.membership.starter.annual' => ['kind' => 'subscription', 'plan' => 'starter', 'cycle' => 'annual'],
        'app.vibyra.membership.builder.monthly' => ['kind' => 'subscription', 'plan' => 'builder', 'cycle' => 'monthly'],
        'app.vibyra.membership.builder.annual' => ['kind' => 'subscription', 'plan' => 'builder', 'cycle' => 'annual'],
        'app.vibyra.membership.pro.monthly' => ['kind' => 'subscription', 'plan' => 'pro', 'cycle' => 'monthly'],
        'app.vibyra.membership.pro.annual' => ['kind' => 'subscription', 'plan' => 'pro', 'cycle' => 'annual'],
        'app.vibyra.topup.500' => ['kind' => 'topup', 'topup' => 'topup_500'],
        'app.vibyra.topup.1500' => ['kind' => 'topup', 'topup' => 'topup_1500'],
        'app.vibyra.topup.4000' => ['kind' => 'topup', 'topup' => 'topup_4000'],
    ],
];
