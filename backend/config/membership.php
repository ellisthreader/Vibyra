<?php

// Immutable offer version: never reuse a legacy SKU or change a sold allowance.
return [
    'new_accounts_from' => env('MEMBERSHIP_NEW_ACCOUNTS_FROM'),
    'stripe_environment' => env('MEMBERSHIP_STRIPE_ENVIRONMENT', 'live'),
    'stripe_portal_configuration' => env('STRIPE_MEMBERSHIP_PORTAL_CONFIGURATION'),
    'enabled' => env('MEMBERSHIP_V2_ENABLED', false),
    'stripe_enabled' => env('MEMBERSHIP_STRIPE_ENABLED', false),
    'apple_enabled' => env('MEMBERSHIP_APPLE_ENABLED', false),
    'free_enabled' => env('MEMBERSHIP_FREE_ENABLED', false),
    'free_accounts' => (int) env('MEMBERSHIP_FREE_ACCOUNTS', 2000),
    'free_tokens' => 10,
    'free_daily_micro_limit' => (int) env('MEMBERSHIP_FREE_DAILY_MICRO_USD_LIMIT', 10000000),
    'version' => '2026-09-27',
    'offers' => [
        'pro_monthly' => ['kind' => 'subscription', 'plan' => 'pro_v2', 'credits' => 300, 'pence' => 1999, 'interval' => 'month',
            'apple' => 'app.vibyra.membership.pro.monthly.v2', 'stripe' => env('STRIPE_MEMBERSHIP_PRO_MONTHLY')],
        // Website only until an App Store product exists: a year of tokens (12 × 300) per paid annual invoice.
        'pro_annual' => ['kind' => 'subscription', 'plan' => 'pro_v2', 'credits' => 3600, 'pence' => 19999, 'interval' => 'year',
            'apple' => null, 'stripe' => env('STRIPE_MEMBERSHIP_PRO_ANNUAL')],
        'tokens_80' => ['kind' => 'topup', 'plan' => null, 'credits' => 80, 'pence' => 499,
            'apple' => 'app.vibyra.tokens.80.v2', 'stripe' => env('STRIPE_MEMBERSHIP_TOKENS_80')],
        'tokens_200' => ['kind' => 'topup', 'plan' => null, 'credits' => 200, 'pence' => 999,
            'apple' => 'app.vibyra.tokens.200.v2', 'stripe' => env('STRIPE_MEMBERSHIP_TOKENS_200')],
        'tokens_450' => ['kind' => 'topup', 'plan' => null, 'credits' => 450, 'pence' => 1999,
            'apple' => 'app.vibyra.tokens.450.v2', 'stripe' => env('STRIPE_MEMBERSHIP_TOKENS_450')],
    ],
];
