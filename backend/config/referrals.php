<?php

return [
    'invite_base_url' => env('VIBYRA_REFERRAL_URL', 'https://vibyra.app/invite'),

    'rewards' => [
        'referred_signup_credits' => 25,
        'referrer_signup_credits' => 50,
        'referred_paid_credits' => 100,
        'referrer_paid_credits' => 150,
    ],
];
