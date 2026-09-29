<?php

return [
    'signing_seed' => env('VIBYRA_REMOTE_SIGNING_SEED'),
    'email_notifications' => (bool) env('VIBYRA_SECURITY_EMAIL_NOTIFICATIONS', true),
    'rp_id' => env('VIBYRA_PASSKEY_RP_ID', parse_url(env('APP_URL', 'http://localhost'), PHP_URL_HOST)),
    'origin' => rtrim(env('VIBYRA_PASSKEY_ORIGIN', env('APP_URL', 'http://localhost')), '/'),
    'strong_auth_seconds' => 300,
    'ceremony_seconds' => 300,
    'session_idle_seconds' => (int) env('VIBYRA_REMOTE_SESSION_IDLE_SECONDS', 1800),
];
