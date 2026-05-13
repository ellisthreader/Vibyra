<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Vibyra Level Progression
    |--------------------------------------------------------------------------
    |
    | Levels are intentionally account-owned and conservative. XP is useful for
    | engagement and status, while automatic monetary value stays bounded to
    | small credit rewards that are auditable in the credit ledger.
    |
    */

    'threshold_base_xp' => 120,
    'daily_xp_cap' => 500,
    'map_min_level' => 100,

    'actions' => [
        'daily_login' => 15,
        'coding_prompt' => 10,
        'coding_agent_completed' => 80,
        'cloud_chat_completed' => 40,
        'community_like' => 4,
        'community_comment' => 20,
        'community_post' => 60,
        'community_open_app' => 8,
    ],

    'reward_credits' => [
        2 => 5,
        3 => 10,
        5 => 25,
        8 => 50,
        13 => 100,
        20 => 150,
        30 => 250,
        40 => 350,
        50 => 500,
        60 => 650,
        75 => 800,
        100 => 1000,
    ],
];
