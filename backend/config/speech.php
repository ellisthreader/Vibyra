<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Spoken replies
    |--------------------------------------------------------------------------
    |
    | The voice Vibyra reads answers in, and what a read costs. Priced per
    | character because that is how the upstream bills it; `CreditDeductor`
    | turns the dollars into credits at the usual rate.
    |
    */

    'model' => env('VIBYRA_SPEECH_MODEL', 'gpt-4o-mini-tts'),

    'voice' => env('VIBYRA_SPEECH_VOICE', 'alloy'),

    'usd_per_1k_chars' => (float) env('VIBYRA_SPEECH_USD_PER_1K_CHARS', 0.015),
];
