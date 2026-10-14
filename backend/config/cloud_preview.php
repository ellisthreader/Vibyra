<?php

return [
    'enabled' => (bool) env('CLOUD_PREVIEW_ENABLED', false),
    'native_enabled' => (bool) env('CLOUD_PREVIEW_NATIVE_ENABLED', false),
    'trial_enabled' => (bool) env('CLOUD_PREVIEW_TRIAL_ENABLED', false),
    // The launch gate is deliberately separate from source capability.
    'economics_verified' => (bool) env('CLOUD_PREVIEW_ECONOMICS_VERIFIED', false),
    'daily_micro_limit' => (int) env('CLOUD_PREVIEW_DAILY_MICRO_LIMIT', 25000000),
    'monthly_micro_limit' => (int) env('CLOUD_PREVIEW_MONTHLY_MICRO_LIMIT', 500000000),
    'trial_day_micro_limit' => (int) env('CLOUD_PREVIEW_TRIAL_DAY_MICRO_LIMIT', 5000000),
    'trial_month_micro_limit' => (int) env('CLOUD_PREVIEW_TRIAL_MONTH_MICRO_LIMIT', 100000000),
    'free_running_limit' => 2,
    'starts_per_account_day' => 3,
    'starts_per_account_month' => 30,
    'startup_exposure_micro' => (int) env('CLOUD_PREVIEW_STARTUP_EXPOSURE_MICRO', 0),
    'minimum_margin' => 0.4,
    // All-in hourly profiles must include compute, rootfs, snapshots, bounded
    // egress/relay and a measured startup/failure allowance. No guessed defaults.
    'economics' => [
        'reviewed_at' => env('CLOUD_PREVIEW_ECONOMICS_REVIEWED_AT'),
        'usd_per_gbp' => (float) env('CLOUD_PREVIEW_USD_PER_GBP', 0),
        'vat_fraction' => (float) env('CLOUD_PREVIEW_VAT_FRACTION', 0.2),
        'fee_fraction' => (float) env('CLOUD_PREVIEW_FEE_FRACTION', 0.3),
        'fee_fixed_micro' => (int) env('CLOUD_PREVIEW_FEE_FIXED_MICRO', 0),
        'fixed_micro_month' => (int) env('CLOUD_PREVIEW_FIXED_MICRO_MONTH', 0),
        // Lowest verified net receipt across supported currencies/store tiers.
        'net_micro_per_offer' => [
            'pro_monthly' => (int) env('CLOUD_PREVIEW_NET_PRO_MONTHLY_MICRO', 0),
            'pro_annual' => (int) env('CLOUD_PREVIEW_NET_PRO_ANNUAL_MICRO', 0),
            'tokens_80' => (int) env('CLOUD_PREVIEW_NET_TOKENS_80_MICRO', 0),
            'tokens_200' => (int) env('CLOUD_PREVIEW_NET_TOKENS_200_MICRO', 0),
            'tokens_450' => (int) env('CLOUD_PREVIEW_NET_TOKENS_450_MICRO', 0),
        ],
        'ai_micro_per_token' => (int) env('CLOUD_PREVIEW_AI_MICRO_PER_TOKEN', 0),
    ],
    'tariff_version' => 'cloud-preview-2026-10-06-v1',
    'default_budget_units' => 100000,
    'trial_seconds' => 600,
    'egress_micro_per_gib' => (int) env('CLOUD_PREVIEW_EGRESS_MICRO_PER_GIB', 0),
    'activity_seconds' => 30,
    'account_egress_bytes_day' => 10737418240,
    'global_egress_bytes_day' => 107374182400,
    'profiles' => [
        'standard' => ['cpus' => 2, 'memory_mb' => 4096, 'units_per_hour' => 250000,
            'provider_micro_per_hour' => (int) env('CLOUD_PREVIEW_STANDARD_PROVIDER_MICRO_PER_HOUR', 0)],
        'desktop' => ['cpus' => 2, 'memory_mb' => 8192, 'units_per_hour' => 350000,
            'provider_micro_per_hour' => (int) env('CLOUD_PREVIEW_DESKTOP_PROVIDER_MICRO_PER_HOUR', 0)],
        'power' => ['cpus' => 4, 'memory_mb' => 8192, 'units_per_hour' => 500000,
            'provider_micro_per_hour' => (int) env('CLOUD_PREVIEW_POWER_PROVIDER_MICRO_PER_HOUR', 0)],
    ],
];
