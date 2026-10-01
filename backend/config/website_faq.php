<?php

return [
    // A shared durable store is required for cross-worker limits. Never fall back to array in production.
    'cache_store' => env('WEBSITE_FAQ_CACHE_STORE', 'database'),
    'daily_calls' => (int) env('WEBSITE_FAQ_DAILY_CALLS', 100),
    'concurrent_calls' => (int) env('WEBSITE_FAQ_CONCURRENT_CALLS', 2),
    // Conservative reservations, not measured provider charges; failed calls retain their reservation.
    'call_reserve_micro_usd' => (int) env('WEBSITE_FAQ_CALL_RESERVE_MICRO_USD', 100000),
    'daily_budget_micro_usd' => (int) env('WEBSITE_FAQ_DAILY_BUDGET_MICRO_USD', 1000000),
];
