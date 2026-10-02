<?php

return [
    // The owner credential is services.openai.key. No client can supply a key,
    // upstream URL, model or price. Enable after migration and acceptance.
    'enabled' => (bool) env('VIBYRA_ASSISTANT_ENABLED', false),
    // Funded requests are bounded by the wallet; zero disables the optional total-spend ceiling.
    'month_micro_usd' => (int) env('VIBYRA_ASSISTANT_MONTH_MICRO_USD', 0),
    // Refunded unknown provider outcomes and all in-flight calls still have a separate risk budget.
    'uncertain_month_micro_usd' => (int) env('VIBYRA_ASSISTANT_UNCERTAIN_MONTH_MICRO_USD', 50_000_000),
    'user_minute_calls' => 20,
    'user_day_calls' => 500,
    'concurrent_calls' => 20,
    'user_concurrent_calls' => 2,
];
